begin;

-- A table round is a private, consent-based event schedule. It never grants
-- membership, shares contact details, or changes the event entry pass.
create table public.event_round_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table public.event_round_preferences (
  event_id uuid not null,
  user_id uuid not null,
  opted_in boolean not null default false,
  interest text not null default '' check (char_length(interest) <= 280),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id)
    references public.event_memberships(event_id, user_id) on delete cascade
);
create table public.event_rounds (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 100),
  prompt text not null check (char_length(prompt) between 10 and 280),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'changes_requested', 'approved', 'paused')),
  review_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (id, event_id),
  check (ends_at > starts_at)
);
create index event_rounds_event_time_idx
  on public.event_rounds(event_id, starts_at);
create table public.event_round_tables (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.event_rounds(id) on delete cascade,
  label text not null check (char_length(label) between 2 and 60),
  capacity integer not null check (capacity between 2 and 8),
  unique (id, round_id),
  unique (round_id, label)
);
create table public.event_round_seats (
  round_id uuid not null,
  event_id uuid not null,
  table_id uuid not null,
  user_id uuid not null,
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  primary key (round_id, user_id),
  foreign key (round_id, event_id)
    references public.event_rounds(id, event_id) on delete cascade,
  foreign key (table_id, round_id)
    references public.event_round_tables(id, round_id) on delete cascade,
  foreign key (event_id, user_id)
    references public.event_memberships(event_id, user_id) on delete cascade
);
create index event_round_seats_user_idx
  on public.event_round_seats(user_id, event_id);

alter table public.event_round_settings enable row level security;
alter table public.event_round_preferences enable row level security;
alter table public.event_rounds enable row level security;
alter table public.event_round_tables enable row level security;
alter table public.event_round_seats enable row level security;
revoke all on public.event_round_settings, public.event_round_preferences,
  public.event_rounds, public.event_round_tables, public.event_round_seats
  from public, anon, authenticated;

create or replace function public.can_attend_event_round(p_event_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_memberships attendee
    join public.events event on event.id = attendee.event_id
    join public.profiles profile on profile.id = attendee.user_id
    where attendee.event_id = p_event_id and attendee.user_id = p_user_id
      and attendee.status in ('confirmed', 'attended')
      and event.status in ('published', 'completed')
      and event.ends_at >= now() - interval '14 days'
      and profile.access_status in ('active', 'pending')
      and not profile.visibility_paused
  );
$$;
revoke all on function public.can_attend_event_round(uuid, uuid) from public;

