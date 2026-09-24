begin;

-- This is an event-only introduction. The QR never contains an entry-pass
-- credential, contact details or permission to enter the member network.
create table public.event_intro_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.event_intro_cards (
  event_id uuid not null,
  user_id uuid not null,
  code text not null unique check (code ~ '^[0-9A-F]{16}$'),
  enabled boolean not null default false,
  introduction text not null default '' check (char_length(introduction) <= 280),
  paused_at timestamptz,
  pause_reason text,
  updated_at timestamptz not null default now(),
  primary key(event_id, user_id),
  foreign key(event_id, user_id)
    references public.event_memberships(event_id, user_id) on delete cascade
);
create table public.event_intro_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(event_id, user_low, user_high),
  check (user_low < user_high and requested_by in (user_low, user_high))
);
create index event_intro_requests_user_low_idx
  on public.event_intro_requests(user_low, event_id, created_at desc);
create index event_intro_requests_user_high_idx
  on public.event_intro_requests(user_high, event_id, created_at desc);
alter table public.event_intro_cards enable row level security;
alter table public.event_intro_requests enable row level security;
alter table public.event_intro_settings enable row level security;
revoke all on public.event_intro_cards, public.event_intro_requests
  from public, anon, authenticated;
revoke all on public.event_intro_settings from public, anon, authenticated;
grant select on public.event_intro_cards, public.event_intro_requests to authenticated;
grant select on public.event_intro_settings to authenticated;
create policy "Event team reads introduction setting"
  on public.event_intro_settings for select to authenticated
  using (public.can_manage_event(event_id));
create policy "Attendees read own event introduction card"
  on public.event_intro_cards for select to authenticated
  using (user_id = auth.uid());

create or replace function public.can_use_event_intro(p_event_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_memberships attendee
    join public.events event on event.id = attendee.event_id
    join public.profiles profile on profile.id = attendee.user_id
    join public.event_intro_settings setting on setting.event_id = attendee.event_id
    where attendee.event_id = p_event_id and attendee.user_id = p_user_id
      and attendee.status in ('confirmed', 'attended')
      and event.status in ('published', 'completed')
      and event.ends_at >= now() - interval '14 days'
      and setting.enabled
      and profile.access_status in ('active', 'pending')
      and not profile.visibility_paused
  );
$$;
revoke all on function public.can_use_event_intro(uuid, uuid) from public;
grant execute on function public.can_use_event_intro(uuid, uuid) to authenticated;
create policy "Attendees read own event introduction requests"
  on public.event_intro_requests for select to authenticated
  using (
    auth.uid() in (user_low, user_high)
    and public.can_use_event_intro(event_id, auth.uid())
    and not public.is_blocked_pair(user_low, user_high)
  );

create or replace function public.get_event_intro_enabled(p_event_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[])
    or not public.can_manage_event(p_event_id) then
    raise exception 'Super Admin required';
  end if;
  return coalesce((select setting.enabled from public.event_intro_settings setting
                   where setting.event_id = p_event_id), false);
end;
$$;
revoke all on function public.get_event_intro_enabled(uuid) from public;
grant execute on function public.get_event_intro_enabled(uuid) to authenticated;

create or replace function public.set_event_intro_enabled(p_event_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[])
    or not public.can_manage_event(p_event_id) then
    raise exception 'Super Admin required';
  end if;
  if coalesce(p_enabled, false) and not exists (
    select 1 from public.events event where event.id = p_event_id
      and event.status = 'published' and event.ends_at > now()
  ) then raise exception 'Publish a future event before opening introductions'; end if;
  insert into public.event_intro_settings(event_id, enabled, updated_by)
  values (p_event_id, coalesce(p_enabled, false), auth.uid())
  on conflict(event_id) do update set enabled = excluded.enabled,
    updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), case when coalesce(p_enabled, false)
    then 'event.introductions_opened' else 'event.introductions_paused' end,
    'event', p_event_id);
end;
$$;
revoke all on function public.set_event_intro_enabled(uuid, boolean) from public;
grant execute on function public.set_event_intro_enabled(uuid, boolean) to authenticated;

