begin;

-- This pilot only removes the first application review for a small test cohort.
-- Public launch, paid access and the release-acceptance gates are unchanged.
create table if not exists public.community_pilot_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.community_pilot_settings(id, enabled)
values (true, public.get_membership_intake_mode() = 'trusted_auto')
on conflict (id) do nothing;
alter table public.community_pilot_settings enable row level security;
revoke all on public.community_pilot_settings from public, anon, authenticated;

create table if not exists public.community_pilot_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null check (source in ('existing_tester', 'member_activation')),
  granted_at timestamptz not null default now()
);
alter table public.community_pilot_access enable row level security;
revoke all on public.community_pilot_access from public, anon, authenticated;

alter table public.community_host_applications
  add column if not exists pilot_auto_draft boolean not null default false;

-- Keep the already-testing member and accepted direct-pilot invitees in the
-- founding cohort. Remaining places go to the first newly activated members.
insert into public.community_pilot_access(user_id, source)
select candidate.id, 'existing_tester'
from (
  select distinct profile.id, profile.created_at
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where profile.access_status = 'active'
    and (
      lower(account.email) = 'epayments.elbrim@gmail.com'
      or exists (
        select 1 from public.beta_invites invite
        where invite.accepted_by = profile.id
          and invite.status = 'accepted' and invite.source = 'admin_pilot'
      )
    )
  order by profile.created_at, profile.id
  limit greatest(0, 20 - (select count(*) from public.community_pilot_access))
) candidate
on conflict (user_id) do nothing;

create or replace function public.assign_founding_community_pilot_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.access_status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.access_status = 'active' then return new; end if;
  end if;
  if public.get_membership_intake_mode() <> 'trusted_auto' then return new; end if;
  perform 1 from public.community_pilot_settings setting
    where setting.id = true and setting.enabled for update;
  if not found then return new; end if;
  if (select count(*) from public.community_pilot_access) < 20 then
    insert into public.community_pilot_access(user_id, source)
    values (new.id, 'member_activation') on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.assign_founding_community_pilot_access() from public;
drop trigger if exists founding_community_pilot_member_activation on public.profiles;
create trigger founding_community_pilot_member_activation
after insert or update of access_status on public.profiles
for each row execute function public.assign_founding_community_pilot_access();

create or replace function public.community_pilot_member_ready(p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null
    and (p_user_id = auth.uid() or public.is_admin(array['super_admin']::public.app_role[]))
    and public.get_membership_intake_mode() = 'trusted_auto'
    and public.communities_enabled()
    and public.is_active_member(p_user_id)
    and coalesce((select setting.enabled from public.community_pilot_settings setting
      where setting.id = true), false)
    and exists (select 1 from public.community_pilot_access access
      where access.user_id = p_user_id);
$$;
revoke all on function public.community_pilot_member_ready(uuid) from public;
grant execute on function public.community_pilot_member_ready(uuid) to authenticated;

create or replace function public.get_community_pilot_admin()
returns table(enabled boolean, cohort_count bigint, capacity integer, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  return query select setting.enabled
      and public.get_membership_intake_mode() = 'trusted_auto'
      and public.communities_enabled(),
    (select count(*) from public.community_pilot_access), 20,
    (select intake.trusted_auto_expires_at
      from public.membership_intake_settings intake where intake.id = true)
  from public.community_pilot_settings setting where setting.id = true;
end;
$$;
revoke all on function public.get_community_pilot_admin() from public;
grant execute on function public.get_community_pilot_admin() to authenticated;

create or replace function public.set_community_pilot_setting(p_enabled boolean, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare previous_enabled boolean;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required'; end if;
  if p_enabled is null or char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'Choose a setting and give a clear reason'; end if;
  if p_enabled and public.get_membership_intake_mode() <> 'trusted_auto' then
    raise exception 'The 60-day membership pilot must be active'; end if;
  if p_enabled and not public.communities_enabled() then
    raise exception 'Open the Communities module before enabling automatic drafts'; end if;
  select setting.enabled into previous_enabled
  from public.community_pilot_settings setting where setting.id = true for update;
  update public.community_pilot_settings
  set enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
  where id = true;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'community.pilot_setting_changed', 'community_pilot',
    auth.uid(), jsonb_build_object('previous', previous_enabled,
      'enabled', p_enabled, 'reason', trim(p_reason)));
  return p_enabled;
end;
$$;
revoke all on function public.set_community_pilot_setting(boolean,text) from public;
grant execute on function public.set_community_pilot_setting(boolean,text) to authenticated;

create or replace function public.reset_community_pilot_setting()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.mode <> 'trusted_auto'
    or new.trusted_auto_expires_at is distinct from old.trusted_auto_expires_at then
    update public.community_pilot_settings
    set enabled = false, updated_at = now() where id = true;
  end if;
  return new;
end;
$$;
revoke all on function public.reset_community_pilot_setting() from public;
drop trigger if exists reset_community_pilot_on_intake_change on public.membership_intake_settings;
create trigger reset_community_pilot_on_intake_change
after update of mode, trusted_auto_expires_at on public.membership_intake_settings
for each row execute function public.reset_community_pilot_setting();

create or replace function public.create_founding_community_pilot_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
declare saved_community uuid; clean_slug text;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' then
    if old.status = 'pending' then return new; end if;
  end if;
  if auth.uid() is null or auth.uid() <> new.applicant_id
    or not public.community_pilot_member_ready(new.applicant_id) then
    return new;
  end if;
  -- One automatic room per tester. Additional proposals enter normal review.
  if exists (
    select 1 from public.community_host_applications application
    where application.applicant_id = new.applicant_id
      and application.pilot_auto_draft and application.status = 'approved'
  ) then return new; end if;

  clean_slug := new.proposed_slug;
  if exists (select 1 from public.communities where slug = clean_slug) then
    clean_slug := left(clean_slug, 71) || '-' || left(new.id::text, 8);
  end if;
  insert into public.communities(
    name, slug, description, community_type, status, created_by
  ) values (
    new.community_name, clean_slug, new.purpose, 'private', 'draft', new.applicant_id
  ) returning id into saved_community;
  insert into public.community_memberships(
    community_id, user_id, role, status, joined_at
  ) values (saved_community, new.applicant_id, 'owner', 'active', now());
  update public.community_host_applications
  set status = 'approved', created_community_id = saved_community,
    pilot_auto_draft = true, reviewed_at = now(), updated_at = now()
  where id = new.id and status = 'pending';
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (new.applicant_id, 'community.pilot_private_draft_created',
    'community', saved_community,
    jsonb_build_object('application_id', new.id, 'public_status', 'private'));
  perform public.enqueue_notification(new.applicant_id, 'community',
    'Your private Community is ready',
    'Open your Community to prepare it. Members cannot join until the public launch checks pass.',
    '/communities/' || clean_slug,
    'community-pilot-draft:' || new.id);
  return new;
end;
$$;
revoke all on function public.create_founding_community_pilot_draft() from public;
drop trigger if exists founding_community_pilot_application on public.community_host_applications;
create trigger founding_community_pilot_application
after insert or update of status on public.community_host_applications
for each row execute function public.create_founding_community_pilot_draft();

notify pgrst, 'reload schema';
commit;