create or replace function public.can_use_event_round(p_event_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_attend_event_round(p_event_id, p_user_id)
    and exists (select 1 from public.event_round_settings setting
                where setting.event_id = p_event_id and setting.enabled);
$$;
revoke all on function public.can_use_event_round(uuid, uuid) from public;

create or replace function public.can_plan_event_round(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_host_event(p_event_id)
    or public.is_admin(array['super_admin']::public.app_role[]);
$$;
revoke all on function public.can_plan_event_round(uuid) from public;

create or replace function public.get_my_event_round_status(p_event_id uuid)
returns table(enabled boolean, opted_in boolean, interest text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_attend_event_round(p_event_id, auth.uid()) then
    raise exception 'A confirmed event place is required';
  end if;
  return query
  select coalesce(setting.enabled, false), coalesce(preference.opted_in, false),
         coalesce(preference.interest, '')
  from (select 1) anchor
  left join public.event_round_settings setting on setting.event_id = p_event_id
  left join public.event_round_preferences preference
    on preference.event_id = p_event_id and preference.user_id = auth.uid();
end;
$$;
revoke all on function public.get_my_event_round_status(uuid) from public;
grant execute on function public.get_my_event_round_status(uuid) to authenticated;

create or replace function public.get_event_round_enabled(p_event_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  return coalesce((select setting.enabled from public.event_round_settings setting
                   where setting.event_id = p_event_id), false);
end;
$$;
revoke all on function public.get_event_round_enabled(uuid) from public;
grant execute on function public.get_event_round_enabled(uuid) to authenticated;

create or replace function public.set_event_round_enabled(p_event_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if coalesce(p_enabled, false) and not exists (
    select 1 from public.events event where event.id = p_event_id
      and event.status = 'published' and event.ends_at > now()
  ) then raise exception 'Publish a future event before opening table rounds'; end if;
  insert into public.event_round_settings(event_id, enabled, updated_by)
  values (p_event_id, coalesce(p_enabled, false), auth.uid())
  on conflict(event_id) do update set enabled = excluded.enabled,
    updated_by = excluded.updated_by, updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), case when coalesce(p_enabled, false)
    then 'event.rounds_opened' else 'event.rounds_paused' end, 'event', p_event_id);
end;
$$;
revoke all on function public.set_event_round_enabled(uuid, boolean) from public;
grant execute on function public.set_event_round_enabled(uuid, boolean) to authenticated;

create or replace function public.save_my_event_round_interest(
  p_event_id uuid, p_opted_in boolean, p_interest text
)
returns void language plpgsql security definer set search_path = '' as $$
declare normalized text := trim(coalesce(p_interest, ''));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if coalesce(p_opted_in, false) and not public.can_use_event_round(p_event_id, auth.uid()) then
    raise exception 'Table rounds are not open to you';
  end if;
  if coalesce(p_opted_in, false) and not exists (
    select 1 from public.events event where event.id = p_event_id
      and event.status = 'published' and event.ends_at > now()
  ) then raise exception 'This event can no longer accept table requests'; end if;
  if not exists (select 1 from public.event_memberships
                 where event_id = p_event_id and user_id = auth.uid()) then
    raise exception 'An event place is required';
  end if;
  if char_length(normalized) > 280 or
     (coalesce(p_opted_in, false) and char_length(normalized) < 10) then
    raise exception 'Write 10 to 280 characters about what you hope to discuss';
  end if;
  if normalized ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[a-z]{2,})'
     or normalized ~ '[+]?[0-9][0-9 ()-]{7,}[0-9]' then
    raise exception 'Keep contact details and links out of your table note';
  end if;
  insert into public.event_round_preferences(event_id, user_id, opted_in, interest)
  values (p_event_id, auth.uid(), coalesce(p_opted_in, false), normalized)
  on conflict(event_id, user_id) do update set opted_in = excluded.opted_in,
    interest = excluded.interest, updated_at = now();
  if not coalesce(p_opted_in, false) then
    delete from public.event_round_seats
    where event_id = p_event_id and user_id = auth.uid();
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), case when coalesce(p_opted_in, false)
    then 'event.round_interest_saved' else 'event.round_opted_out' end,
    'event', p_event_id);
end;
$$;
revoke all on function public.save_my_event_round_interest(uuid, boolean, text) from public;
grant execute on function public.save_my_event_round_interest(uuid, boolean, text) to authenticated;

