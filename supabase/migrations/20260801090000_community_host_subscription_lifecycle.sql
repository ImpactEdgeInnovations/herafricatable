begin;

alter table public.community_host_billing_settings
  add column grace_days integer not null default 7
  check(grace_days between 0 and 30);

alter table public.community_host_plan_orders
  add column order_kind text not null default 'new'
  check(order_kind in ('new', 'renewal', 'plan_change'));

alter table public.community_host_subscriptions
  add column grace_ends_at timestamptz,
  add column renewed_from_id uuid
    references public.community_host_subscriptions(id) on delete set null;

update public.community_host_subscriptions
set grace_ends_at = ends_at + interval '7 days'
where grace_ends_at is null;

alter table public.community_host_subscriptions
  add constraint community_host_subscription_grace_window
  check(grace_ends_at is null or grace_ends_at >= ends_at);

alter table public.community_host_subscriptions
  drop constraint if exists community_host_subscriptions_status_check;
alter table public.community_host_subscriptions
  add constraint community_host_subscriptions_status_check
  check(
    status in (
      'scheduled',
      'active',
      'grace',
      'paused',
      'cancelled',
      'expired'
    )
  );

create unique index community_one_scheduled_host_plan_idx
  on public.community_host_subscriptions(community_id)
  where status = 'scheduled';

create index community_host_subscription_lifecycle_idx
  on public.community_host_subscriptions(status, starts_at, ends_at, grace_ends_at);

drop function if exists public.set_community_host_billing_configuration(
  boolean,
  text
);
create function public.set_community_host_billing_configuration(
  p_enabled boolean,
  p_payment_mode text,
  p_grace_days integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_payment_mode not in ('automatic', 'manual_review', 'closed')
    or p_grace_days not between 0 and 30
    or (p_enabled and p_payment_mode = 'closed')
  then
    raise exception 'Valid host billing configuration required';
  end if;

  update public.feature_flags
  set
    enabled = p_enabled,
    updated_by = auth.uid(),
    updated_at = now()
  where key = 'community_host_self_service_billing';
  if not found then
    raise exception 'Host billing feature flag not found';
  end if;

  insert into public.community_host_billing_settings(
    id,
    payment_mode,
    grace_days,
    updated_by
  )
  values(true, p_payment_mode, p_grace_days, auth.uid())
  on conflict(id) do update
  set
    payment_mode = excluded.payment_mode,
    grace_days = excluded.grace_days,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    metadata
  )
  values(
    auth.uid(),
    'community.host_billing_configured',
    'community_host_billing',
    jsonb_build_object(
      'enabled', p_enabled,
      'payment_mode', p_payment_mode,
      'grace_days', p_grace_days
    )
  );
end;
$$;

