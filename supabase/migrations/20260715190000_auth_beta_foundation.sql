create type public.member_access_status as enum (
  'pending',
  'onboarding',
  'active',
  'dormant',
  'suspended',
  'deleted'
);

create type public.app_role as enum (
  'super_admin',
  'event_staff',
  'moderator',
  'sponsor'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  access_status public.member_access_status not null default 'pending',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.beta_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  intended_role public.app_role,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  constraint beta_invites_email_normalized check (email = lower(trim(email)))
);

create unique index beta_invites_pending_email_key
  on public.beta_invites (lower(email))
  where status = 'pending';

create index profiles_access_status_idx on public.profiles(access_status);
create index user_roles_role_user_idx on public.user_roles(role, user_id);
create index beta_invites_email_status_idx on public.beta_invites(lower(email), status);

create or replace function public.is_admin(check_roles public.app_role[] default array['super_admin', 'event_staff', 'moderator']::public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = any(check_roles)
  );
$$;

revoke all on function public.is_admin(public.app_role[]) from public;
grant execute on function public.is_admin(public.app_role[]) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_invite public.beta_invites%rowtype;
  initial_status public.member_access_status := 'pending';
begin
  select * into matching_invite
  from public.beta_invites
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1
  for update skip locked;

  if found then
    initial_status := 'onboarding';
  end if;

  insert into public.profiles (id, display_name, avatar_url, access_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    initial_status
  );

  if found then
    update public.beta_invites
    set status = 'accepted', accepted_by = new.id, accepted_at = now()
    where id = matching_invite.id;

    if matching_invite.intended_role is not null then
      insert into public.user_roles (user_id, role, granted_by)
      values (new.id, matching_invite.intended_role, matching_invite.invited_by)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.beta_invites enable row level security;

create policy "Members can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Users can read their own roles"
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid());

create policy "Super admins can read all roles"
  on public.user_roles for select
  to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]));

create policy "Super admins manage beta invites"
  on public.beta_invites for all
  to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]))
  with check (public.is_admin(array['super_admin']::public.app_role[]));

comment on table public.beta_invites is
  'Beta access allowlist. Authentication can create an identity, but only an eligible invite begins onboarding or grants an intended admin role.';