create or replace function public.list_event_round_volunteers(p_event_id uuid)
returns table(user_id uuid, display_name text, interest text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_plan_event_round(p_event_id) then
    raise exception 'Event Host or Super Admin required';
  end if;
  return query
  select preference.user_id,
         coalesce(nullif(trim(profile.display_name), ''), 'Event guest'),
         preference.interest
  from public.event_round_preferences preference
  join public.profiles profile on profile.id = preference.user_id
  where preference.event_id = p_event_id and preference.opted_in
    and public.can_use_event_round(p_event_id, preference.user_id)
  order by profile.display_name, preference.user_id
  limit 300;
end;
$$;
revoke all on function public.list_event_round_volunteers(uuid) from public;
grant execute on function public.list_event_round_volunteers(uuid) to authenticated;

create or replace function public.get_event_round_plan(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare plan jsonb;
begin
  if not public.can_plan_event_round(p_event_id) then
    raise exception 'Event Host or Super Admin required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', round.id, 'title', round.title, 'prompt', round.prompt,
    'starts_at', round.starts_at, 'ends_at', round.ends_at,
    'status', round.status, 'review_note', round.review_note,
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', table_row.id, 'label', table_row.label, 'capacity', table_row.capacity,
        'seats', coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', seat.user_id,
            'display_name', case when public.is_admin(array['super_admin']::public.app_role[])
              or (coalesce(preference.opted_in, false)
                and public.can_use_event_round(p_event_id, seat.user_id))
              then coalesce(nullif(trim(profile.display_name), ''), 'Event guest')
              else 'Guest unavailable' end
          ) order by profile.display_name)
          from public.event_round_seats seat
          join public.profiles profile on profile.id = seat.user_id
          left join public.event_round_preferences preference
            on preference.event_id = seat.event_id and preference.user_id = seat.user_id
          where seat.table_id = table_row.id
        ), '[]'::jsonb)
      ) order by table_row.label)
      from public.event_round_tables table_row where table_row.round_id = round.id
    ), '[]'::jsonb)
  ) order by round.starts_at), '[]'::jsonb) into plan
  from public.event_rounds round where round.event_id = p_event_id;
  return plan;
end;
$$;
revoke all on function public.get_event_round_plan(uuid) from public;
grant execute on function public.get_event_round_plan(uuid) to authenticated;