drop function if exists public.get_community_host_billing(uuid);
create function public.get_community_host_billing(
  p_community_id uuid
)
returns table(
  self_service_enabled boolean,
  payment_mode text,
  grace_days integer,
  pending_order_id uuid,
  pending_order_reference text,
  pending_order_status text,
  pending_order_kind text,
  pending_plan_name text,
  pending_total_minor bigint,
  pending_currency text,
  scheduled_plan_name text,
  scheduled_starts_at timestamptz,
  scheduled_ends_at timestamptz,
  scheduled_order_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_community_owner(p_community_id) then
    raise exception 'Community owner required';
  end if;

  return query
  select
    public.community_host_self_service_billing_enabled(),
    coalesce(settings.payment_mode, 'closed'),
    coalesce(settings.grace_days, 7),
    pending.id,
    pending.reference,
    pending.status,
    pending_context.order_kind,
    pending_plan.name,
    pending.total_minor,
    pending.currency,
    scheduled_plan.name,
    scheduled.starts_at,
    scheduled.ends_at,
    scheduled_order.reference
  from (select 1) seed
  left join public.community_host_billing_settings settings
    on settings.id = true
  left join lateral(
    select host_order.*
    from public.community_host_plan_orders context
    join public.orders host_order on host_order.id = context.order_id
    where context.community_id = p_community_id
      and context.owner_id = auth.uid()
      and host_order.status in (
        'pending_payment',
        'pending_review',
        'paid',
        'approved'
      )
    order by host_order.created_at desc
    limit 1
  ) pending on true
  left join public.community_host_plan_orders pending_context
    on pending_context.order_id = pending.id
  left join public.community_host_plans pending_plan
    on pending_plan.id = pending_context.plan_id
  left join lateral(
    select subscription.*
    from public.community_host_subscriptions subscription
    where subscription.community_id = p_community_id
      and subscription.status = 'scheduled'
    order by subscription.starts_at
    limit 1
  ) scheduled on true
  left join public.community_host_plans scheduled_plan
    on scheduled_plan.id = scheduled.plan_id
  left join public.orders scheduled_order
    on scheduled_order.id = scheduled.order_id;
end;
$$;

drop function if exists public.get_community_host_billing_admin();
create function public.get_community_host_billing_admin()
returns table(
  self_service_enabled boolean,
  payment_mode text,
  grace_days integer,
  active_subscriptions bigint,
  grace_subscriptions bigint,
  scheduled_subscriptions bigint,
  ending_soon bigint,
  lapsed_paid_offers bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  return query
  select
    public.community_host_self_service_billing_enabled(),
    coalesce(settings.payment_mode, 'closed'),
    coalesce(settings.grace_days, 7),
    (
      select count(*)
      from public.community_host_subscriptions subscription
      where subscription.status = 'active'
        and subscription.ends_at > now()
    ),
    (
      select count(*)
      from public.community_host_subscriptions subscription
      where subscription.status = 'grace'
        and coalesce(subscription.grace_ends_at, subscription.ends_at) > now()
    ),
    (
      select count(*)
      from public.community_host_subscriptions subscription
      where subscription.status = 'scheduled'
    ),
    (
      select count(*)
      from public.community_host_subscriptions subscription
      where subscription.status = 'active'
        and subscription.ends_at > now()
        and subscription.ends_at <= now() + interval '7 days'
    ),
    (
      select count(*)
      from public.community_offers offer
      where offer.access_type = 'paid'
        and offer.status = 'published'
        and not exists(
          select 1
          from public.community_host_subscriptions subscription
          where subscription.community_id = offer.community_id
            and subscription.status in ('active', 'grace')
            and coalesce(
              subscription.grace_ends_at,
              subscription.ends_at
            ) > now()
        )
    )
  from (select 1) seed
  left join public.community_host_billing_settings settings
    on settings.id = true;
end;
$$;

create or replace function public.create_community_host_plan_order(
  p_community_id uuid,
  p_plan_id uuid,
  p_manual_reference text default null,
  p_manual_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  selected_plan public.community_host_plans%rowtype;
  current_subscription public.community_host_subscriptions%rowtype;
  billing_mode text;
  saved uuid;
  next_status text;
  kind text := 'new';
begin
  if not public.community_host_self_service_billing_enabled()
    or not public.is_community_owner(p_community_id)
  then
    raise exception 'Self-service host billing is unavailable';
  end if;

  select payment_mode
  into billing_mode
  from public.community_host_billing_settings
  where id = true;
  if billing_mode is null or billing_mode = 'closed' then
    raise exception 'Host plan checkout is closed';
  end if;

  select *
  into selected_plan
  from public.community_host_plans
  where id = p_plan_id
    and status = 'published'
    and price_minor > 0
  for share;
  if not found then
    raise exception 'Published paid host plan not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('community-host-plan:' || p_community_id::text, 0)
  );

  update public.orders host_order
  set status = 'expired', updated_at = now()
  where host_order.status = 'pending_payment'
    and host_order.reservation_expires_at <= now()
    and exists(
      select 1
      from public.community_host_plan_orders context
      where context.order_id = host_order.id
        and context.community_id = p_community_id
    );

  if exists(
    select 1
    from public.community_host_plan_orders context
    join public.orders host_order on host_order.id = context.order_id
    where context.community_id = p_community_id
      and host_order.status in (
        'pending_payment',
        'pending_review',
        'paid',
        'approved'
      )
  ) then
    raise exception 'A current host plan order already exists';
  end if;

  if exists(
    select 1
    from public.community_host_subscriptions subscription
    where subscription.community_id = p_community_id
      and subscription.status = 'scheduled'
  ) then
    raise exception 'An upcoming host plan is already scheduled';
  end if;

  select subscription.*
  into current_subscription
  from public.community_host_subscriptions subscription
  where subscription.community_id = p_community_id
    and subscription.status in ('active', 'grace')
    and coalesce(
      subscription.grace_ends_at,
      subscription.ends_at
    ) > now()
  order by subscription.ends_at desc
  limit 1
  for update;

  if current_subscription.id is not null then
    kind := case
      when current_subscription.plan_id = selected_plan.id then 'renewal'
      else 'plan_change'
    end;
  end if;

  next_status := case
    when billing_mode = 'automatic' then 'pending_payment'
    else 'pending_review'
  end;

  insert into public.orders(
    user_id,
    event_id,
    status,
    processing_mode,
    currency,
    subtotal_minor,
    total_minor,
    reservation_expires_at,
    order_type
  )
  values(
    actor,
    null,
    next_status,
    billing_mode,
    selected_plan.currency,
    selected_plan.price_minor,
    selected_plan.price_minor,
    case
      when billing_mode = 'automatic' then now() + interval '20 minutes'
    end,
    'community_host_plan'
  )
  returning id into saved;

  insert into public.order_items(
    order_id,
    community_host_plan_id,
    quantity,
    unit_price_minor,
    line_total_minor
  )
  values(
    saved,
    selected_plan.id,
    1,
    selected_plan.price_minor,
    selected_plan.price_minor
  );

  insert into public.community_host_plan_orders(
    order_id,
    community_id,
    plan_id,
    owner_id,
    order_kind
  )
  values(saved, p_community_id, selected_plan.id, actor, kind);

  if billing_mode = 'manual_review' then
    if char_length(trim(coalesce(p_manual_reference, ''))) < 3
      or char_length(trim(coalesce(p_manual_note, ''))) < 5
    then
      raise exception 'Payment reference and verification note required';
    end if;
    insert into public.manual_payment_reviews(
      order_id,
      submitted_reference,
      submitter_note
    )
    values(
      saved,
      trim(p_manual_reference),
      trim(p_manual_note)
    );
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    actor,
    'community.host_plan_order_created',
    'order',
    saved,
    jsonb_build_object(
      'community_id', p_community_id,
      'plan_id', p_plan_id,
      'mode', billing_mode,
      'order_kind', kind,
      'current_subscription_id', current_subscription.id
    )
  );
  return saved;
end;
$$;

create or replace function public.fulfill_community_host_plan_order(
  p_order_id uuid,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.orders%rowtype;
  context public.community_host_plan_orders%rowtype;
  selected_plan public.community_host_plans%rowtype;
  prior public.community_host_subscriptions%rowtype;
  subscription_id uuid;
  period_start timestamptz;
  period_end timestamptz;
  lifecycle_status text;
  configured_grace integer := 7;
begin
  select *
  into target
  from public.orders
  where id = p_order_id and order_type = 'community_host_plan'
  for update;
  if not found then
    raise exception 'Host plan order not found';
  end if;
  if target.status = 'fulfilled' then
    return;
  end if;
  if target.status not in ('paid', 'approved') then
    raise exception 'Order is not approved for fulfillment';
  end if;

  select *
  into context
  from public.community_host_plan_orders
  where order_id = p_order_id;
  if not found then
    raise exception 'Host plan order context not found';
  end if;

  if not exists(
    select 1
    from public.community_memberships membership
    where membership.community_id = context.community_id
      and membership.user_id = target.user_id
      and membership.role = 'owner'
      and membership.status = 'active'
  ) then
    raise exception 'Active community ownership required';
  end if;

  select *
  into selected_plan
  from public.community_host_plans
  where id = context.plan_id;
  if not found then
    raise exception 'Host plan not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('community-host-plan:' || context.community_id::text, 0)
  );

  if exists(
    select 1
    from public.community_host_subscriptions subscription
    where subscription.community_id = context.community_id
      and subscription.status = 'scheduled'
  ) then
    raise exception 'An upcoming host plan is already scheduled';
  end if;

  select subscription.*
  into prior
  from public.community_host_subscriptions subscription
  where subscription.community_id = context.community_id
    and subscription.status in ('active', 'grace')
    and coalesce(
      subscription.grace_ends_at,
      subscription.ends_at
    ) > now()
  order by subscription.ends_at desc
  limit 1
  for update;

  select coalesce(settings.grace_days, 7)
  into configured_grace
  from public.community_host_billing_settings settings
  where settings.id = true;

  period_start := greatest(coalesce(prior.ends_at, now()), now());
  period_end :=
    period_start + make_interval(months => selected_plan.duration_months);
  lifecycle_status := case
    when period_start > now() + interval '1 minute' then 'scheduled'
    else 'active'
  end;

  if lifecycle_status = 'active' and prior.id is not null then
    update public.community_host_subscriptions
    set status = 'expired', updated_at = now()
    where id = prior.id;
    update public.entitlements
    set status = 'expired', revoked_at = now()
    where community_host_subscription_id = prior.id
      and status = 'active';
  end if;

  insert into public.community_host_subscriptions(
    community_id,
    plan_id,
    granted_by,
    source,
    status,
    starts_at,
    ends_at,
    grace_ends_at,
    note,
    order_id,
    renewed_from_id
  )
  values(
    context.community_id,
    selected_plan.id,
    null,
    'purchase',
    lifecycle_status,
    period_start,
    period_end,
    period_end + make_interval(days => configured_grace),
    case
      when context.order_kind = 'renewal' then 'Self-service renewal'
      when context.order_kind = 'plan_change' then 'Scheduled plan change'
      else 'Self-service verified purchase'
    end,
    target.id,
    prior.id
  )
  returning id into subscription_id;

  if lifecycle_status = 'active' then
    insert into public.entitlements(
      user_id,
      community_id,
      community_host_subscription_id,
      order_id,
      entitlement_type,
      metadata
    )
    values(
      target.user_id,
      context.community_id,
      subscription_id,
      target.id,
      'community_host_tools',
      jsonb_build_object(
        'source', p_source,
        'plan_id', selected_plan.id,
        'order_kind', context.order_kind
      )
    )
    on conflict(order_id, entitlement_type) do nothing;
  end if;

  update public.orders
  set status = 'fulfilled', fulfilled_at = now(), updated_at = now()
  where id = target.id;

  perform public.enqueue_notification(
    target.user_id,
    'registration',
    case
      when lifecycle_status = 'scheduled' then 'Your next host plan is secured'
      else 'Your host plan is active'
    end,
    case
      when lifecycle_status = 'scheduled'
        then selected_plan.name || ' begins '
          || to_char(period_start at time zone 'Africa/Nairobi', 'FMDD Mon YYYY')
          || '. Your current plan continues until then.'
      else selected_plan.name
        || ' is now available in your community Host workspace.'
    end,
    '/communities',
    'community-host-plan:' || subscription_id
  );
end;
$$;

create or replace function public.grant_community_host_plan(
  p_community_id uuid,
  p_plan_id uuid,
  p_months integer,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid;
  owner_id uuid;
  configured_grace integer := 7;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_months not between 1 and 24
    or char_length(trim(coalesce(p_note, ''))) < 5
    or not exists(
      select 1
      from public.community_host_plans
      where id = p_plan_id and status = 'published'
    )
  then
    raise exception 'Published plan, active owner and grant reason required';
  end if;

  select membership.user_id
  into owner_id
  from public.community_memberships membership
  where membership.community_id = p_community_id
    and membership.role = 'owner'
    and membership.status = 'active'
  order by membership.joined_at
  limit 1;
  if owner_id is null then
    raise exception 'Published plan, active owner and grant reason required';
  end if;
  if exists(
    select 1
    from public.community_host_plan_orders context
    join public.orders host_order on host_order.id = context.order_id
    where context.community_id = p_community_id
      and host_order.status in (
        'pending_payment',
        'pending_review',
        'paid',
        'approved'
      )
  ) then
    raise exception 'Resolve the pending host plan order before a manual grant';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('community-host-plan:' || p_community_id::text, 0)
  );

  select coalesce(settings.grace_days, 7)
  into configured_grace
  from public.community_host_billing_settings settings
  where settings.id = true;

  update public.community_host_subscriptions
  set status = 'expired', updated_at = now()
  where community_id = p_community_id
    and status in ('scheduled', 'active', 'grace');

  update public.entitlements
  set status = 'expired', revoked_at = now()
  where community_host_subscription_id in(
    select subscription.id
    from public.community_host_subscriptions subscription
    where subscription.community_id = p_community_id
      and subscription.status = 'expired'
  )
    and entitlement_type = 'community_host_tools'
    and status = 'active';

  insert into public.community_host_subscriptions(
    community_id,
    plan_id,
    granted_by,
    source,
    status,
    starts_at,
    ends_at,
    grace_ends_at,
    note
  )
  values(
    p_community_id,
    p_plan_id,
    auth.uid(),
    'manual_grant',
    'active',
    now(),
    now() + make_interval(months => p_months),
    now() + make_interval(months => p_months)
      + make_interval(days => configured_grace),
    trim(p_note)
  )
  returning id into saved;

  insert into public.entitlements(
    user_id,
    community_id,
    community_host_subscription_id,
    entitlement_type,
    metadata
  )
  values(
    owner_id,
    p_community_id,
    saved,
    'community_host_tools',
    jsonb_build_object(
      'source', 'manual_grant',
      'plan_id', p_plan_id
    )
  )
  on conflict(
    user_id,
    community_host_subscription_id,
    entitlement_type
  ) where community_host_subscription_id is not null
  do nothing;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    'community.host_plan_granted',
    'community_host_subscription',
    saved,
    jsonb_build_object(
      'community_id', p_community_id,
      'plan_id', p_plan_id,
      'months', p_months,
      'note', trim(p_note),
      'replaced_existing', true
    )
  );

  perform public.enqueue_notification(
    owner_id,
    'registration',
    'Your host plan has been updated',
    'Admin activated your community host plan. Review it in the Host workspace.',
    '/communities',
    'community-host-grant:' || saved
  );
  return saved;
