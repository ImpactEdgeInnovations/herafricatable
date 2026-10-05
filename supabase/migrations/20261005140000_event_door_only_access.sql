begin;

-- Door access is intentionally separate from event_staff. That existing role can
-- see registrations, orders and refunds; a check-in lead needs none of those.
create table public.event_door_staff (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_door_staff_user_idx on public.event_door_staff(user_id, event_id);
alter table public.event_door_staff enable row level security;

create or replace function public.can_operate_event_door(p_event_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.can_manage_event(p_event_id)
    or exists (
      select 1 from public.event_door_staff ds
      join public.profiles p on p.id = ds.user_id
      join public.events e on e.id = ds.event_id
      where ds.event_id = p_event_id and ds.user_id = auth.uid()
        and p.access_status = 'active' and e.status = 'published'
    )
  );
$$;
revoke all on function public.can_operate_event_door(uuid) from public;
grant execute on function public.can_operate_event_door(uuid) to authenticated;

create or replace function public.manage_event_door_staff(p_event_id uuid, p_email text, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  person uuid;
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if actor is null or not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if p_action not in ('assign', 'remove') then raise exception 'Choose assign or remove'; end if;
  if normalized_email = '' then raise exception 'Email is required'; end if;
  if not exists (select 1 from public.events where id = p_event_id and status in ('draft', 'published')) then
    raise exception 'An active event is required';
  end if;
  select u.id into person from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = normalized_email and u.email_confirmed_at is not null
    and p.access_status = 'active';
  if person is null then raise exception 'A verified, active account is required'; end if;

  if p_action = 'assign' then
    insert into public.event_door_staff(event_id, user_id, assigned_by)
    values (p_event_id, person, actor)
    on conflict (event_id, user_id) do update
      set assigned_by = excluded.assigned_by, assigned_at = now();
  else
    delete from public.event_door_staff where event_id = p_event_id and user_id = person;
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, case when p_action = 'assign' then 'event.door_staff_assigned' else 'event.door_staff_removed' end,
    'event', p_event_id, jsonb_build_object('user_id', person));
end;
$$;
revoke all on function public.manage_event_door_staff(uuid, text, text) from public;
grant execute on function public.manage_event_door_staff(uuid, text, text) to authenticated;

create or replace function public.list_event_door_staff(p_event_id uuid)
returns table(user_id uuid, email text, display_name text, assigned_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then raise exception 'Super Admin required'; end if;
  return query select ds.user_id, u.email::text, p.display_name, ds.assigned_at
    from public.event_door_staff ds
    join auth.users u on u.id = ds.user_id
    left join public.profiles p on p.id = ds.user_id
    where ds.event_id = p_event_id order by ds.assigned_at;
end;
$$;
revoke all on function public.list_event_door_staff(uuid) from public;
grant execute on function public.list_event_door_staff(uuid) to authenticated;

create or replace function public.get_my_event_door(p_slug text)
returns table(event_id uuid, event_slug text, event_title text, starts_at timestamptz,
  ends_at timestamptz, timezone text, venue_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select e.id, e.slug, e.title, e.starts_at, e.ends_at, e.timezone, v.name
    from public.events e left join public.venues v on v.id = e.venue_id
    where e.slug = p_slug and public.can_operate_event_door(e.id);
end;
$$;
revoke all on function public.get_my_event_door(text) from public;
grant execute on function public.get_my_event_door(text) to authenticated;

-- This deliberately does not expose the guest roster or reversal function.
-- It returns only the one attendee presented at the door after a valid pass.
create or replace function public.door_check_in_event_member(
  p_event_id uuid, p_credential text, p_method text, p_device_label text default null
)
returns table(outcome text, message text, attendee_name text, checked_in_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  evt public.events%rowtype;
  credential public.event_checkin_credentials%rowtype;
  token text := trim(coalesce(p_credential, ''));
  existing public.event_checkins%rowtype;
  saved public.event_checkins%rowtype;
  name text;
  recent_attempts integer;
begin
  if actor is null or not public.can_operate_event_door(p_event_id) then raise exception 'Not authorized'; end if;
  if p_method not in ('qr', 'manual') then raise exception 'Unsupported check-in method'; end if;
  if char_length(token) > 180 then raise exception 'Invalid credential'; end if;
  select count(*) into recent_attempts from public.event_checkin_attempts
    where staff_id = actor and attempted_at > now() - interval '15 minutes';
  if recent_attempts >= 200 then raise exception 'Check-in rate limit reached. Wait before trying again.'; end if;
  select * into evt from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  if evt.status <> 'published' then raise exception 'Check-in is not open for this event'; end if;
  if now() < evt.starts_at - interval '8 hours' or now() > evt.ends_at + interval '12 hours' then
    insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
      values (p_event_id, actor, 'not_open', p_method);
    return query select 'not_open'::text, 'Check-in is not open for this event.'::text,
      null::text, null::timestamptz;
    return;
  end if;
  if p_method = 'qr' then
    if token like 'HATCHECKIN:%:%' then
      if split_part(token, ':', 2) <> p_event_id::text then token := ''; else token := split_part(token, ':', 3); end if;
    end if;
    select * into credential from public.event_checkin_credentials c
      where c.event_id = p_event_id and c.qr_token = token and c.revoked_at is null and c.expires_at >= now();
  else
    select * into credential from public.event_checkin_credentials c
      where c.event_id = p_event_id and c.manual_code = upper(token) and c.revoked_at is null and c.expires_at >= now();
  end if;
  if not found or not exists (select 1 from public.event_memberships m
      where m.event_id = p_event_id and m.user_id = credential.user_id and m.status in ('confirmed', 'attended')) then
    insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
      values (p_event_id, actor, 'not_found', p_method);
    return query select 'not_found'::text, 'Pass not recognized for this event.'::text,
      null::text, null::timestamptz;
    return;
  end if;
  select coalesce(nullif(trim(p.display_name), ''), split_part(u.email::text, '@', 1)) into name
    from auth.users u left join public.profiles p on p.id = u.id where u.id = credential.user_id;
  select * into existing from public.event_checkins c
    where c.event_id = p_event_id and c.user_id = credential.user_id and c.reversed_at is null;
  if existing.id is not null then
    insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
      values (p_event_id, actor, 'already_checked_in', p_method);
    return query select 'already_checked_in'::text, 'Already checked in.'::text, name, existing.checked_in_at;
    return;
  end if;
  insert into public.event_checkins(event_id, user_id, credential_id, method, checked_in_by, device_label)
    values (p_event_id, credential.user_id, credential.id, p_method, actor, nullif(trim(p_device_label), ''))
    on conflict (event_id, user_id) where reversed_at is null do nothing returning * into saved;
  if saved.id is null then
    select * into saved from public.event_checkins c
      where c.event_id = p_event_id and c.user_id = credential.user_id and c.reversed_at is null;
    insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
      values (p_event_id, actor, 'already_checked_in', p_method);
    return query select 'already_checked_in'::text, 'Already checked in.'::text, name, saved.checked_in_at;
    return;
  end if;
  update public.event_memberships set status = 'attended', updated_at = now()
    where event_id = p_event_id and user_id = credential.user_id;
  insert into public.event_checkin_attempts(event_id, staff_id, outcome, method)
    values (p_event_id, actor, 'checked_in', p_method);
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
    values (actor, 'event.check_in', 'event_checkin', saved.id,
      jsonb_build_object('event_id', p_event_id, 'user_id', credential.user_id, 'method', p_method));
  return query select 'checked_in'::text, 'Check-in confirmed.'::text, name, saved.checked_in_at;
end;
$$;
revoke all on function public.door_check_in_event_member(uuid, text, text, text) from public;
grant execute on function public.door_check_in_event_member(uuid, text, text, text) to authenticated;

comment on table public.event_door_staff is 'Event-scoped check-in access only. Does not grant event_staff or read permission for guest lists or payments.';
notify pgrst, 'reload schema';
commit;
