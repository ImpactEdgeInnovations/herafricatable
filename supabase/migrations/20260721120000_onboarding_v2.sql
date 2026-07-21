alter table public.profiles
  add column city text,
  add column languages text[] not null default array[]::text[],
  add column business_name text,
  add column website_url text,
  add column referral_source text,
  add column avatar_path text,
  add column profile_completion smallint not null default 0
    check (profile_completion between 0 and 100);

alter table public.profile_private
  add column whatsapp_number text,
  add column share_phone_with_connections boolean not null default false;

create table public.member_goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_key text not null check (goal_key in (
    'make_friends',
    'build_business',
    'find_clients',
    'travel',
    'learn',
    'mentor',
    'be_mentored',
    'invest',
    'shop_african_brands'
  )),
  created_at timestamptz not null default now(),
  primary key (user_id, goal_key)
);

create index member_goals_goal_idx on public.member_goals(goal_key, user_id);

alter table public.member_goals enable row level security;

create policy "Members can read their goals"
  on public.member_goals for select
  to authenticated
  using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Members can read their avatar objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name = (auth.uid()::text || '/profile')
  );

create policy "Members can upload their avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name = (auth.uid()::text || '/profile')
  );

create policy "Members can replace their avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name = (auth.uid()::text || '/profile')
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name = (auth.uid()::text || '/profile')
  );

create policy "Members can delete their avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name = (auth.uid()::text || '/profile')
  );

create or replace function public.save_member_onboarding_draft_v2(
  p_display_name text,
  p_job_title text,
  p_company text,
  p_industry text,
  p_country text,
  p_city text,
  p_languages text[],
  p_bio text,
  p_business_name text,
  p_website_url text,
  p_referral_source text,
  p_avatar_path text,
  p_avatar_url text,
  p_phone text,
  p_whatsapp_number text,
  p_linkedin_url text,
  p_instagram_url text,
  p_share_phone boolean,
  p_interests text[],
  p_goals text[]
)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_status public.member_access_status;
  completion smallint := 0;
  interest_count integer := 0;
  goal_count integer := 0;
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

  if char_length(coalesce(p_bio, '')) > 1600 then
    raise exception 'Bio is too long';
  end if;

  if nullif(trim(p_website_url), '') is not null and trim(p_website_url) !~* '^https?://' then
    raise exception 'Website must begin with http:// or https://';
  end if;
  if nullif(trim(p_linkedin_url), '') is not null and trim(p_linkedin_url) !~* '^https?://' then
    raise exception 'LinkedIn URL must begin with http:// or https://';
  end if;
  if nullif(trim(p_instagram_url), '') is not null and trim(p_instagram_url) !~* '^https?://' then
    raise exception 'Instagram URL must begin with http:// or https://';
  end if;
  if nullif(trim(p_avatar_path), '') is not null
    and trim(p_avatar_path) <> (current_user_id::text || '/profile') then
    raise exception 'Invalid avatar path';
  end if;

  update public.profiles
  set display_name = nullif(trim(p_display_name), ''),
      job_title = nullif(trim(p_job_title), ''),
      company = nullif(trim(p_company), ''),
      industry = nullif(trim(p_industry), ''),
      country = nullif(trim(p_country), ''),
      city = nullif(trim(p_city), ''),
      languages = coalesce((
        select array_agg(language order by language)
        from (
          select distinct trim(value) as language
          from unnest(coalesce(p_languages, array[]::text[])) as value
          where char_length(trim(value)) between 2 and 40
          limit 10
        ) normalized_languages
      ), array[]::text[]),
      bio = nullif(trim(p_bio), ''),
      business_name = nullif(trim(p_business_name), ''),
      website_url = nullif(trim(p_website_url), ''),
      referral_source = nullif(trim(p_referral_source), ''),
      avatar_path = coalesce(nullif(trim(p_avatar_path), ''), avatar_path),
      avatar_url = coalesce(nullif(trim(p_avatar_url), ''), avatar_url),
      updated_at = now()
  where id = current_user_id;

  insert into public.profile_private (
    user_id, phone, whatsapp_number, linkedin_url, instagram_url,
    share_phone_with_connections, updated_at
  )
  values (
    current_user_id,
    nullif(trim(p_phone), ''),
    nullif(trim(p_whatsapp_number), ''),
    nullif(trim(p_linkedin_url), ''),
    nullif(trim(p_instagram_url), ''),
    p_share_phone,
    now()
  )
  on conflict (user_id) do update
  set phone = excluded.phone,
      whatsapp_number = excluded.whatsapp_number,
      linkedin_url = excluded.linkedin_url,
      instagram_url = excluded.instagram_url,
      share_phone_with_connections = excluded.share_phone_with_connections,
      updated_at = now();

  delete from public.profile_interests where user_id = current_user_id;
  insert into public.profile_interests (user_id, interest)
  select current_user_id, interest
  from (
    select distinct trim(value) as interest
    from unnest(coalesce(p_interests, array[]::text[])) as value
  ) normalized_interests
  where char_length(interest) between 2 and 60
  limit 12;

  delete from public.member_goals where user_id = current_user_id;
  insert into public.member_goals (user_id, goal_key)
  select current_user_id, goal_key
  from (
    select distinct trim(value) as goal_key
    from unnest(coalesce(p_goals, array[]::text[])) as value
  ) normalized_goals
  where goal_key in (
    'make_friends', 'build_business', 'find_clients', 'travel', 'learn',
    'mentor', 'be_mentored', 'invest', 'shop_african_brands'
  )
  limit 6;

  select count(*) into interest_count from public.profile_interests where user_id = current_user_id;
  select count(*) into goal_count from public.member_goals where user_id = current_user_id;

  select (
    (case when nullif(trim(display_name), '') is not null then 10 else 0 end) +
    (case when nullif(trim(job_title), '') is not null then 10 else 0 end) +
    (case when nullif(trim(industry), '') is not null then 10 else 0 end) +
    (case when nullif(trim(country), '') is not null then 10 else 0 end) +
    (case when nullif(trim(city), '') is not null then 10 else 0 end) +
    (case when nullif(trim(bio), '') is not null then 10 else 0 end) +
    (case when avatar_path is not null then 10 else 0 end) +
    (case when cardinality(languages) > 0 then 10 else 0 end) +
    (case when interest_count > 0 then 10 else 0 end) +
    (case when goal_count > 0 then 10 else 0 end)
  )::smallint into completion
  from public.profiles
  where id = current_user_id;

  update public.profiles
  set profile_completion = completion
  where id = current_user_id;

  return completion;