create or replace function public.get_my_event_intro_card(p_event_id uuid)
returns table(code text, enabled boolean, introduction text,
              paused_at timestamptz, pause_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_event_intro(p_event_id, auth.uid()) then
    raise exception 'A confirmed event place is required';
  end if;
  return query select card.code, card.enabled, card.introduction,
                      card.paused_at, card.pause_reason
  from public.event_intro_cards card
  where card.event_id = p_event_id and card.user_id = auth.uid();
end;
$$;
revoke all on function public.get_my_event_intro_card(uuid) from public;
grant execute on function public.get_my_event_intro_card(uuid) to authenticated;

create or replace function public.save_event_intro_card(
  p_event_id uuid, p_enabled boolean, p_introduction text, p_rotate boolean default false
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  normalized text := trim(coalesce(p_introduction, ''));
  saved_code text;
begin
  if not public.can_use_event_intro(p_event_id, auth.uid()) then
    raise exception 'A confirmed event place is required';
  end if;
  if char_length(normalized) > 280 or
    (coalesce(p_enabled, false) and char_length(normalized) < 10) then
    raise exception 'Write an introduction between 10 and 280 characters';
  end if;
  if normalized ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,})' then
    raise exception 'Keep links and contact details out of the introduction';
  end if;
  select card.code into saved_code from public.event_intro_cards card
  where card.event_id = p_event_id and card.user_id = auth.uid() for update;
  if coalesce(p_enabled, false) and exists (
    select 1 from public.event_intro_cards card
    where card.event_id = p_event_id and card.user_id = auth.uid()
      and card.paused_at is not null
  ) then raise exception 'The event team has paused this introduction card'; end if;
  if saved_code is null or coalesce(p_rotate, false) then
    saved_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  end if;
  insert into public.event_intro_cards(event_id, user_id, code, enabled, introduction)
  values (p_event_id, auth.uid(), saved_code, coalesce(p_enabled, false), normalized)
  on conflict(event_id, user_id) do update set
    code = excluded.code, enabled = excluded.enabled,
    introduction = excluded.introduction, updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.intro_card_saved', 'event', p_event_id,
          jsonb_build_object('enabled', coalesce(p_enabled, false),
                             'rotated', coalesce(p_rotate, false)));
  return saved_code;
end;
$$;
revoke all on function public.save_event_intro_card(uuid, boolean, text, boolean) from public;
grant execute on function public.save_event_intro_card(uuid, boolean, text, boolean) to authenticated;

