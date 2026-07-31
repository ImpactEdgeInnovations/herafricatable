begin;

create or replace function public.community_host_has_feature(
  p_community_id uuid,
  p_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when public.is_admin(array['super_admin']::public.app_role[]) then true
      when p_feature not in (
        'paid_access',
        'advanced_analytics',
        'automations',
        'multiple_moderators'
      ) then false
      else coalesce((
        select plan.features @> jsonb_build_object(p_feature, true)
        from public.community_host_subscriptions subscription
        join public.community_host_plans plan on plan.id = subscription.plan_id
        where subscription.community_id = p_community_id
          and subscription.status in ('active', 'grace')
          and subscription.ends_at > now()
        order by subscription.ends_at desc
        limit 1
      ), false)
    end;
$$;

create or replace function public.get_community_host_capabilities(
  p_community_id uuid
)
returns table(
  plan_id uuid,
  plan_name text,
  plan_status text,
  plan_ends_at timestamptz,
  host_tools_active boolean,
  paid_access boolean,
  advanced_analytics boolean,
  automations boolean,
  multiple_moderators boolean,
  max_moderators integer,
  current_moderators bigint
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
    plan.id,
    plan.name,
    subscription.status,
    subscription.ends_at,
    subscription.id is not null,
    coalesce(plan.features @> '{"paid_access": true}'::jsonb, false),
    coalesce(plan.features @> '{"advanced_analytics": true}'::jsonb, false),
    coalesce(plan.features @> '{"automations": true}'::jsonb, false),
    coalesce(
      plan.features @> '{"multiple_moderators": true}'::jsonb,
      false
    ),
    coalesce(plan.max_moderators, 1),
    (
      select count(*)::bigint
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.status = 'active'
        and membership.role = 'moderator'
    )
  from (select 1) seed
  left join lateral (
    select current_subscription.*
    from public.community_host_subscriptions current_subscription
    where current_subscription.community_id = p_community_id
      and current_subscription.status in ('active', 'grace')
      and current_subscription.ends_at > now()
    order by current_subscription.ends_at desc
    limit 1
  ) subscription on true
  left join public.community_host_plans plan on plan.id = subscription.plan_id;
end;
$$;

create or replace function public.enforce_community_moderator_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  moderator_limit integer := 1;
  active_moderators bigint;
begin
  if new.status <> 'active' or new.role <> 'moderator' then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.status = 'active'
    and old.role = 'moderator'
  then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.community_id::text || ':moderator-entitlement',
      0
    )
  );

  select plan.max_moderators
  into moderator_limit
  from public.community_host_subscriptions subscription
  join public.community_host_plans plan on plan.id = subscription.plan_id
  where subscription.community_id = new.community_id
    and subscription.status in ('active', 'grace')
    and subscription.ends_at > now()
  order by subscription.ends_at desc
  limit 1;

  moderator_limit := coalesce(moderator_limit, 1);

  select count(*)
  into active_moderators
  from public.community_memberships membership
  where membership.community_id = new.community_id
    and membership.status = 'active'
    and membership.role = 'moderator'
    and membership.id <> new.id;

  if active_moderators >= moderator_limit then
    raise exception
      'Your host plan includes % moderator%. Choose a higher plan or make an existing moderator a member first',
      moderator_limit,
      case when moderator_limit = 1 then '' else 's' end;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_community_moderator_entitlement_before_write
  on public.community_memberships;
create trigger enforce_community_moderator_entitlement_before_write
before insert or update of role, status
on public.community_memberships
for each row execute function public.enforce_community_moderator_entitlement();

