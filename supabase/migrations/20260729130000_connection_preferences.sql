begin;

create table public.member_connection_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_mode text not null default 'open'
    check (request_mode in ('open', 'curated_only', 'paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.member_connection_preferences enable row level security;
create policy "Members read own connection preferences"
  on public.member_connection_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.connection_request_mode(p_member_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select preference.request_mode
      from public.member_connection_preferences preference
      where preference.user_id = p_member_id
    ),
    'open'
  );
$$;

create or replace function public.can_receive_connection(
  p_member_id uuid,
  p_request_kind text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mode text;
begin
  if p_request_kind not in ('direct', 'curated') then
    return false;
  end if;
  mode := public.connection_request_mode(p_member_id);
  return case
    when p_request_kind = 'direct' then mode = 'open'
    else mode in ('open', 'curated_only')
  end;
end;
$$;

create or replace function public.enforce_direct_connection_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mode text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  mode := public.connection_request_mode(new.recipient_id);
  if mode = 'curated_only' then
    raise exception 'Member accepts curated introductions only';
  elsif mode = 'paused' then
    raise exception 'Member is not accepting new introductions';
  end if;
  return new;
end;
$$;

create trigger enforce_direct_connection_preference
before insert or update of status, recipient_id
on public.connections
for each row
execute function public.enforce_direct_connection_preference();

create or replace function public.enforce_curated_connection_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_receive_connection(new.member_low, 'curated')
    or not public.can_receive_connection(new.member_high, 'curated')
  then
    raise exception 'One or both members are not accepting curated introductions';
  end if;
  return new;
end;
$$;

create trigger enforce_curated_connection_preference
before insert
on public.curated_introductions
for each row
execute function public.enforce_curated_connection_preference();

create or replace function public.get_my_connection_preferences()
returns table (
  request_mode text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active membership required';
  end if;
  insert into public.member_connection_preferences (user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;
  return query
  select preference.request_mode, preference.updated_at
  from public.member_connection_preferences preference
  where preference.user_id = auth.uid();
end;
$$;

create or replace function public.set_my_connection_preferences(
  p_request_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.is_active_member(actor) then
    raise exception 'Active membership required';
  end if;
  if p_request_mode not in ('open', 'curated_only', 'paused') then
    raise exception 'Unsupported connection preference';
  end if;
  insert into public.member_connection_preferences (user_id, request_mode)
  values (actor, p_request_mode)
  on conflict (user_id) do update
  set request_mode = excluded.request_mode, updated_at = now();
  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'connection.preference_updated',
    'profile',
    actor,
    jsonb_build_object('request_mode', p_request_mode)
  );
end;
$$;

create or replace function public.list_connection_availability()
returns table (
  user_id uuid,
  request_mode text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active visible membership required';
  end if;
  return query
  select
    profile.id,
    public.connection_request_mode(profile.id)
  from public.profiles profile
  where profile.id <> auth.uid()
    and profile.access_status = 'active'
    and not profile.visibility_paused
    and not public.is_blocked_pair(auth.uid(), profile.id);
end;
$$;

create or replace function public.get_member_connection_mode(p_member_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid())
    or auth.uid() = p_member_id
    or not public.is_active_member(p_member_id)
    or public.is_blocked_pair(auth.uid(), p_member_id)
  then
    raise exception 'Member is unavailable';
  end if;
  return public.connection_request_mode(p_member_id);
end;
$$;

create or replace function public.list_connection_availability_admin()
returns table (
  user_id uuid,
  request_mode text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  return query
  select
    profile.id,
    public.connection_request_mode(profile.id)
  from public.profiles profile
  where profile.access_status = 'active'
    and not profile.visibility_paused;
end;
$$;

revoke all on function public.connection_request_mode(uuid) from public;
revoke all on function public.can_receive_connection(uuid, text) from public;
revoke all on function public.enforce_direct_connection_preference() from public;
revoke all on function public.enforce_curated_connection_preference() from public;
revoke all on function public.get_my_connection_preferences() from public;
grant execute on function public.get_my_connection_preferences() to authenticated;
revoke all on function public.set_my_connection_preferences(text) from public;
grant execute on function public.set_my_connection_preferences(text) to authenticated;
revoke all on function public.list_connection_availability() from public;
grant execute on function public.list_connection_availability() to authenticated;
revoke all on function public.get_member_connection_mode(uuid) from public;
grant execute on function public.get_member_connection_mode(uuid) to authenticated;
revoke all on function public.list_connection_availability_admin() from public;
grant execute on function public.list_connection_availability_admin() to authenticated;

commit;