create or replace function public.save_event_round(
  p_event_id uuid, p_round_id uuid, p_title text, p_prompt text,
  p_starts_at timestamptz, p_ends_at timestamptz
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; event_row public.events%rowtype;
begin
  if not public.can_plan_event_round(p_event_id) then
    raise exception 'Event Host or Super Admin required';
  end if;
  select * into event_row from public.events where id = p_event_id for update;
  if not found or event_row.status <> 'published' or event_row.ends_at <= now() then
    raise exception 'A published upcoming event is required';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 5 and 100 or
     char_length(trim(coalesce(p_prompt, ''))) not between 10 and 280 or
     p_starts_at is null or p_ends_at is null or
     p_starts_at <= now() or p_starts_at < event_row.starts_at or
     p_ends_at > event_row.ends_at or
     p_ends_at - p_starts_at not between interval '10 minutes' and interval '60 minutes' then
    raise exception 'Keep this 10-to-60-minute round within the event time';
  end if;
  if p_round_id is null and
     (select count(*) from public.event_rounds where event_id = p_event_id) >= 12 then
    raise exception 'This event already has the maximum number of table rounds';
  end if;
  if exists (
    select 1 from public.event_rounds other
    where other.event_id = p_event_id and (p_round_id is null or other.id <> p_round_id)
      and other.status <> 'paused'
      and tstzrange(other.starts_at, other.ends_at, '[)') &&
          tstzrange(p_starts_at, p_ends_at, '[)')
  ) then raise exception 'Another table round already uses this time'; end if;
  if p_round_id is null then
    insert into public.event_rounds(event_id, title, prompt, starts_at, ends_at, created_by)
    values (p_event_id, trim(p_title), trim(p_prompt), p_starts_at, p_ends_at, auth.uid())
    returning id into saved_id;
  else
    update public.event_rounds set title = trim(p_title), prompt = trim(p_prompt),
      starts_at = p_starts_at, ends_at = p_ends_at, status = 'draft',
      review_note = null, updated_at = now()
    where id = p_round_id and event_id = p_event_id
      and status in ('draft', 'changes_requested') returning id into saved_id;
    if saved_id is null then raise exception 'This round cannot be edited now'; end if;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_event_round(uuid, uuid, text, text, timestamptz, timestamptz) from public;
grant execute on function public.save_event_round(uuid, uuid, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.save_event_round_table(
  p_round_id uuid, p_table_id uuid, p_label text, p_capacity integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target public.event_rounds%rowtype; saved_id uuid;
begin
  select * into target from public.event_rounds where id = p_round_id for update;
  if not found or not public.can_plan_event_round(target.event_id) or
     target.status not in ('draft', 'changes_requested') then
    raise exception 'Editable Host round required';
  end if;
  if char_length(trim(coalesce(p_label, ''))) not between 2 and 60 or
     p_capacity not between 2 and 8 then
    raise exception 'Name the table and choose 2 to 8 places';
  end if;
  if p_table_id is null then
    if (select count(*) from public.event_round_tables where round_id = p_round_id) >= 30 then
      raise exception 'This round already has the maximum number of tables';
    end if;
    insert into public.event_round_tables(round_id, label, capacity)
    values (p_round_id, trim(p_label), p_capacity) returning id into saved_id;
  else
    update public.event_round_tables set label = trim(p_label), capacity = p_capacity
    where id = p_table_id and round_id = p_round_id
      and p_capacity >= (select count(*) from public.event_round_seats
                         where table_id = p_table_id)
    returning id into saved_id;
    if saved_id is null then raise exception 'Table not found or too few places'; end if;
  end if;
  return saved_id;
end;
$$;
revoke all on function public.save_event_round_table(uuid, uuid, text, integer) from public;
grant execute on function public.save_event_round_table(uuid, uuid, text, integer) to authenticated;

create or replace function public.remove_event_round_table(p_round_id uuid, p_table_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.event_rounds%rowtype;
begin
  select * into target from public.event_rounds where id = p_round_id for update;
  if not found or not public.can_plan_event_round(target.event_id) or
     target.status not in ('draft', 'changes_requested') then
    raise exception 'Editable Host round required';
  end if;
  delete from public.event_round_tables where id = p_table_id and round_id = p_round_id;
end;
$$;
revoke all on function public.remove_event_round_table(uuid, uuid) from public;
grant execute on function public.remove_event_round_table(uuid, uuid) to authenticated;

create or replace function public.delete_event_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.event_rounds%rowtype;
begin
  select * into target from public.event_rounds where id = p_round_id for update;
  if not found or not public.can_plan_event_round(target.event_id) or
     target.status not in ('draft', 'changes_requested') then
    raise exception 'Only a private round can be deleted';
  end if;
  delete from public.event_rounds where id = p_round_id;
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), 'event.round_draft_deleted', 'event_round', p_round_id);
end;
$$;
revoke all on function public.delete_event_round(uuid) from public;
grant execute on function public.delete_event_round(uuid) to authenticated;

create or replace function public.assign_event_round_seat(
  p_round_id uuid, p_table_id uuid, p_user_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.event_rounds%rowtype; chosen public.event_round_tables%rowtype;
begin
  select * into target from public.event_rounds where id = p_round_id for update;
  if not found or not public.can_plan_event_round(target.event_id) or
     target.status not in ('draft', 'changes_requested') then
    raise exception 'Editable Host round required';
  end if;
  select * into chosen from public.event_round_tables
  where id = p_table_id and round_id = p_round_id for update;
  if not found then raise exception 'Choose a table in this round'; end if;
  if not public.can_use_event_round(target.event_id, p_user_id) or not exists (
    select 1 from public.event_round_preferences preference
    where preference.event_id = target.event_id and preference.user_id = p_user_id
      and preference.opted_in
  ) then raise exception 'Only confirmed guests who opted in can be seated'; end if;
  if (select count(*) from public.event_round_seats
      where table_id = p_table_id and user_id <> p_user_id) >= chosen.capacity then
    raise exception 'This table is full';
  end if;
  if exists (
    select 1 from public.event_round_seats seat
    where seat.table_id = p_table_id and seat.user_id <> p_user_id
      and public.is_blocked_pair(seat.user_id, p_user_id)
  ) then raise exception 'These guests cannot be seated together'; end if;
  insert into public.event_round_seats(round_id, event_id, table_id, user_id, assigned_by)
  values (p_round_id, target.event_id, p_table_id, p_user_id, auth.uid())
  on conflict(round_id, user_id) do update set table_id = excluded.table_id,
    assigned_by = excluded.assigned_by, assigned_at = now();
end;
$$;
revoke all on function public.assign_event_round_seat(uuid, uuid, uuid) from public;
grant execute on function public.assign_event_round_seat(uuid, uuid, uuid) to authenticated;

create or replace function public.remove_event_round_seat(p_round_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.event_rounds%rowtype;
begin
  select * into target from public.event_rounds where id = p_round_id for update;
  if not found or not public.can_plan_event_round(target.event_id) or
     target.status not in ('draft', 'changes_requested') then
    raise exception 'Editable Host round required';
  end if;
  delete from public.event_round_seats where round_id = p_round_id and user_id = p_user_id;
end;
$$;
revoke all on function public.remove_event_round_seat(uuid, uuid) from public;
grant execute on function public.remove_event_round_seat(uuid, uuid) to authenticated;

create or replace function public.validate_event_round(p_round_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
declare target public.event_rounds%rowtype;
begin
  select * into target from public.event_rounds where id = p_round_id;
  if not found then raise exception 'Round not found'; end if;
  if not exists (select 1 from public.event_round_tables where round_id = p_round_id) or exists (
    select 1 from public.event_round_tables table_row
    where table_row.round_id = p_round_id and
      (select count(*) from public.event_round_seats seat
       where seat.table_id = table_row.id) not between 2 and table_row.capacity
  ) then raise exception 'Each table needs at least two opted-in guests'; end if;
  if exists (
    select 1 from public.event_round_seats seat
    left join public.event_round_preferences preference
      on preference.event_id = seat.event_id and preference.user_id = seat.user_id
    where seat.round_id = p_round_id
      and (not coalesce(preference.opted_in, false)
        or not public.can_use_event_round(target.event_id, seat.user_id))
  ) then raise exception 'A guest is no longer eligible or opted in'; end if;
  if exists (
    select 1 from public.event_round_seats first_seat
    join public.event_round_seats second_seat
      on second_seat.table_id = first_seat.table_id
      and second_seat.user_id > first_seat.user_id
    where first_seat.round_id = p_round_id
      and public.is_blocked_pair(first_seat.user_id, second_seat.user_id)
  ) then raise exception 'A blocked pair cannot share a table'; end if;
end;
$$;
revoke all on function public.validate_event_round(uuid) from public;

create or replace function public.submit_event_round(p_round_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.event_rounds%rowtype;
begin
  select * into target from public.event_rounds where id = p_round_id for update;
  if not found or not public.can_plan_event_round(target.event_id) or
     target.status not in ('draft', 'changes_requested') then
    raise exception 'Editable Host round required';
  end if;
  if target.starts_at <= now() then raise exception 'This table round has already started'; end if;
  perform public.validate_event_round(p_round_id);
  update public.event_rounds set status = 'submitted', submitted_at = now(),
    review_note = null, updated_at = now() where id = p_round_id;
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), 'event.round_submitted', 'event_round', p_round_id);
end;
$$;
revoke all on function public.submit_event_round(uuid) from public;
grant execute on function public.submit_event_round(uuid) to authenticated;

create or replace function public.review_event_round(
  p_round_id uuid, p_action text, p_note text
)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.event_rounds%rowtype; guest record; event_slug text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if p_action is null or p_action not in ('approve', 'request_changes', 'pause', 'restore') then
    raise exception 'Choose a round review action';
  end if;
  select * into target from public.event_rounds where id = p_round_id for update;
  if not found then raise exception 'Round not found'; end if;
  if (p_action = 'approve' and target.status <> 'submitted') or
     (p_action = 'request_changes' and target.status not in ('submitted', 'paused')) or
     (p_action = 'pause' and target.status <> 'approved') or
     (p_action = 'restore' and target.status <> 'paused') then
    raise exception 'This round is not awaiting that action';
  end if;
  if p_action in ('request_changes', 'pause') and
     char_length(trim(coalesce(p_note, ''))) not between 10 and 500 then
    raise exception 'Add a private reason of 10 to 500 characters';
  end if;
  if p_action in ('approve', 'restore') then
    if target.starts_at <= now() then
      raise exception 'This table round has already started';
    end if;
    perform public.validate_event_round(p_round_id);
  end if;
  update public.event_rounds set
    status = case p_action when 'approve' then 'approved'
                           when 'restore' then 'approved'
                           when 'pause' then 'paused'
                           else 'changes_requested' end,
    review_note = nullif(trim(coalesce(p_note, '')), ''),
    reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  where id = p_round_id;
  select slug into event_slug from public.events where id = target.event_id;
  if p_action in ('approve', 'restore', 'pause') then
    for guest in select seat.user_id from public.event_round_seats seat
                 where seat.round_id = p_round_id loop
      perform public.enqueue_notification(
        guest.user_id, 'event',
        case when p_action = 'pause' then 'Your event table plan has changed'
             else 'Your event table is ready' end,
        case when p_action = 'pause'
          then 'Your planned table round is paused. We will update you if it returns.'
          else 'Open your private event table schedule for the time and place.' end,
        '/events/' || event_slug || '/rounds',
        'event-round:' || p_round_id || ':' || p_action || ':' || guest.user_id || ':' || now()
      );
    end loop;
  end if;
  if p_action = 'request_changes' then
    perform public.enqueue_notification(
      (select host.user_id from public.event_hosts host where host.event_id = target.event_id),
      'event', 'Your table plan needs a change',
      'The event team left a private review note on your table round.',
      '/events/' || event_slug || '/rounds/host',
      'event-round-review:' || p_round_id || ':' || now()
    );
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.round_' || p_action, 'event_round', p_round_id,
          jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), '')));
