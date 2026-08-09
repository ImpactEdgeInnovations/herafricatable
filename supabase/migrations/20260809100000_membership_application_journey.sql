begin;

create table if not exists public.membership_applications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 120),
  city text not null check (char_length(trim(city)) between 2 and 120),
  country text not null check (char_length(trim(country)) between 2 and 120),
  professional_focus text not null check (char_length(trim(professional_focus)) between 2 and 180),
  reason text not null check (char_length(trim(reason)) between 20 and 1200),
  referral_source text not null check (char_length(trim(referral_source)) between 2 and 120),
  referred_by text check (referred_by is null or char_length(trim(referred_by)) <= 180),
  status text not null default 'submitted'
    check (status in ('submitted', 'in_review', 'approved', 'declined', 'withdrawn')),
  consent_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists membership_applications_status_submitted_idx
  on public.membership_applications(status, submitted_at desc);

alter table public.membership_applications enable row level security;

drop policy if exists "Applicants read their own membership request"
  on public.membership_applications;
create policy "Applicants read their own membership request"
  on public.membership_applications for select
  to authenticated
  using (user_id = auth.uid());

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

  select access_status into member_status
  from public.profiles
  where id = actor
  for update;

  if not found then raise exception 'Member profile not found'; end if;
  if member_status <> 'pending' then
    raise exception 'Your membership request no longer needs an application';
  end if;

  insert into public.membership_applications (
    user_id, display_name, city, country, professional_focus, reason,
    referral_source, referred_by, status, consent_at, submitted_at,
    reviewed_at, reviewed_by, review_note, updated_at
  ) values (
    actor, trim(p_display_name), trim(p_city), trim(p_country),
    trim(p_professional_focus), trim(p_reason), trim(p_referral_source),
    nullif(trim(coalesce(p_referred_by, '')), ''), 'submitted', now(), now(),
    null, null, null, now()
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    city = excluded.city,
    country = excluded.country,
    professional_focus = excluded.professional_focus,
    reason = excluded.reason,
    referral_source = excluded.referral_source,
    referred_by = excluded.referred_by,
    status = 'submitted',
    consent_at = now(),
    submitted_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    review_note = null,
    updated_at = now();

  update public.profiles
  set display_name = trim(p_display_name),
      city = trim(p_city),
      country = trim(p_country),
      updated_at = now()
  where id = actor;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor,
    'membership.application_submitted',
    'membership_application',
    actor,
    jsonb_build_object('source', trim(p_referral_source))
  );

  return 'submitted';
end;
$$;

create or replace function public.list_admin_members_v3()
returns table(
  user_id uuid,
  email text,
  display_name text,
  job_title text,
  company text,
  city text,
  country text,
  access_status public.member_access_status,
  onboarding_completed_at timestamptz,
  profile_completion integer,
  created_at timestamptz,
  application_status text,
  application_professional_focus text,
  application_reason text,
  application_referral_source text,
  application_referred_by text,
  application_submitted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    coalesce(a.display_name, p.display_name),
    p.job_title,
    p.company,
    coalesce(a.city, p.city),
    coalesce(a.country, p.country),
    p.access_status,
    p.onboarding_completed_at,
    p.profile_completion,
    p.created_at,
    a.status,
    a.professional_focus,
    a.reason,
    a.referral_source,
    a.referred_by,
    a.submitted_at
  from auth.users u
  join public.profiles p on p.id = u.id
  left join public.membership_applications a on a.user_id = u.id
  where public.is_admin(array['super_admin']::public.app_role[])
  order by
    case a.status when 'submitted' then 0 when 'in_review' then 1 else 2 end,
    coalesce(a.submitted_at, p.created_at) desc;
$$;

create or replace function public.review_member(
  p_member_id uuid,
  p_decision text,
  p_note text default null
)
returns public.member_access_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status public.member_access_status;
  current_status public.member_access_status;
  completed_at timestamptz;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin access required';
  end if;

  if p_member_id = auth.uid() and p_decision = 'suspend' then
    raise exception 'You cannot suspend your own administrator account';
  end if;

  select access_status, onboarding_completed_at into current_status, completed_at
  from public.profiles
  where id = p_member_id
  for update;

  if not found then raise exception 'Member not found'; end if;

  if p_decision = 'decline' and (
    current_status <> 'pending'
    or not exists (
      select 1 from public.membership_applications
      where user_id = p_member_id and status in ('submitted', 'in_review')
    )
  ) then
    raise exception 'Only a submitted pending request can be declined';
  end if;

  next_status := case p_decision
    when 'approve' then case when completed_at is null then 'onboarding'::public.member_access_status else 'active'::public.member_access_status end
    when 'decline' then 'pending'::public.member_access_status
    when 'suspend' then 'suspended'::public.member_access_status
    when 'restore' then case when completed_at is null then 'onboarding'::public.member_access_status else 'active'::public.member_access_status end
    else null
  end;

  if next_status is null then raise exception 'Unsupported review decision'; end if;

  update public.profiles
  set access_status = next_status, updated_at = now()
  where id = p_member_id;

  if p_decision in ('approve', 'decline') then
    update public.membership_applications
    set status = case when p_decision = 'approve' then 'approved' else 'declined' end,
        reviewed_at = now(),
        reviewed_by = auth.uid(),
        review_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
    where user_id = p_member_id;
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'member.' || p_decision,
    'profile',
    p_member_id,
    jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''), 'status', next_status)
  );

  if p_decision = 'decline' then
    perform public.enqueue_notification(
      p_member_id,
      'system',
      'An update on your membership request',
      'The team could not approve your request at this time. You may update it or contact support if you need help.',
      '/apply',
      'membership-application-declined:' || p_member_id
    );
  end if;

  return next_status;
end;
$$;

revoke all on function public.submit_membership_application(text,text,text,text,text,text,text,boolean) from public;
grant execute on function public.submit_membership_application(text,text,text,text,text,text,text,boolean) to authenticated;
revoke all on function public.list_admin_members_v3() from public;
grant execute on function public.list_admin_members_v3() to authenticated;
revoke all on function public.review_member(uuid,text,text) from public;
grant execute on function public.review_member(uuid,text,text) to authenticated;

comment on table public.membership_applications is
  'Private, approval-gated membership requests collected after email ownership is verified.';
comment on function public.submit_membership_application is
  'Validates and submits a pending member request without granting member access.';
comment on function public.list_admin_members_v3 is
  'Super-admin membership review queue with private application context.';

commit;