end;
$$;

create or replace function public.reconcile_community_host_subscriptions()
returns table(
  promoted integer,
  graced integer,
  expired integer,
  offers_paused integer,
  reminders_queued integer,
  orders_expired integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  promoted_count integer := 0;
  graced_count integer := 0;
  expired_count integer := 0;
  paused_count integer := 0;
  reminder_count integer := 0;
  order_expired_count integer := 0;
  scheduled record;
  changed record;
  owner record;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.is_admin(array['super_admin']::public.app_role[])
  then
    raise exception 'Service or Super Admin required';
  end if;

  with changed_orders as(
    update public.orders host_order
    set status = 'expired', updated_at = now()
    where host_order.order_type = 'community_host_plan'
      and host_order.status = 'pending_payment'
      and host_order.reservation_expires_at <= now()
    returning 1
  )
  select count(*) into order_expired_count from changed_orders;

  for scheduled in
    select subscription.*
    from public.community_host_subscriptions subscription
    where subscription.status = 'scheduled'
      and subscription.starts_at <= now()
    order by subscription.starts_at
    for update
  loop
    update public.community_host_subscriptions
    set status = 'expired', updated_at = now()
    where community_id = scheduled.community_id
      and id <> scheduled.id
      and status in ('active', 'grace');

    update public.entitlements entitlement
    set status = 'expired', revoked_at = now()
    where entitlement.community_host_subscription_id in(
      select subscription.id
      from public.community_host_subscriptions subscription
      where subscription.community_id = scheduled.community_id
        and subscription.id <> scheduled.id
        and subscription.status = 'expired'
    )
      and entitlement.status = 'active';

    update public.community_host_subscriptions
    set status = 'active', updated_at = now()
    where id = scheduled.id;

    insert into public.entitlements(
      user_id,
      community_id,
      community_host_subscription_id,
      order_id,
      entitlement_type,
      metadata
    )
    select
      host_order.user_id,
      scheduled.community_id,
      scheduled.id,
      scheduled.order_id,
      'community_host_tools',
      jsonb_build_object(
        'source', 'scheduled_activation',
        'plan_id', scheduled.plan_id
      )
    from public.orders host_order
    where host_order.id = scheduled.order_id
    on conflict(order_id, entitlement_type) do nothing;

    perform public.enqueue_notification(
      host_order.user_id,
      'registration',
      'Your renewed host plan is active',
      plan.name || ' is now active in your community Host workspace.',
      '/communities',
      'community-host-activated:' || scheduled.id
    )
    from public.orders host_order
    join public.community_host_plans plan on plan.id = scheduled.plan_id
    where host_order.id = scheduled.order_id;

    promoted_count := promoted_count + 1;
  end loop;

  for changed in
    update public.community_host_subscriptions subscription
    set status = 'grace', updated_at = now()
    where subscription.status = 'active'
      and subscription.ends_at <= now()
      and coalesce(
        subscription.grace_ends_at,
        subscription.ends_at
      ) > now()
    returning subscription.id, subscription.community_id,
      subscription.grace_ends_at
  loop
    graced_count := graced_count + 1;
    for owner in
      select membership.user_id
      from public.community_memberships membership
      where membership.community_id = changed.community_id
        and membership.role = 'owner'
        and membership.status = 'active'
    loop
      perform public.enqueue_notification(
        owner.user_id,
        'registration',
        'Your host plan needs renewal',
        'Paid member checkout is paused during the renewal grace period. Renew before '
          || to_char(
            changed.grace_ends_at at time zone 'Africa/Nairobi',
            'FMDD Mon YYYY'
          )
          || ' to keep host tools active.',
        '/communities',
        'community-host-grace:' || changed.id
      );
    end loop;
  end loop;

  for changed in
    update public.community_host_subscriptions subscription
    set status = 'expired', updated_at = now()
    where subscription.status in ('active', 'grace')
      and coalesce(
        subscription.grace_ends_at,
        subscription.ends_at
      ) <= now()
    returning subscription.id, subscription.community_id
  loop
    expired_count := expired_count + 1;

    update public.entitlements
    set status = 'expired', revoked_at = now()
    where community_host_subscription_id = changed.id
      and status = 'active';

    with paused_offers as(
      update public.community_offers
      set status = 'paused', updated_at = now()
      where community_id = changed.community_id
        and access_type = 'paid'
        and status = 'published'
      returning 1
    )
    select paused_count + count(*) into paused_count from paused_offers;

    for owner in
      select membership.user_id
      from public.community_memberships membership
      where membership.community_id = changed.community_id
        and membership.role = 'owner'
        and membership.status = 'active'
    loop
      perform public.enqueue_notification(
        owner.user_id,
        'registration',
        'Your host plan has expired',
        'Host commerce is paused. Renew a plan in the Host workspace; existing community memberships remain intact.',
        '/communities',
        'community-host-expired:' || changed.id
      );
    end loop;
  end loop;

  for changed in
    select
      subscription.id,
      subscription.community_id,
      subscription.ends_at
    from public.community_host_subscriptions subscription
    where subscription.status = 'active'
      and subscription.ends_at > now()
      and subscription.ends_at <= now() + interval '7 days'
  loop
    for owner in
      select membership.user_id
      from public.community_memberships membership
      where membership.community_id = changed.community_id
        and membership.role = 'owner'
        and membership.status = 'active'
    loop
      perform public.enqueue_notification(
        owner.user_id,
        'registration',
        'Your host plan renews soon',
        'Your current plan ends '
          || to_char(
            changed.ends_at at time zone 'Africa/Nairobi',
            'FMDD Mon YYYY'
          )
          || '. Secure the next period in your Host workspace.',
        '/communities',
        'community-host-renewal-reminder:' || changed.id
      );
      reminder_count := reminder_count + 1;
    end loop;
  end loop;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    metadata
  )
  values(
    auth.uid(),
    'community.host_subscriptions_reconciled',
    'community_host_subscriptions',
    jsonb_build_object(
      'promoted', promoted_count,
      'graced', graced_count,
      'expired', expired_count,
      'offers_paused', paused_count,
      'reminders_queued', reminder_count,
      'orders_expired', order_expired_count
    )
  );

  return query
  select
    promoted_count,
    graced_count,
    expired_count,
    paused_count,
    reminder_count,
    order_expired_count;
