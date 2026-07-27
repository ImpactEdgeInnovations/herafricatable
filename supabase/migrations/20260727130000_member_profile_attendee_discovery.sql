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
    raise exception 'Authentication required';
  end if;

  select *
  into current_profile
  from public.profiles
  where id = actor
  for update;

  if current_profile.access_status <> 'active' then
    raise exception 'Active membership required';
  end if;

  if nullif(trim(p_avatar_url), '') is not null
    and position(
      '/storage/v1/object/public/avatars/' || actor::text || '/profile'
      in trim(p_avatar_url)
    ) = 0 then
    raise exception 'Invalid avatar URL';
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
    raise exception 'Keep every required profile field, interest, goal and profile photo complete';
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
    jsonb_build_object('profile_completion', completion)
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
  'Updates a complete active-member profile without weakening onboarding completion or private-contact boundaries.';

create table public.event_attendee_preferences (
  event_id uuid not null,
  user_id uuid not null,
  discoverable boolean not null default false,
  show_company boolean not null default true,
  introduction text check (
    introduction is null
    or char_length(introduction) between 2 and 500
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  foreign key (event_id, user_id)
    references public.event_memberships(event_id, user_id)
    on delete cascade
);

create index event_attendee_preferences_discovery_idx
  on public.event_attendee_preferences(event_id, discoverable, updated_at desc);

alter table public.event_attendee_preferences enable row level security;

create policy "Members read own attendee preferences"
  on public.event_attendee_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.save_event_attendee_visibility(
  p_event_id uuid,
  p_discoverable boolean,
  p_show_company boolean,
  p_introduction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  normalized_introduction text := nullif(trim(p_introduction), '');
begin
  if not public.is_active_member(actor) then
    raise exception 'Active visible membership required';
  end if;

  if not exists (
    select 1
    from public.event_memberships membership
    where membership.event_id = p_event_id
      and membership.user_id = actor
      and membership.status in ('confirmed', 'attended')
  ) then
    raise exception 'Confirmed event attendance required';
  end if;

  if p_discoverable
    and char_length(coalesce(normalized_introduction, '')) < 2 then
    raise exception 'Add a short introduction before joining attendee discovery';
  end if;

  if char_length(coalesce(normalized_introduction, '')) > 500 then
    raise exception 'Introduction is too long';
  end if;

  insert into public.event_attendee_preferences (
    event_id,
    user_id,
    discoverable,
    show_company,
    introduction,
    updated_at
  )
  values (
    p_event_id,
    actor,
    p_discoverable,
    p_show_company,
    normalized_introduction,
    now()
  )
  on conflict (event_id, user_id) do update
  set discoverable = excluded.discoverable,
      show_company = excluded.show_company,
      introduction = excluded.introduction,
      updated_at = now();

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'event.attendee_visibility_updated',
    'event',
    p_event_id,
    jsonb_build_object('discoverable', p_discoverable)
  );
end;
$$;

revoke all on function public.save_event_attendee_visibility(
  uuid, boolean, boolean, text
) from public;
grant execute on function public.save_event_attendee_visibility(
  uuid, boolean, boolean, text
) to authenticated;

create or replace function public.list_event_attendee_directory(
  p_event_id uuid,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  job_title text,
  company text,
  city text,
  country text,
  introduction text,
  connection_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.is_active_member(actor) then
    raise exception 'Active visible membership required';
  end if;

  if not exists (
    select 1
    from public.event_memberships membership
    where membership.event_id = p_event_id
      and membership.user_id = actor
      and membership.status in ('confirmed', 'attended')
  ) then
    raise exception 'Confirmed event attendance required';
  end if;

  return query
  select profile.id,
         profile.display_name,
         profile.avatar_url,
         profile.job_title,
         case when preference.show_company then profile.company else null end,
         profile.city,
         profile.country,
         preference.introduction,
         connection.status
  from public.event_attendee_preferences preference
  join public.event_memberships membership
    on membership.event_id = preference.event_id
   and membership.user_id = preference.user_id
  join public.profiles profile on profile.id = preference.user_id
  left join public.connections connection
    on connection.user_low = least(actor, profile.id)
   and connection.user_high = greatest(actor, profile.id)
  where preference.event_id = p_event_id
    and preference.discoverable
    and preference.user_id <> actor
    and membership.status in ('confirmed', 'attended')
    and profile.access_status = 'active'
    and not profile.visibility_paused
    and not public.is_blocked_pair(actor, profile.id)
  order by preference.updated_at desc, profile.display_name
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.list_event_attendee_directory(
  uuid, integer, integer
) from public;
grant execute on function public.list_event_attendee_directory(
  uuid, integer, integer
) to authenticated;

comment on table public.event_attendee_preferences is
  'Explicit per-event member opt-in. Private contacts are never projected into attendee discovery.';
comment on function public.list_event_attendee_directory is
  'Confirmed-attendee-only, blocked-pair-safe event discovery with connection state and no private contact data.';

drop function public.list_community_introductions(uuid);

create function public.list_community_introductions(p_community_id uuid)
returns table (
  introduction_id uuid,
  user_id uuid,
  display_name text,
  job_title text,
  company text,
  identity text,
  building text,
  can_offer text,
  seeking text,
  updated_at timestamptz,
  connection_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not exists (
    select 1
    from public.community_memberships membership
    where membership.community_id = p_community_id
      and membership.user_id = actor
      and membership.status = 'active'
  ) then
    raise exception 'Active community membership required';
  end if;

  return query
  select introduction.id,
         introduction.user_id,
         profile.display_name,
         profile.job_title,
         profile.company,
         introduction.identity,
         introduction.building,
         introduction.can_offer,
         introduction.seeking,
         introduction.updated_at,
         connection.status
  from public.community_introductions introduction
  join public.profiles profile on profile.id = introduction.user_id
  left join public.connections connection
    on connection.user_low = least(actor, introduction.user_id)
   and connection.user_high = greatest(actor, introduction.user_id)
  where introduction.community_id = p_community_id
    and introduction.status = 'published'
    and public.is_active_member(introduction.user_id)
    and not public.is_blocked_pair(actor, introduction.user_id)
  order by introduction.updated_at desc;
end;
$$;

revoke all on function public.list_community_introductions(uuid) from public;
grant execute on function public.list_community_introductions(uuid) to authenticated;

comment on function public.list_community_introductions is
  'Accepted-room-only introductions with blocked-pair filtering and direct connection state.';

commit;
