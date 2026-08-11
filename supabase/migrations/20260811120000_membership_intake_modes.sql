begin;

create table if not exists public.membership_intake_settings (
  id boolean primary key default true check (id),
  mode text not null default 'manual_review'
    check (mode in ('manual_review', 'trusted_auto', 'closed')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.membership_intake_settings (id, mode)
values (true, 'manual_review')
on conflict (id) do nothing;

alter table public.membership_intake_settings enable row level security;

create or replace function public.get_membership_intake_mode()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select setting.mode from public.membership_intake_settings setting where setting.id = true),
    'manual_review'
  );
$$;

create or replace function public.get_membership_intake_admin()
returns table (
  mode text,
  updated_at timestamptz,
  updated_by_email text,
  pending_applications bigint,
  trusted_pending_invites bigint
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
    setting.mode,
    setting.updated_at,
    account.email::text,
    (
      select count(*)
      from public.membership_applications application
      where application.status in ('submitted', 'in_review')
    ),
    (
      select count(*)
      from public.beta_invites invite
      where invite.status = 'pending'
        and invite.intended_role is null
        and (invite.expires_at is null or invite.expires_at > now())
    )
  from public.membership_intake_settings setting
  left join auth.users account on account.id = setting.updated_by
  where setting.id = true;
end;
$$;

create or replace function public.set_membership_intake_mode(
  p_mode text,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_mode text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if p_mode is null or p_mode not in ('manual_review', 'trusted_auto', 'closed') then
    raise exception 'Unsupported membership intake mode';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 8 then
    raise exception 'A clear reason is required';
  end if;

  select setting.mode into previous_mode
  from public.membership_intake_settings setting
  where setting.id = true
  for update;

  insert into public.membership_intake_settings (id, mode, updated_by, updated_at)
  values (true, p_mode, auth.uid(), now())
  on conflict (id) do update set
    mode = excluded.mode,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  ) values (
    auth.uid(),
    'membership.intake_mode_changed',
    'membership_intake',
    auth.uid(),
    jsonb_build_object(
      'previous_mode', previous_mode,
      'next_mode', p_mode,
      'reason', trim(p_reason)
    )
  );

  return p_mode;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matching_invite public.beta_invites%rowtype;
  intake_mode text := 'manual_review';
  initial_status public.member_access_status := 'pending';
  accept_invite boolean := false;
begin
  select public.get_membership_intake_mode() into intake_mode;

  select * into matching_invite
  from public.beta_invites
  where lower(email) = lower(new.email)
    and status = 'pending'
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1
  for update skip locked;

  if found and (
    matching_invite.intended_role is not null
    or intake_mode = 'trusted_auto'
  ) then
    initial_status := 'onboarding';
    accept_invite := true;
  end if;

  insert into public.profiles (id, display_name, avatar_url, access_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    initial_status
  );

  if accept_invite then
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

create or replace function public.submit_membership_application(
  p_display_name text,
  p_city text,
  p_country text,
  p_professional_focus text,
  p_reason text,
  p_referral_source text,
  p_referred_by text,
  p_acknowledged boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  member_status public.member_access_status;
  intake_mode text := 'manual_review';
  email_value text;
  trusted_invite public.beta_invites%rowtype;
  auto_approved boolean := false;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_acknowledged is not true then
    raise exception 'Please confirm the membership expectations before submitting';
  end if;
  if char_length(trim(coalesce(p_display_name, ''))) not between 2 and 120 then
    raise exception 'Enter your full name';
  end if;
  if char_length(trim(coalesce(p_city, ''))) not between 2 and 120
    or char_length(trim(coalesce(p_country, ''))) not between 2 and 120 then
    raise exception 'Enter your city and country';
  end if;
  if char_length(trim(coalesce(p_professional_focus, ''))) not between 2 and 180 then
    raise exception 'Tell us about your work or current focus';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 20 and 1200 then
    raise exception 'Tell us a little more about what brings you to the table';
  end if;
  if char_length(trim(coalesce(p_referral_source, ''))) not between 2 and 120 then
    raise exception 'Tell us how you heard about Her Africa Table';
  end if;

  select profile.access_status, lower(account.email)
  into member_status, email_value
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where profile.id = actor
  for update of profile;

  if not found then raise exception 'Member profile not found'; end if;
  if member_status <> 'pending' then
    raise exception 'Your membership request no longer needs an application';
  end if;

  select public.get_membership_intake_mode() into intake_mode;
  if intake_mode = 'closed' then
    raise exception 'New membership requests are temporarily paused';
  end if;

  if intake_mode = 'trusted_auto' then
    select * into trusted_invite
    from public.beta_invites invite
    where lower(invite.email) = email_value
      and invite.intended_role is null
      and (
        (
          invite.status = 'pending'
          and (invite.expires_at is null or invite.expires_at > now())
        )
        or (invite.status = 'accepted' and invite.accepted_by = actor)
      )
    order by invite.created_at desc
    limit 1
    for update;
    auto_approved := found;
  end if;

  insert into public.membership_applications (
    user_id, display_name, city, country, professional_focus, reason,
    referral_source, referred_by, status, consent_at, submitted_at,
    reviewed_at, reviewed_by, review_note, updated_at
  ) values (
    actor, trim(p_display_name), trim(p_city), trim(p_country),
    trim(p_professional_focus), trim(p_reason), trim(p_referral_source),
    nullif(trim(coalesce(p_referred_by, '')), ''),
    case when auto_approved then 'approved' else 'submitted' end,
    now(), now(),
    case when auto_approved then now() else null end,
    null,
    case when auto_approved then 'Automatically approved from a verified invitation' else null end,
    now()
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    city = excluded.city,
    country = excluded.country,
    professional_focus = excluded.professional_focus,
    reason = excluded.reason,
    referral_source = excluded.referral_source,
    referred_by = excluded.referred_by,
    status = excluded.status,
    consent_at = now(),
    submitted_at = now(),
    reviewed_at = excluded.reviewed_at,
    reviewed_by = null,
    review_note = excluded.review_note,
    updated_at = now();

  if auto_approved and trusted_invite.status = 'pending' then
    update public.beta_invites
    set status = 'accepted', accepted_by = actor, accepted_at = now()
    where id = trusted_invite.id;
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      city = trim(p_city),
      country = trim(p_country),
      access_status = case
        when auto_approved then 'onboarding'::public.member_access_status
        else access_status
      end,
      updated_at = now()
  where id = actor;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor,
    case
      when auto_approved then 'membership.application_auto_approved'
      else 'membership.application_submitted'
    end,
    'membership_application',
    actor,
    jsonb_build_object('mode', intake_mode, 'trusted_invite', auto_approved)
  );

  return case when auto_approved then 'approved' else 'submitted' end;
end;
$$;

revoke all on function public.get_membership_intake_mode() from public;
grant execute on function public.get_membership_intake_mode() to authenticated;
revoke all on function public.get_membership_intake_admin() from public;
grant execute on function public.get_membership_intake_admin() to authenticated;
revoke all on function public.set_membership_intake_mode(text, text) from public;
grant execute on function public.set_membership_intake_mode(text, text) to authenticated;
revoke all on function public.submit_membership_application(text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.submit_membership_application(text, text, text, text, text, text, text, boolean) to authenticated;

comment on table public.membership_intake_settings is
  'Audited singleton controlling manual review, verified-invitation automatic approval, or paused membership intake.';
comment on function public.set_membership_intake_mode is
  'Super Admin control for membership intake. Trusted automatic approval never applies to an unverified open application.';

commit;
