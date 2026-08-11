begin;

create or replace function public.update_member_profile(
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
  p_avatar_url text,
  p_phone text,
  p_whatsapp_number text,
  p_linkedin_url text,
  p_instagram_url text,
  p_share_phone boolean,
  p_interests text[],
  p_goals text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_profile public.profiles%rowtype;
  completion smallint;
begin
  if actor is null then
    raise exception 'Please sign in again to update your profile';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = actor
  for update;

  if current_profile.access_status <> 'active' then
    raise exception 'Your membership must be active before you can edit this profile';
  end if;

  if nullif(trim(p_avatar_url), '') is not null
    and position(
      '/storage/v1/object/public/avatars/' || actor::text || '/profile'
      in trim(p_avatar_url)
    ) = 0 then
    raise exception 'Please upload your photo using the profile photo button';
  end if;

  completion := public.save_member_onboarding_draft_v2(
    p_display_name,
    p_job_title,
    p_company,
    p_industry,
    p_country,
    p_city,
    p_languages,
    p_bio,
    p_business_name,
    p_website_url,
    current_profile.referral_source,
    current_profile.avatar_path,
    coalesce(nullif(trim(p_avatar_url), ''), current_profile.avatar_url),
    p_phone,
    p_whatsapp_number,
    p_linkedin_url,
    p_instagram_url,
    p_share_phone,
    p_interests,
    p_goals
  );

  if completion < 100 then
    raise exception 'Add your name, role, industry, city, country and short introduction, then choose at least one interest and one goal';
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
    'member.profile_updated',
    'profile',
    actor,
    jsonb_build_object(
      'profile_completion', completion,
      'required_photo', false,
      'required_languages', false
    )
  );
end;
$$;

revoke all on function public.update_member_profile(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, boolean, text[], text[]
) from public;
grant execute on function public.update_member_profile(
  text, text, text, text, text, text, text[], text, text, text, text, text,
  text, text, text, boolean, text[], text[]
) to authenticated;

comment on function public.update_member_profile is
  'Updates the eight essential member-profile fields. Photo, languages, private contact details and commercial links remain optional.';

commit;
