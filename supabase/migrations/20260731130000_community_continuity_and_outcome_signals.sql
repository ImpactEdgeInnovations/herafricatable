begin;

create table public.community_member_nudges (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  nudge_type text not null check (nudge_type in ('complete_introduction')),
  sent_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index community_member_nudges_rate_idx
  on public.community_member_nudges(
    community_id,
    user_id,
    nudge_type,
    sent_at desc
  );

alter table public.community_member_nudges enable row level security;

create or replace function public.get_community_continuity_summary(
  p_community_id uuid
)
returns table(
  active_members bigint,
  introduced_members bigint,
  missing_introductions bigint,
  participating_30d bigint,
  returning_participants_30d bigint,
  retention_eligible_members bigint,
  retention_rate_30d numeric,
  shared_outcomes_365d bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  return query
  with active as (
    select
      membership.user_id,
      coalesce(membership.joined_at, membership.created_at) as joined_at
    from public.community_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.community_id = p_community_id
      and membership.status = 'active'
      and profile.access_status = 'active'
      and not profile.is_test_account
  ),
  participants as (
    select distinct post.author_id as user_id
    from public.community_posts post
    join active member on member.user_id = post.author_id
    where post.community_id = p_community_id
      and post.status = 'published'
      and post.created_at >= now() - interval '30 days'

    union

    select distinct introduction.user_id
    from public.community_introductions introduction
    join active member on member.user_id = introduction.user_id
    where introduction.community_id = p_community_id
      and introduction.status = 'published'
      and introduction.updated_at >= now() - interval '30 days'

    union

    select distinct appreciation.user_id
    from public.community_post_appreciations appreciation
    join public.community_posts post on post.id = appreciation.post_id
    join active member on member.user_id = appreciation.user_id
    where post.community_id = p_community_id
      and post.status = 'published'
      and appreciation.created_at >= now() - interval '30 days'
  ),
  continuity as (
    select
      count(*)::bigint as active_count,
      count(*) filter (
        where exists (
          select 1
          from public.community_introductions introduction
          where introduction.community_id = p_community_id
            and introduction.user_id = active.user_id
            and introduction.status = 'published'
        )
      )::bigint as introduced_count,
      count(*) filter (
        where participant.user_id is not null
      )::bigint as participant_count,
      count(*) filter (
        where active.joined_at < now() - interval '30 days'
          and participant.user_id is not null
      )::bigint as returning_count,
      count(*) filter (
        where active.joined_at < now() - interval '30 days'
      )::bigint as eligible_count
    from active
    left join participants participant on participant.user_id = active.user_id
  ),
  outcome_groups as (
    select
      outcome.outcome_type,
      count(*)::bigint as outcome_count
    from public.connection_outcomes outcome
    join public.connections connection on connection.id = outcome.connection_id
    join active owner_member on owner_member.user_id = outcome.owner_id
    join active low_member on low_member.user_id = connection.user_low
    join active high_member on high_member.user_id = connection.user_high
    where outcome.share_anonymously
      and outcome.occurred_on >= current_date - 365
      and connection.status = 'accepted'
    group by outcome.outcome_type
    having count(distinct outcome.owner_id) >= 3
  )
  select
    continuity.active_count,
    continuity.introduced_count,
    continuity.active_count - continuity.introduced_count,
    continuity.participant_count,
    continuity.returning_count,
    continuity.eligible_count,
    case
      when continuity.eligible_count >= 5
      then round(
        continuity.returning_count::numeric
          * 100 / continuity.eligible_count::numeric,
        1
      )
      else null
    end,
    (
      select sum(outcome_group.outcome_count)::bigint
      from outcome_groups outcome_group
    )
  from continuity;
end;
$$;

create or replace function public.list_community_outcome_trends(
  p_community_id uuid
)
returns table(
  outcome_type text,
  outcome_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  return query
  with active as (
    select membership.user_id
    from public.community_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.community_id = p_community_id
      and membership.status = 'active'
      and profile.access_status = 'active'
      and not profile.is_test_account
  )
  select
    outcome.outcome_type,
    count(*)::bigint
  from public.connection_outcomes outcome
  join public.connections connection on connection.id = outcome.connection_id
  join active owner_member on owner_member.user_id = outcome.owner_id
  join active low_member on low_member.user_id = connection.user_low
  join active high_member on high_member.user_id = connection.user_high
  where outcome.share_anonymously
    and outcome.occurred_on >= current_date - 365
    and connection.status = 'accepted'
  group by outcome.outcome_type
  having count(distinct outcome.owner_id) >= 3
  order by count(*) desc, outcome.outcome_type;
end;
$$;

create or replace function public.list_community_introduction_followups(
  p_community_id uuid
)
returns table(
  user_id uuid,
  display_name text,
  job_title text,
  company text,
  joined_at timestamptz,
  last_nudged_at timestamptz,
  can_nudge boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  return query
  select
    membership.user_id,
    profile.display_name,
    profile.job_title,
    profile.company,
    coalesce(membership.joined_at, membership.created_at),
    nudge.last_nudged_at,
    nudge.last_nudged_at is null
      or nudge.last_nudged_at <= now() - interval '7 days'
  from public.community_memberships membership
  join public.profiles profile on profile.id = membership.user_id
  left join lateral (
    select max(member_nudge.sent_at) as last_nudged_at
    from public.community_member_nudges member_nudge
    where member_nudge.community_id = membership.community_id
      and member_nudge.user_id = membership.user_id
      and member_nudge.nudge_type = 'complete_introduction'
  ) nudge on true
  where membership.community_id = p_community_id
    and membership.status = 'active'
    and profile.access_status = 'active'
    and not profile.is_test_account
    and not exists (
      select 1
      from public.community_introductions introduction
      where introduction.community_id = membership.community_id
        and introduction.user_id = membership.user_id
        and introduction.status = 'published'
    )
  order by
    nudge.last_nudged_at nulls first,
    coalesce(membership.joined_at, membership.created_at),
    profile.display_name
  limit 50;
end;
$$;

create or replace function public.send_community_introduction_nudge(
  p_community_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid;
  community_slug text;
  in_app_allowed boolean;
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_community_id::text || ':' || p_user_id::text || ':complete_introduction',
      0
    )
  );

  if not exists (
    select 1
    from public.community_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.community_id = p_community_id
      and membership.user_id = p_user_id
      and membership.status = 'active'
      and profile.access_status = 'active'
      and not profile.is_test_account
  ) or exists (
    select 1
    from public.community_introductions introduction
    where introduction.community_id = p_community_id
      and introduction.user_id = p_user_id
      and introduction.status = 'published'
  ) then
    raise exception 'This introduction follow-up is no longer needed';
  end if;

  if exists (
    select 1
    from public.community_member_nudges nudge
    where nudge.community_id = p_community_id
      and nudge.user_id = p_user_id
      and nudge.nudge_type = 'complete_introduction'
      and nudge.sent_at > now() - interval '7 days'
  ) then
    raise exception 'A gentle reminder was already recorded this week';
  end if;

  insert into public.community_member_nudges(
    community_id,
    user_id,
    nudge_type,
    sent_by
  )
  values (
    p_community_id,
    p_user_id,
    'complete_introduction',
    auth.uid()
  )
  returning id into saved;

  insert into public.notification_preferences(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select preference.in_app_enabled
  into in_app_allowed
  from public.notification_preferences preference
  where preference.user_id = p_user_id;

  select community.slug
  into community_slug
  from public.communities community
  where community.id = p_community_id;

  if in_app_allowed then
    insert into public.notifications(
      user_id,
      kind,
      title,
      body,
      href,
      dedupe_key
    )
    values (
      p_user_id,
      'community',
      'A gentle introduction reminder',
      'Your community host has invited you to complete the room introduction when you are ready.',
      '/communities/' || community_slug,
      'community-introduction-nudge:' || saved::text
    )
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    'community.introduction_nudge_recorded',
    'community_member_nudge',
    saved,
    jsonb_build_object(
      'community_id', p_community_id,
      'member_id', p_user_id,
      'in_app_delivery_allowed', coalesce(in_app_allowed, false)
    )
  );

  return saved;
end;
$$;

revoke all on function public.get_community_continuity_summary(uuid)
  from public;
grant execute on function public.get_community_continuity_summary(uuid)
  to authenticated;
revoke all on function public.list_community_outcome_trends(uuid)
  from public;
grant execute on function public.list_community_outcome_trends(uuid)
  to authenticated;
revoke all on function public.list_community_introduction_followups(uuid)
  from public;
grant execute on function public.list_community_introduction_followups(uuid)
  to authenticated;
revoke all on function public.send_community_introduction_nudge(uuid, uuid)
  from public;
grant execute on function public.send_community_introduction_nudge(uuid, uuid)
  to authenticated;

comment on table public.community_member_nudges
  is 'Rate-limited operational reminders; no message body, engagement score or private relationship data is stored.';
comment on function public.get_community_continuity_summary(uuid)
  is 'Host-only aggregate continuity indicators. Thirty-day retention appears only with at least five eligible members.';
comment on function public.list_community_outcome_trends(uuid)
  is 'Anonymous community outcome types visible only when at least three distinct members shared that outcome type.';

commit;