end;
$$;
revoke all on function public.review_event_round(uuid, text, text) from public;
grant execute on function public.review_event_round(uuid, text, text) to authenticated;

create or replace function public.list_my_event_round_schedule(p_event_id uuid)
returns table(round_id uuid, title text, prompt text, starts_at timestamptz,
              ends_at timestamptz, table_label text, tablemates jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_event_round(p_event_id, auth.uid()) then
    raise exception 'A confirmed event place and open table rounds are required';
  end if;
  return query
  select round.id, round.title, round.prompt, round.starts_at, round.ends_at,
         table_row.label,
         coalesce((select jsonb_agg(jsonb_build_object(
           'name', coalesce(nullif(trim(profile.display_name), ''), 'Event guest'),
           'interest', preference.interest
         ) order by profile.display_name)
         from public.event_round_seats other
         join public.profiles profile on profile.id = other.user_id
         join public.event_round_preferences preference
           on preference.event_id = other.event_id and preference.user_id = other.user_id
         where other.table_id = table_row.id and other.user_id <> auth.uid()
           and preference.opted_in
           and public.can_use_event_round(p_event_id, other.user_id)
           and not public.is_blocked_pair(auth.uid(), other.user_id)
         ), '[]'::jsonb)
  from public.event_round_seats seat
  join public.event_rounds round on round.id = seat.round_id
  join public.event_round_tables table_row on table_row.id = seat.table_id
  where seat.event_id = p_event_id and seat.user_id = auth.uid()
    and round.status = 'approved'
    and exists (select 1 from public.event_round_preferences preference
                where preference.event_id = p_event_id
                  and preference.user_id = auth.uid() and preference.opted_in)
  order by round.starts_at;
end;
$$;
revoke all on function public.list_my_event_round_schedule(uuid) from public;
grant execute on function public.list_my_event_round_schedule(uuid) to authenticated;

create or replace function public.pause_event_round_for_safety(p_round_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.event_rounds%rowtype; event_slug text; recipient record;
begin
  update public.event_rounds set status = 'paused', review_note = p_reason,
    updated_at = now()
  where id = p_round_id and status = 'approved' returning * into target;
  if not found then return; end if;
  select slug into event_slug from public.events where id = target.event_id;
  for recipient in select distinct seat.user_id from public.event_round_seats seat
                   where seat.round_id = p_round_id loop
    perform public.enqueue_notification(
      recipient.user_id, 'event', 'Your event table plan has changed',
      'Your table round has been paused. The event team will update your private schedule.',
      '/events/' || event_slug || '/rounds',
      'event-round-safety:' || p_round_id || ':' || recipient.user_id || ':' || now()
    );
  end loop;
  for recipient in select roles.user_id from public.user_roles roles
                   where roles.role = 'super_admin' loop
    perform public.enqueue_notification(
      recipient.user_id, 'event', 'Review a paused event table round',
      'A table plan was paused automatically after a guest safety or attendance change.',
      '/admin/events',
      'event-round-admin-safety:' || p_round_id || ':' || recipient.user_id || ':' || now()
    );
  end loop;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'event.round_auto_paused', 'event_round', p_round_id,
          jsonb_build_object('reason', p_reason));
end;
$$;
revoke all on function public.pause_event_round_for_safety(uuid, text) from public;

create or replace function public.pause_rounds_after_event_block()
returns trigger language plpgsql security definer set search_path = '' as $$
declare matching record;
begin
  for matching in
    select distinct round.id from public.event_rounds round
    join public.event_round_seats first_seat on first_seat.round_id = round.id
      and first_seat.user_id = new.blocker_id
    join public.event_round_seats second_seat on second_seat.round_id = round.id
      and second_seat.table_id = first_seat.table_id
      and second_seat.user_id = new.blocked_id
    where round.status = 'approved'
  loop
    perform public.pause_event_round_for_safety(
      matching.id, 'A guest safety block requires a new table plan');
  end loop;
  return new;
end;
$$;
create trigger pause_event_rounds_after_block
  after insert or update on public.member_blocks
  for each row execute function public.pause_rounds_after_event_block();

create or replace function public.pause_rounds_after_place_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare matching record;
begin
  if old.status in ('confirmed', 'attended') and
     new.status not in ('confirmed', 'attended') then
    for matching in
      select distinct round.id from public.event_rounds round
      join public.event_round_seats seat on seat.round_id = round.id
      where seat.event_id = new.event_id and seat.user_id = new.user_id
        and round.status = 'approved'
    loop
      perform public.pause_event_round_for_safety(
        matching.id, 'A guest place changed; review the table plan');
    end loop;
  end if;
  return new;
end;
$$;
create trigger pause_event_rounds_after_place_change
  after update of status on public.event_memberships
  for each row execute function public.pause_rounds_after_place_change();

create or replace function public.pause_rounds_after_profile_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare matching record;
begin
  if new.access_status not in ('active', 'pending') or new.visibility_paused then
    for matching in
      select distinct round.id from public.event_rounds round
      join public.event_round_seats seat on seat.round_id = round.id
      where seat.user_id = new.id and round.status = 'approved'
    loop
      perform public.pause_event_round_for_safety(
        matching.id, 'A guest account changed; review the table plan');
    end loop;
  end if;
  return new;
end;
$$;
create trigger pause_event_rounds_after_profile_change
  after update of access_status, visibility_paused on public.profiles
  for each row
  when (old.access_status is distinct from new.access_status
    or old.visibility_paused is distinct from new.visibility_paused)
  execute function public.pause_rounds_after_profile_change();

create or replace function public.pause_rounds_after_seat_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.pause_event_round_for_safety(
    old.round_id, 'A guest left this table; review the plan');
  return old;
end;
$$;
create trigger pause_event_rounds_after_seat_removal
  after delete on public.event_round_seats
  for each row execute function public.pause_rounds_after_seat_removal();

commit;
