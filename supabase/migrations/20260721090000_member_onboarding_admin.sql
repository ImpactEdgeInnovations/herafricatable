alter table public.profiles
  add column job_title text,
  add column company text,
  add column industry text,
  add column country text,
  add column bio text check (char_length(bio) <= 1600),
  add column visibility_paused boolean not null default false;

create table public.profile_private (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone text,
  linkedin_url text,
  instagram_url text,
  updated_at timestamptz not null default now()
);

create table public.profile_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  interest text not null check (char_length(interest) between 2 and 60),
  created_at timestamptz not null default now(),
  primary key (user_id, interest)
);

create table public.consent_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('terms', 'privacy', 'community_guidelines')),
  document_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, document_type, document_version)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index profile_interests_interest_idx on public.profile_interests(interest);
create index consent_records_user_idx on public.consent_records(user_id, accepted_at desc);
create index audit_events_target_idx on public.audit_events(target_type, target_id, created_at desc);
create index audit_events_actor_idx on public.audit_events(actor_id, created_at desc);

alter table public.profile_private enable row level security;
alter table public.profile_interests enable row level security;
alter table public.consent_records enable row level security;
alter table public.audit_events enable row level security;

create policy "Admins can read member profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "Members can read their private profile"
  on public.profile_private for select
  to authenticated
  using (user_id = auth.uid());

create policy "Members can read their interests"
  on public.profile_interests for select
  to authenticated
  using (user_id = auth.uid());

create policy "Members can read their consent history"
  on public.consent_records for select
  to authenticated
  using (user_id = auth.uid());

create policy "Super admins can read audit events"
  on public.audit_events for select
  to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]));

create or replace function public.complete_member_onboarding(
  p_display_name text,
  p_job_title text,
  p_company text,
  p_industry text,
  p_country text,
  p_bio text,
  p_phone text,
  p_linkedin_url text,
  p_instagram_url text,
  p_interests text[],
  p_accept_terms boolean,
  p_accept_privacy boolean,
  p_accept_guidelines boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_status public.member_access_status;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select access_status into current_status
  from public.profiles
  where id = current_user_id
  for update;

  if current_status not in ('onboarding', 'active') then
    raise exception 'This account is not eligible for onboarding';
  end if;

  if nullif(trim(p_display_name), '') is null
    or nullif(trim(p_job_title), '') is null
    or nullif(trim(p_industry), '') is null
    or nullif(trim(p_country), '') is null then
    raise exception 'Complete all required profile fields';
  end if;

  if char_length(coalesce(p_bio, '')) > 1600 then
    raise exception 'Bio is too long';
  end if;

  if not (p_accept_terms and p_accept_privacy and p_accept_guidelines) then
    raise exception 'Required agreements must be accepted';
  end if;

  update public.profiles
  set display_name = trim(p_display_name),
      job_title = trim(p_job_title),
      company = nullif(trim(p_company), ''),
      industry = trim(p_industry),
      country = trim(p_country),
      bio = nullif(trim(p_bio), ''),
      access_status = 'active',
      onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      updated_at = now()
  where id = current_user_id;

  insert into public.profile_private (user_id, phone, linkedin_url, instagram_url, updated_at)
  values (
    current_user_id,
    nullif(trim(p_phone), ''),
    nullif(trim(p_linkedin_url), ''),
    nullif(trim(p_instagram_url), ''),
    now()
  )
  on conflict (user_id) do update
  set phone = excluded.phone,
      linkedin_url = excluded.linkedin_url,
      instagram_url = excluded.instagram_url,
      updated_at = now();

  delete from public.profile_interests where user_id = current_user_id;
  insert into public.profile_interests (user_id, interest)
  select current_user_id, interest
  from (
    select distinct trim(value) as interest
    from unnest(coalesce(p_interests, array[]::text[])) as value
  ) normalized
  where char_length(interest) between 2 and 60
  limit 12;

  insert into public.consent_records (user_id, document_type, document_version)
  values
    (current_user_id, 'terms', '2026-07-21'),
    (current_user_id, 'privacy', '2026-07-21'),
    (current_user_id, 'community_guidelines', '2026-07-21')
  on conflict (user_id, document_type, document_version) do nothing;

  insert into public.audit_events (actor_id, action, target_type, target_id)
  values (current_user_id, 'member.onboarding_completed', 'profile', current_user_id);
end;
$$;

revoke all on function public.complete_member_onboarding(
  text, text, text, text, text, text, text, text, text, text[], boolean, boolean, boolean
) from public;
grant execute on function public.complete_member_onboarding(
  text, text, text, text, text, text, text, text, text, text[], boolean, boolean, boolean
) to authenticated;

create or replace function public.list_admin_members()
returns table (
  user_id uuid,
  email text,
  display_name text,
  job_title text,
  company text,
  country text,
  access_status public.member_access_status,
  onboarding_completed_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.email::text,
    p.display_name,
    p.job_title,
    p.company,
    p.country,
    p.access_status,
    p.onboarding_completed_at,
    p.created_at
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.is_admin()
  order by p.created_at desc;
$$;

revoke all on function public.list_admin_members() from public;
grant execute on function public.list_admin_members() to authenticated;

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
  completed_at timestamptz;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin access required';
  end if;

  if p_member_id = auth.uid() and p_decision = 'suspend' then
    raise exception 'You cannot suspend your own administrator account';
  end if;

  select onboarding_completed_at into completed_at
  from public.profiles
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Member not found';
  end if;

  next_status := case p_decision
    when 'approve' then case when completed_at is null then 'onboarding'::public.member_access_status else 'active'::public.member_access_status end
    when 'suspend' then 'suspended'::public.member_access_status
    when 'restore' then case when completed_at is null then 'onboarding'::public.member_access_status else 'active'::public.member_access_status end
    else null
  end;

  if next_status is null then
    raise exception 'Unsupported review decision';
  end if;

  update public.profiles
  set access_status = next_status, updated_at = now()
  where id = p_member_id;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(),
    'member.' || p_decision,
    'profile',
    p_member_id,
    jsonb_build_object('note', nullif(trim(p_note), ''), 'status', next_status)
  );

  return next_status;
end;
$$;

revoke all on function public.review_member(uuid, text, text) from public;
grant execute on function public.review_member(uuid, text, text) to authenticated;

comment on function public.complete_member_onboarding is
  'Atomically stores member profile, private contact data, interests, consent and activation.';
comment on function public.review_member is
  'Super-admin member approval and suspension operation with an audit event.';