end;
$$;

create or replace function public.handle_host_plan_order_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_current boolean := false;
  target_community uuid;
begin
  if new.order_type <> 'community_host_plan'
    or new.status <> 'refunded'
    or old.status = 'refunded'
  then
    return new;
  end if;

  select context.community_id
  into target_community
  from public.community_host_plan_orders context
  where context.order_id = new.id;

  select exists(
    select 1
    from public.community_host_subscriptions subscription
    where subscription.order_id = new.id
      and subscription.status in ('active', 'grace')
  )
  into was_current;

  update public.community_host_subscriptions
  set status = 'cancelled', updated_at = now()
  where order_id = new.id
    and status in ('scheduled', 'active', 'grace');

  update public.entitlements
  set status = 'revoked', revoked_at = now()
  where order_id = new.id and status = 'active';

  if was_current then
    update public.community_offers
    set status = 'paused', updated_at = now()
    where community_id = target_community
      and access_type = 'paid'
      and status = 'published';
  end if;

  perform public.enqueue_notification(
    new.user_id,
    'registration',
    'Host plan payment reversed',
    case
      when was_current
        then 'The related host plan and paid checkout have been paused. Contact support if this is unexpected.'
      else 'The upcoming host plan has been cancelled. Your current plan is unchanged.'
    end,
    '/communities',
    'community-host-reversed:' || new.id
  );
  return new;