end;
$$;

revoke all on function public.save_member_onboarding_draft_v2(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, text, text, boolean, text[], text[]
) from public;
grant execute on function public.save_member_onboarding_draft_v2(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, text, text, boolean, text[], text[]
) to authenticated;

create or replace function public.complete_member_onboarding_v2(
  p_display_name text,
  p_job_title text,
  p_company text,
  p_industry text,
  p_country text,
  p_city text,
  p_languages text[],
  p_bio text,
  p_business_name text,
  p_website_url text,
  p_referral_source text,
  p_avatar_path text,
  p_avatar_url text,
  p_phone text,
  p_whatsapp_number text,
  p_linkedin_url text,
  p_instagram_url text,
  p_share_phone boolean,
  p_interests text[],
  p_goals text[],
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
  completion smallint;
begin
  completion := public.save_member_onboarding_draft_v2(
    p_display_name, p_job_title, p_company, p_industry, p_country, p_city,
    p_languages, p_bio, p_business_name, p_website_url, p_referral_source,
    p_avatar_path, p_avatar_url, p_phone, p_whatsapp_number, p_linkedin_url,
    p_instagram_url, p_share_phone, p_interests, p_goals
  );

  if completion < 100 then
    raise exception 'Complete all required profile fields, interests, goals and profile photo';
  end if;

  if not (p_accept_terms and p_accept_privacy and p_accept_guidelines) then
    raise exception 'Required agreements must be accepted';
  end if;

  insert into public.consent_records (user_id, document_type, document_version)
  values
    (current_user_id, 'terms', '2026-07-21'),
    (current_user_id, 'privacy', '2026-07-21'),
    (current_user_id, 'community_guidelines', '2026-07-21')
  on conflict (user_id, document_type, document_version) do nothing;

  update public.profiles
  set access_status = 'active',
      profile_completion = 100,
      onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      updated_at = now()
  where id = current_user_id and access_status in ('onboarding', 'active');

  if not found then
    raise exception 'This account is not eligible for activation';
  end if;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    current_user_id,
    'member.onboarding_completed_v2',
    'profile',
    current_user_id,
    jsonb_build_object('profile_completion', 100)
  );
end;
$$;

revoke all on function public.complete_member_onboarding_v2(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, text, text, boolean, text[], text[], boolean, boolean, boolean
) from public;
grant execute on function public.complete_member_onboarding_v2(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, text, text, boolean, text[], text[], boolean, boolean, boolean
) to authenticated;

revoke execute on function public.complete_member_onboarding(
  text, text, text, text, text, text, text, text, text, text[], boolean, boolean, boolean
) from authenticated;

create or replace function public.list_admin_members_v2()
returns table (
  user_id uuid,
  email text,
  display_name text,
  job_title text,
  company text,
  city text,
  country text,
  profile_completion smallint,
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
    p.city,
    p.country,
    p.profile_completion,
    p.access_status,
    p.onboarding_completed_at,
    p.created_at
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.is_admin()
  order by
    case p.access_status when 'pending' then 0 when 'onboarding' then 1 else 2 end,
    p.created_at desc;
$$;

revoke all on function public.list_admin_members_v2() from public;
grant execute on function public.list_admin_members_v2() to authenticated;

comment on table public.member_goals is
  'Normalized launch goals used by deterministic discovery and matching.';
comment on function public.save_member_onboarding_draft_v2 is
  'Progressively saves owned onboarding data and returns deterministic completion percentage.';
comment on function public.complete_member_onboarding_v2 is
  'Validates the complete v2 profile and consent set before activating the member.';
comment on function public.list_admin_members_v2 is
  'Returns the minimum member-review fields and onboarding completion to authorized admins.';
