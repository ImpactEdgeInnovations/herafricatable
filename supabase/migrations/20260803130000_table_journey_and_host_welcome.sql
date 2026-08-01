begin;

create table if not exists public.community_member_welcomes (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  welcomed_by uuid not null references auth.users(id) on delete restrict,
  welcomed_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index if not exists community_member_welcomes_host_idx
  on public.community_member_welcomes (welcomed_by, welcomed_at desc);

alter table public.community_member_welcomes enable row level security;

revoke all on table public.community_member_welcomes from anon, authenticated;

create or replace function public.get_my_table_journey()
returns table (
  journey_started_at timestamptz,
  days_since_start integer,
  profile_ready boolean,
  community_joined boolean,
  community_slug text,
  community_name text,
  introduction_shared boolean,
  gathering_reserved boolean,
  trusted_connection_made boolean,
  follow_up_planned boolean,
  completed_steps integer,
  in_first_week boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active membership required';
  end if;

  return query
  with member_profile as (
    select
      profile.onboarding_completed_at,
      profile.created_at,
      profile.profile_completion = 100
        and profile.onboarding_completed_at is not null as profile_ready
    from public.profiles profile
    where profile.id = auth.uid()
  ), preferred_community as (
    select
      community.id,
      community.slug,
      community.name,
      membership.joined_at,
      exists (
        select 1
        from public.community_introductions introduction
        where introduction.community_id = community.id
          and introduction.user_id = auth.uid()
          and introduction.status = 'published'
      ) as has_introduction
    from public.community_memberships membership
    join public.communities community on community.id = membership.community_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and community.status = 'published'
    order by
      exists (
        select 1
        from public.community_introductions introduction
        where introduction.community_id = community.id
          and introduction.user_id = auth.uid()
          and introduction.status = 'published'
      ) desc,
      membership.joined_at desc nulls last,
      membership.created_at desc
    limit 1
  ), signals as (
    select
      coalesce(
        member_profile.onboarding_completed_at,
        preferred_community.joined_at,
        member_profile.created_at
      ) as started_at,
      member_profile.profile_ready,
      preferred_community.id is not null as community_joined,
      preferred_community.slug as community_slug,
      preferred_community.name as community_name,
      coalesce(preferred_community.has_introduction, false) as introduction_shared,
      exists (
        select 1
        from public.event_memberships event_member
        where event_member.user_id = auth.uid()
          and event_member.status in ('confirmed', 'attended')
      ) as gathering_reserved,
      exists (
        select 1
        from public.connections connection
        where connection.status = 'accepted'
          and auth.uid() in (connection.user_low, connection.user_high)
      ) as trusted_connection_made,
      exists (
        select 1
        from public.connection_followups followup
        join public.connections connection on connection.id = followup.connection_id
        where followup.owner_id = auth.uid()
          and connection.status = 'accepted'
          and auth.uid() in (connection.user_low, connection.user_high)
          and (
            followup.next_step is not null
            or followup.last_completed_at is not null
          )
      ) as follow_up_planned
    from member_profile
    left join preferred_community on true
  )
  select
    signals.started_at,
    greatest(current_date - signals.started_at::date, 0),
    signals.profile_ready,
    signals.community_joined,
    signals.community_slug,
    signals.community_name,
    signals.introduction_shared,
    signals.gathering_reserved,
    signals.trusted_connection_made,
    signals.follow_up_planned,
    (
      signals.profile_ready::integer
      + signals.introduction_shared::integer
      + signals.gathering_reserved::integer
      + signals.trusted_connection_made::integer
      + signals.follow_up_planned::integer
    ),
    now() < signals.started_at + interval '7 days'
  from signals;
end;
$$;

create or replace function public.list_community_welcome_queue(
  p_community_id uuid,
  p_limit integer default 12
)
returns table (
  user_id uuid,
  display_name text,
  job_title text,
  company text,
  joined_at timestamptz,
  introduction_shared boolean,
  first_contribution_shared boolean,
  welcomed_at timestamptz,
  can_welcome boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled()
    or not public.can_manage_community(p_community_id)
  then
    raise exception 'Community Host access required';
  end if;

  return query
  select
    membership.user_id,
    profile.display_name,
    profile.job_title,
    profile.company,
    coalesce(membership.joined_at, membership.created_at),
    exists (
      select 1
      from public.community_introductions introduction
      where introduction.community_id = p_community_id
        and introduction.user_id = membership.user_id
        and introduction.status = 'published'
    ),
    exists (
      select 1
      from public.community_posts post
      where post.community_id = p_community_id
        and post.author_id = membership.user_id
        and post.parent_post_id is null
        and post.status = 'published'
    ),
    welcome.welcomed_at,
    welcome.user_id is null and membership.user_id <> auth.uid()
  from public.community_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  left join public.community_member_welcomes welcome
    on welcome.community_id = membership.community_id
   and welcome.user_id = membership.user_id
  where membership.community_id = p_community_id
    and membership.status = 'active'
    and membership.role = 'member'
    and profile.access_status = 'active'
    and coalesce(membership.joined_at, membership.created_at) >= now() - interval '30 days'
  order by
    welcome.welcomed_at nulls first,
    exists (
      select 1
      from public.community_introductions introduction
      where introduction.community_id = p_community_id
        and introduction.user_id = membership.user_id
        and introduction.status = 'published'
    ),
    coalesce(membership.joined_at, membership.created_at) desc
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
end;
$$;

create or replace function public.send_community_member_welcome(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target_membership_id uuid;
  community_name text;
  community_slug text;
begin
  if not public.communities_enabled()
    or not public.can_manage_community(p_community_id, actor)
  then
    raise exception 'Community Host access required';
  end if;
  if actor = p_user_id then
    raise exception 'Choose another community member';
  end if;
  if (
    select count(*)
    from public.community_member_welcomes welcome
    where welcome.welcomed_by = actor
      and welcome.welcomed_at >= now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Welcome limit reached. Please try again later';
  end if;

  select membership.id, community.name, community.slug
  into target_membership_id, community_name, community_slug
  from public.community_memberships membership
  join public.communities community on community.id = membership.community_id
  join public.profiles profile on profile.id = membership.user_id
  where membership.community_id = p_community_id
    and membership.user_id = p_user_id
    and membership.status = 'active'
    and membership.role = 'member'
    and profile.access_status = 'active'
    and community.status = 'published';

  if target_membership_id is null then
    raise exception 'Active community member not found';
  end if;

  insert into public.community_member_welcomes (
    community_id,
    user_id,
    welcomed_by
  ) values (
    p_community_id,
    p_user_id,
    actor
  )
  on conflict (community_id, user_id) do nothing;

  if not found then
    return;
  end if;

  perform public.enqueue_notification(
    p_user_id,
    'community',
    'Welcome to ' || community_name,
    'Your Community Host is glad you are here. Start with a short introduction when you are ready.',
    '/communities/' || community_slug,
    'community-welcome:' || p_community_id || ':' || p_user_id
  );

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    actor,
    'community.member_welcomed',
    'community_membership',
    target_membership_id,
    jsonb_build_object('community_id', p_community_id)
  );
end;
$$;

revoke all on function public.get_my_table_journey() from public;
grant execute on function public.get_my_table_journey() to authenticated;
revoke all on function public.list_community_welcome_queue(uuid, integer) from public;
grant execute on function public.list_community_welcome_queue(uuid, integer) to authenticated;
revoke all on function public.send_community_member_welcome(uuid, uuid) from public;
grant execute on function public.send_community_member_welcome(uuid, uuid) to authenticated;

commit;