end;
$$;

drop trigger if exists orders_host_plan_reversal on public.orders;
create trigger orders_host_plan_reversal
after update of status on public.orders
for each row execute function public.handle_host_plan_order_reversal();

drop function if exists public.list_community_host_plan_orders_admin();
create function public.list_community_host_plan_orders_admin()
returns table(
  order_id uuid,
  reference text,
  community_id uuid,
  community_name text,
  plan_id uuid,
  plan_name text,
  order_kind text,
  owner_email text,
  owner_name text,
  status text,
  processing_mode text,
  total_minor bigint,
  currency text,
  submitted_reference text,
  submitter_note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  return query
  select
    host_order.id,
    host_order.reference,
    community.id,
    community.name,
    plan.id,
    plan.name,
    context.order_kind,
    user_row.email::text,
    profile.display_name,
    host_order.status,
    host_order.processing_mode,
    host_order.total_minor,
    host_order.currency,
    review.submitted_reference,
    review.submitter_note,
    host_order.created_at
  from public.community_host_plan_orders context
  join public.orders host_order on host_order.id = context.order_id
  join public.communities community on community.id = context.community_id
  join public.community_host_plans plan on plan.id = context.plan_id
  join auth.users user_row on user_row.id = context.owner_id
  left join public.profiles profile on profile.id = context.owner_id
  left join public.manual_payment_reviews review
    on review.order_id = host_order.id
  order by host_order.created_at desc;
end;
$$;

create or replace function public.get_community_host_commerce(
  p_community_id uuid
)
returns table(
  host_plan_id uuid,
  host_plan_name text,
  host_plan_status text,
  host_plan_ends_at timestamptz,
  platform_fee_bps integer,
  max_moderators integer,
  plan_features jsonb,
  payout_status text,
  terms_version text,
  terms_accepted_at timestamptz,
  offer_id uuid,
  offer_name text,
  offer_description text,
  offer_access_type text,
  offer_billing_interval text,
  offer_price_minor bigint,
  offer_currency text,
  offer_duration_months integer,
  offer_grace_days integer,
  offer_payment_mode text,
  offer_status text,
  gross_minor bigint,
  held_minor bigint,
  settled_minor bigint,
  paying_members bigint,
  commerce_enabled boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_community_owner(p_community_id) then
    raise exception 'Community owner required';
  end if;

  return query
  select
    plan.id,
    plan.name,
    subscription.status,
    subscription.ends_at,
    plan.platform_fee_bps,
    plan.max_moderators,
    plan.features,
    coalesce(account.payout_status, 'not_started'),
    account.terms_version,
    account.terms_accepted_at,
    offer.id,
    offer.name,
    offer.description,
    offer.access_type,
    offer.billing_interval,
    offer.price_minor,
    offer.currency,
    offer.duration_months,
    offer.grace_days,
    offer.payment_mode,
    offer.status,
    coalesce(ledger.gross_minor, 0),
    coalesce(ledger.held_minor, 0),
    coalesce(ledger.settled_minor, 0),
    coalesce(access.paying_members, 0),
    public.community_creator_commerce_enabled()
  from (select 1) seed
  left join lateral(
    select current_subscription.*
    from public.community_host_subscriptions current_subscription
    where current_subscription.community_id = p_community_id
      and current_subscription.status in ('active', 'grace')
      and coalesce(
        current_subscription.grace_ends_at,
        current_subscription.ends_at
      ) > now()
    order by current_subscription.ends_at desc
    limit 1
  ) subscription on true
  left join public.community_host_plans plan on plan.id = subscription.plan_id
  left join public.community_host_accounts account
    on account.community_id = p_community_id
  left join public.community_offers offer
    on offer.community_id = p_community_id
  left join lateral(
    select
      sum(entry.gross_minor)::bigint as gross_minor,
      sum(entry.host_net_minor)
        filter(where entry.settlement_status in ('held', 'eligible'))::bigint
        as held_minor,
      sum(entry.host_net_minor)
        filter(where entry.settlement_status = 'settled')::bigint
        as settled_minor
    from public.community_revenue_ledger entry
    where entry.community_id = p_community_id
  ) ledger on true
  left join lateral(
    select count(distinct period.user_id)::bigint as paying_members
    from public.community_access_periods period
    where period.community_id = p_community_id
      and period.status in ('active', 'grace')
      and period.grace_ends_at > now()
  ) access on true;
end;
$$;

revoke all on function public.set_community_host_billing_configuration(
  boolean,
  text,
  integer
) from public;
grant execute on function public.set_community_host_billing_configuration(
  boolean,
  text,
  integer
) to authenticated;
revoke all on function public.get_community_host_billing(uuid) from public;
grant execute on function public.get_community_host_billing(uuid)
  to authenticated;
revoke all on function public.get_community_host_billing_admin() from public;
grant execute on function public.get_community_host_billing_admin()
  to authenticated;
revoke all on function public.create_community_host_plan_order(
  uuid,
  uuid,
  text,
  text
) from public;
grant execute on function public.create_community_host_plan_order(
  uuid,
  uuid,
  text,
  text
) to authenticated;
revoke all on function public.fulfill_community_host_plan_order(uuid, text)
  from public;
revoke all on function public.grant_community_host_plan(
  uuid,
  uuid,
  integer,
  text
) from public;
grant execute on function public.grant_community_host_plan(
  uuid,
  uuid,
  integer,
  text
) to authenticated;
revoke all on function public.reconcile_community_host_subscriptions()
  from public;
grant execute on function public.reconcile_community_host_subscriptions()
  to authenticated, service_role;
revoke all on function public.handle_host_plan_order_reversal() from public;
revoke all on function public.list_community_host_plan_orders_admin()
  from public;
grant execute on function public.list_community_host_plan_orders_admin()
  to authenticated;
revoke all on function public.get_community_host_commerce(uuid) from public;
grant execute on function public.get_community_host_commerce(uuid)
  to authenticated;

comment on function public.reconcile_community_host_subscriptions() is
  'Promotes scheduled host plans, applies grace and expiry, pauses lapsed paid offers and queues owner reminders.';

commit;