create or replace function public.save_community_host_plan(
  p_plan_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_price_minor bigint,
  p_currency text,
  p_duration_months integer,
  p_platform_fee_bps integer,
  p_max_moderators integer,
  p_features jsonb,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid := p_plan_id;
  clean_features jsonb := coalesce(p_features, '{}'::jsonb);
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_status not in ('draft', 'published', 'archived')
    or p_price_minor < 0
    or upper(p_currency) !~ '^[A-Z]{3}$'
    or p_duration_months not between 1 and 12
    or p_platform_fee_bps not between 0 and 3000
    or p_max_moderators not between 1 and 50
    or jsonb_typeof(clean_features) <> 'object'
    or exists (
      select 1
      from jsonb_each(clean_features) feature
      where feature.key not in (
        'paid_access',
        'advanced_analytics',
        'automations',
        'multiple_moderators'
      )
        or jsonb_typeof(feature.value) <> 'boolean'
    )
  then
    raise exception 'Valid host plan configuration required';
  end if;

  clean_features := clean_features
    || jsonb_build_object(
      'paid_access',
      coalesce(clean_features @> '{"paid_access": true}'::jsonb, false),
      'advanced_analytics',
      coalesce(
        clean_features @> '{"advanced_analytics": true}'::jsonb,
        false
      ),
      'automations',
      coalesce(clean_features @> '{"automations": true}'::jsonb, false),
      'multiple_moderators',
      p_max_moderators > 1
    );

  if p_plan_id is null then
    insert into public.community_host_plans(
      slug,
      name,
      description,
      price_minor,
      currency,
      duration_months,
      platform_fee_bps,
      max_moderators,
      features,
      status,
      created_by
    )
    values(
      lower(trim(p_slug)),
      trim(p_name),
      trim(p_description),
      p_price_minor,
      upper(p_currency),
      p_duration_months,
      p_platform_fee_bps,
      p_max_moderators,
      clean_features,
      p_status,
      auth.uid()
    )
    returning id into saved;
  else
    update public.community_host_plans
    set slug = lower(trim(p_slug)),
        name = trim(p_name),
        description = trim(p_description),
        price_minor = p_price_minor,
        currency = upper(p_currency),
        duration_months = p_duration_months,
        platform_fee_bps = p_platform_fee_bps,
        max_moderators = p_max_moderators,
        features = clean_features,
        status = p_status,
        updated_at = now()
    where id = p_plan_id;
    if not found then
      raise exception 'Host plan not found';
    end if;
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    case
      when p_plan_id is null then 'community.host_plan_created'
      else 'community.host_plan_updated'
    end,
    'community_host_plan',
    saved,
    jsonb_build_object(
      'status', p_status,
      'platform_fee_bps', p_platform_fee_bps,
      'max_moderators', p_max_moderators,
      'features', clean_features
    )
  );

  return saved;
end;
$$;

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
  if not public.community_host_has_feature(
    p_community_id,
    'advanced_analytics'
  ) then
    raise exception 'Advanced insights are not included in the active host plan';
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
  if not public.community_host_has_feature(
    p_community_id,
    'advanced_analytics'
  ) then
    raise exception 'Advanced insights are not included in the active host plan';
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
  if not public.community_host_has_feature(p_community_id, 'automations') then
    raise exception 'Host reminders are not included in the active host plan';
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
      'in_app_delivery_allowed', coalesce(in_app_allowed, false),
      'entitlement', 'automations'
    )
  );

  return saved;
end;
$$;

revoke all on function public.community_host_has_feature(uuid, text)
  from public;

revoke all on function public.get_community_host_capabilities(uuid)
  from public;
grant execute on function public.get_community_host_capabilities(uuid)
  to authenticated;

revoke all on function public.enforce_community_moderator_entitlement()
  from public;

revoke all on function public.save_community_host_plan(
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  integer,
  integer,
  integer,
  jsonb,
  text
) from public;
grant execute on function public.save_community_host_plan(
  uuid,
  text,
  text,
  text,
  bigint,
  text,
  integer,
  integer,
  integer,
  jsonb,
  text
) to authenticated;

revoke all on function public.get_community_continuity_summary(uuid)
  from public;
grant execute on function public.get_community_continuity_summary(uuid)
  to authenticated;

revoke all on function public.list_community_outcome_trends(uuid)
  from public;
grant execute on function public.list_community_outcome_trends(uuid)
  to authenticated;

revoke all on function public.send_community_introduction_nudge(uuid, uuid)
  from public;
grant execute on function public.send_community_introduction_nudge(uuid, uuid)
  to authenticated;

commit;
