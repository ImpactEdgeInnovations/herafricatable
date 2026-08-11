begin;

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

  select profile.access_status into current_status
  from public.profiles profile
  where profile.id = current_user_id
  for update;

  if current_status not in ('onboarding', 'active') then
    raise exception 'This account is not eligible for onboarding';
  end if;
  if char_length(coalesce(p_bio, '')) > 1600 then
    raise exception 'Your introduction is too long';
  end if;
  if nullif(trim(p_website_url), '') is not null
    and trim(p_website_url) !~* '^https?://' then
    raise exception 'Website must begin with http:// or https://';
  end if;
  if nullif(trim(p_linkedin_url), '') is not null
    and trim(p_linkedin_url) !~* '^https?://' then
    raise exception 'LinkedIn URL must begin with http:// or https://';
  end if;
  if nullif(trim(p_instagram_url), '') is not null
    and trim(p_instagram_url) !~* '^https?://' then
    raise exception 'Instagram URL must begin with http:// or https://';
  end if;
  if nullif(trim(p_avatar_path), '') is not null
    and trim(p_avatar_path) <> (current_user_id::text || '/profile') then
    raise exception 'Invalid profile photo path';
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
  ) values (
    current_user_id,
    nullif(trim(p_phone), ''),
    nullif(trim(p_whatsapp_number), ''),
    nullif(trim(p_linkedin_url), ''),
    nullif(trim(p_instagram_url), ''),
    coalesce(p_share_phone, false),
    now()
  )
  on conflict (user_id) do update set
    phone = excluded.phone,
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

  select count(*) into interest_count
  from public.profile_interests where user_id = current_user_id;
  select count(*) into goal_count
  from public.member_goals where user_id = current_user_id;

  select (
    (case when nullif(trim(profile.display_name), '') is not null then 15 else 0 end) +
    (case when nullif(trim(profile.job_title), '') is not null then 15 else 0 end) +
    (case when nullif(trim(profile.industry), '') is not null then 10 else 0 end) +
    (case when nullif(trim(profile.country), '') is not null then 10 else 0 end) +
    (case when nullif(trim(profile.city), '') is not null then 10 else 0 end) +
    (case when nullif(trim(profile.bio), '') is not null then 15 else 0 end) +
    (case when interest_count > 0 then 10 else 0 end) +
    (case when goal_count > 0 then 15 else 0 end)
  )::smallint into completion
  from public.profiles profile
  where profile.id = current_user_id;

  update public.profiles
  set profile_completion = completion
  where id = current_user_id;

  return completion;
end;
$$;

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
    raise exception 'Complete your name, role, location, introduction, one interest and one goal';
  end if;
  if not (
    coalesce(p_accept_terms, false)
    and coalesce(p_accept_privacy, false)
    and coalesce(p_accept_guidelines, false)
  ) then
    raise exception 'Please accept the agreements that protect the table';
  end if;

  insert into public.consent_records (
    user_id, document_type, document_version
  ) values
    (current_user_id, 'terms', '2026-07-21'),
    (current_user_id, 'privacy', '2026-07-21'),
    (current_user_id, 'community_guidelines', '2026-07-21')
  on conflict (user_id, document_type, document_version) do nothing;

  update public.profiles
  set access_status = 'active',
      profile_completion = 100,
      onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      updated_at = now()
  where id = current_user_id
    and access_status in ('onboarding', 'active');

  if not found then
    raise exception 'This account is not eligible for activation';
  end if;

  insert into public.audit_events (
    actor_id, action, target_type, target_id, metadata
  ) values (
    current_user_id,
    'member.onboarding_completed_v3',
    'profile',
    current_user_id,
    jsonb_build_object(
      'profile_completion', 100,
      'required_photo', false,
      'required_languages', false
    )
  );
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

revoke all on function public.complete_member_onboarding_v2(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, text, text, boolean, text[], text[], boolean, boolean, boolean
) from public;
grant execute on function public.complete_member_onboarding_v2(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, text, text, boolean, text[], text[], boolean, boolean, boolean
) to authenticated;

comment on function public.complete_member_onboarding_v2 is
  'Activates an approved member from eight meaningful essentials. Photo, languages, private contact and commercial links remain optional.';

commit;
