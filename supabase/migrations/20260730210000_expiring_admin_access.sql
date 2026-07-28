begin;

alter table public.user_roles
  add column if not exists expires_at timestamptz;

create index if not exists user_roles_active_expiry_idx
  on public.user_roles (role, expires_at, user_id);

update public.user_roles as role_assignment
set expires_at = invite.expires_at
from public.beta_invites as invite
where invite.accepted_by = role_assignment.user_id
  and invite.intended_role = role_assignment.role
  and invite.expires_at is not null
  and role_assignment.expires_at is null;

create or replace function public.is_admin(
  check_roles public.app_role[] default array[
    'super_admin',
    'event_staff',
    'moderator'
  ]::public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = any(check_roles)
      and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.list_admin_team_access()
returns table (
  user_id uuid,
  email text,
  display_name text,
  role public.app_role,
  granted_at timestamptz,
  expires_at timestamptz,
  access_state text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;

  return query
  select
    assignment.user_id,
    account.email::text,
    profile.display_name,
    assignment.role,
    assignment.granted_at,
    assignment.expires_at,
    case
      when assignment.expires_at is not null and assignment.expires_at <= now()
        then 'expired'
      when assignment.expires_at is not null
        then 'time_limited'
      else 'permanent'
    end
  from public.user_roles as assignment
  join auth.users as account on account.id = assignment.user_id
  left join public.profiles as profile on profile.id = assignment.user_id
  order by
    case when assignment.expires_at is not null and assignment.expires_at <= now() then 1 else 0 end,
    assignment.role,
    coalesce(profile.display_name, account.email);
end;
$$;

create or replace function public.grant_time_bounded_admin_access(
  p_email text,
  p_role public.app_role,
  p_expires_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target uuid;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if p_role not in ('super_admin', 'event_staff', 'moderator') then
    raise exception 'Unsupported team role';
  end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '365 days' then
    raise exception 'Access expiry must be within the next 365 days';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'A clear access reason is required';
  end if;

  select id
  into target
  from auth.users
  where lower(email) = lower(trim(p_email));

  if target is null then
    raise exception 'Team account not found';
  end if;

  insert into public.user_roles (user_id, role, granted_by, expires_at)
  values (target, p_role, actor, p_expires_at)
  on conflict (user_id, role)
  do update set
    granted_by = actor,
    granted_at = now(),
    expires_at = excluded.expires_at;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'admin_access.granted',
    'user',
    target,
    jsonb_build_object(
      'role', p_role,
      'expires_at', p_expires_at,
      'reason', trim(p_reason)
    )
  );

  return target;
end;
$$;

create or replace function public.revoke_admin_access(
  p_user_id uuid,
  p_role public.app_role,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if actor = p_user_id and p_role = 'super_admin' then
    raise exception 'You cannot revoke your own Super Admin access';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'A clear revocation reason is required';
  end if;

  delete from public.user_roles
  where user_id = p_user_id and role = p_role;

  if not found then
    raise exception 'Active team role not found';
  end if;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'admin_access.revoked',
    'user',
    p_user_id,
    jsonb_build_object('role', p_role, 'reason', trim(p_reason))
  );
end;
$$;

revoke all on function public.list_admin_team_access() from public;
grant execute on function public.list_admin_team_access() to authenticated;
revoke all on function public.grant_time_bounded_admin_access(text, public.app_role, timestamptz, text) from public;
grant execute on function public.grant_time_bounded_admin_access(text, public.app_role, timestamptz, text) to authenticated;
revoke all on function public.revoke_admin_access(uuid, public.app_role, text) from public;
grant execute on function public.revoke_admin_access(uuid, public.app_role, text) to authenticated;

comment on column public.user_roles.expires_at is
  'Optional hard expiry checked by every database-backed Admin authorization decision.';
comment on function public.grant_time_bounded_admin_access is
  'Audited Super Admin operation for granting an existing identity a time-limited team role.';
comment on function public.revoke_admin_access is
  'Audited Super Admin operation for immediately removing a team role.';

commit;