create or replace function public.resolve_event_intro_card(p_event_id uuid, p_code text)
returns table(user_id uuid, display_name text, introduction text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_event_intro(p_event_id, auth.uid()) then
    raise exception 'A confirmed event place is required';
  end if;
  return query
  select card.user_id, coalesce(nullif(trim(profile.display_name), ''), 'Event guest'),
         card.introduction
  from public.event_intro_cards card
  join public.profiles profile on profile.id = card.user_id
  where card.event_id = p_event_id and card.code = upper(trim(coalesce(p_code, '')))
    and card.enabled and card.user_id <> auth.uid()
    and public.can_use_event_intro(p_event_id, card.user_id)
    and not public.is_blocked_pair(auth.uid(), card.user_id);
end;
$$;
revoke all on function public.resolve_event_intro_card(uuid, text) from public;
grant execute on function public.resolve_event_intro_card(uuid, text) to authenticated;

create or replace function public.request_event_intro(p_event_id uuid, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  event_slug text;
  saved_id uuid;
begin
  select card.user_id into recipient
  from public.resolve_event_intro_card(p_event_id, p_code) card;
  if recipient is null then raise exception 'This introduction code is not available'; end if;
  if exists (
    select 1 from public.event_intro_requests request
    where request.event_id = p_event_id
      and request.user_low = least(auth.uid(), recipient)
      and request.user_high = greatest(auth.uid(), recipient)
  ) then raise exception 'An introduction request already exists for this pair'; end if;
  insert into public.event_intro_requests(
    event_id, user_low, user_high, requested_by
  ) values (
    p_event_id, least(auth.uid(), recipient), greatest(auth.uid(), recipient), auth.uid()
  ) returning id into saved_id;
  select slug into event_slug from public.events where id = p_event_id;
  perform public.enqueue_notification(
    recipient, 'event', 'Someone would like to meet you',
    'A confirmed guest at your event sent an introduction request. You decide whether to accept.',
    '/events/' || event_slug || '/meet', 'event-intro-request:' || saved_id
  );
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.intro_requested', 'event', p_event_id,
          jsonb_build_object('request_id', saved_id));
end;
$$;
revoke all on function public.request_event_intro(uuid, text) from public;
grant execute on function public.request_event_intro(uuid, text) to authenticated;

create or replace function public.list_my_event_intros(p_event_id uuid)
returns table(request_id uuid, other_user_id uuid, other_name text,
              direction text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_event_intro(p_event_id, auth.uid()) then
    raise exception 'A confirmed event place is required';
  end if;
  return query
  select request.id,
         case when request.user_low = auth.uid() then request.user_high else request.user_low end,
         coalesce(nullif(trim(profile.display_name), ''), 'Event guest'),
         case when request.requested_by = auth.uid() then 'sent' else 'received' end,
         request.status, request.created_at
  from public.event_intro_requests request
  join public.profiles profile on profile.id =
    case when request.user_low = auth.uid() then request.user_high else request.user_low end
  where request.event_id = p_event_id
    and auth.uid() in (request.user_low, request.user_high)
    and public.can_use_event_intro(
      p_event_id,
      case when request.user_low = auth.uid() then request.user_high else request.user_low end
    )
    and not public.is_blocked_pair(request.user_low, request.user_high)
  order by request.created_at desc limit 100;
end;
$$;
revoke all on function public.list_my_event_intros(uuid) from public;
grant execute on function public.list_my_event_intros(uuid) to authenticated;

create or replace function public.review_event_intro(p_request_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.event_intro_requests%rowtype;
  recipient uuid;
  event_slug text;
begin
  if p_action is null or p_action not in ('accept', 'decline') then
    raise exception 'Choose accept or decline';
  end if;
  select * into target from public.event_intro_requests
  where id = p_request_id for update;
  if not found or target.status <> 'pending' then
    raise exception 'This introduction request is no longer awaiting a decision';
  end if;
  recipient := case when target.user_low = target.requested_by
    then target.user_high else target.user_low end;
  if auth.uid() is distinct from recipient then
    raise exception 'Only the recipient can decide';
  end if;
  if p_action = 'accept' and (
    not public.can_use_event_intro(target.event_id, target.requested_by)
    or not public.can_use_event_intro(target.event_id, recipient)
    or public.is_blocked_pair(target.user_low, target.user_high)
    or not exists (
      select 1 from public.event_intro_cards card
      where card.event_id = target.event_id and card.user_id = recipient
        and card.enabled
    )
  ) then raise exception 'This introduction is no longer available'; end if;
  update public.event_intro_requests
  set status = case when p_action = 'accept' then 'accepted' else 'declined' end,
      responded_at = now(), updated_at = now()
  where id = p_request_id;
  select slug into event_slug from public.events where id = target.event_id;
  perform public.enqueue_notification(
    target.requested_by, 'event',
    case when p_action = 'accept' then 'Your introduction was accepted'
         else 'Introduction update' end,
    case when p_action = 'accept'
      then 'You both agreed to meet at the event. Open your introduction card to see the update.'
      else 'Your introduction request was not accepted. Please respect her choice.' end,
    '/events/' || event_slug || '/meet',
    'event-intro-reviewed:' || p_request_id
  );
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), 'event.intro_' || p_action, 'event_intro_request', p_request_id);
end;
$$;
revoke all on function public.review_event_intro(uuid, text) from public;
grant execute on function public.review_event_intro(uuid, text) to authenticated;

create or replace function public.close_event_intro_card(
  p_event_id uuid, p_user_id uuid, p_reason text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Event team access required';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 500 then
    raise exception 'Add a short reason for closing the card';
  end if;
  update public.event_intro_cards
  set enabled = false, paused_at = now(), pause_reason = trim(p_reason), updated_at = now()
  where event_id = p_event_id and user_id = p_user_id;
  if not found then raise exception 'Introduction card not found'; end if;
  perform public.enqueue_notification(
    p_user_id, 'event', 'Your event introduction is paused',
    'The event team paused your introduction card. Contact support if you need help.',
    '/events', 'event-intro-closed:' || p_event_id || ':' || p_user_id || ':' || now()
  );
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.intro_card_closed', 'event', p_event_id,
          jsonb_build_object('user_id', p_user_id, 'reason', trim(p_reason)));
end;
$$;
revoke all on function public.close_event_intro_card(uuid, uuid, text) from public;
grant execute on function public.close_event_intro_card(uuid, uuid, text) to authenticated;

create or replace function public.restore_event_intro_card(p_event_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Event team access required';
  end if;
  update public.event_intro_cards
  set paused_at = null, pause_reason = null, updated_at = now()
  where event_id = p_event_id and user_id = p_user_id and paused_at is not null;
  if not found then raise exception 'Paused introduction card not found'; end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.intro_card_restored', 'event', p_event_id,
          jsonb_build_object('user_id', p_user_id));
end;
$$;
revoke all on function public.restore_event_intro_card(uuid, uuid) from public;
grant execute on function public.restore_event_intro_card(uuid, uuid) to authenticated;

create or replace function public.list_admin_event_intro_cards(p_event_id uuid)
returns table(user_id uuid, display_name text, enabled boolean,
              introduction text, paused_at timestamptz, pause_reason text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Event team access required';
  end if;
  return query
  select card.user_id, coalesce(nullif(trim(profile.display_name), ''), 'Event guest'),
         card.enabled, card.introduction, card.paused_at, card.pause_reason
  from public.event_intro_cards card
  join public.profiles profile on profile.id = card.user_id
  where card.event_id = p_event_id
  order by card.updated_at desc limit 200;
end;
$$;
revoke all on function public.list_admin_event_intro_cards(uuid) from public;
grant execute on function public.list_admin_event_intro_cards(uuid) to authenticated;

commit;
