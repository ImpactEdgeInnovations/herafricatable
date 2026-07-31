begin;

insert into public.feature_flags(key, enabled, description)
values(
  'community_host_self_service_billing',
  false,
  'Approved community owners can purchase a published host plan'
)
on conflict(key) do nothing;

create table public.community_host_billing_settings(
  id boolean primary key default true check(id),
  payment_mode text not null default 'closed'
    check(payment_mode in ('automatic', 'manual_review', 'closed')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.community_host_billing_settings(id, payment_mode)
values(true, 'closed')
on conflict(id) do nothing;

create table public.community_host_plan_orders(
  order_id uuid primary key references public.orders(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete restrict,
  plan_id uuid not null references public.community_host_plans(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index community_host_plan_orders_community_idx
  on public.community_host_plan_orders(community_id, created_at desc);

alter table public.community_host_billing_settings enable row level security;
alter table public.community_host_plan_orders enable row level security;

create policy "Community owners read their host plan orders"
  on public.community_host_plan_orders for select
  to authenticated
  using(
    owner_id = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  );

alter table public.community_host_subscriptions
  add column order_id uuid unique
  references public.orders(id) on delete restrict;

alter table public.orders
  drop constraint if exists orders_order_type_check;
alter table public.orders
  add constraint orders_order_type_check
  check(
    order_type in (
      'event',
      'course',
      'membership',
      'community',
      'community_host_plan'
    )
  );
alter table public.orders
  drop constraint if exists order_context_present;
alter table public.orders
  add constraint order_context_present
  check(
    (order_type = 'event' and event_id is not null)
    or (
      order_type in (
        'course',
        'membership',
        'community',
        'community_host_plan'
      )
      and event_id is null
    )
  );

alter table public.order_items
  add column community_host_plan_id uuid
  references public.community_host_plans(id) on delete restrict;
alter table public.order_items
  drop constraint if exists order_item_exactly_one_product;
alter table public.order_items
  add constraint order_item_exactly_one_product
  check(
    num_nonnulls(
      ticket_type_id,
      course_id,
      membership_plan_id,
      community_offer_id,
      community_host_plan_id
    ) = 1
  );

alter table public.entitlements
  add column community_host_subscription_id uuid
  references public.community_host_subscriptions(id) on delete cascade;
alter table public.entitlements
  drop constraint if exists entitlements_entitlement_type_check;
alter table public.entitlements
  add constraint entitlements_entitlement_type_check
  check(
    entitlement_type in (
      'event_access',
      'member_onboarding',
      'course_access',
      'membership_access',
      'community_access',
      'community_host_tools'
    )
  );
create unique index entitlements_community_host_subscription_idx
  on public.entitlements(
    user_id,
    community_host_subscription_id,
    entitlement_type
  )
  where community_host_subscription_id is not null;

create or replace function public.community_host_self_service_billing_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select enabled
      from public.feature_flags
      where key = 'community_host_self_service_billing'
    ),
    false
  )
$$;

create or replace function public.set_community_host_billing_configuration(
  p_enabled boolean,
  p_payment_mode text
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
    updated_by
  )
  values(true, p_payment_mode, auth.uid())
  on conflict(id) do update
  set
    payment_mode = excluded.payment_mode,
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
      'payment_mode', p_payment_mode
    )
  );
end;
$$;

create or replace function public.get_community_host_billing(
  p_community_id uuid
)
returns table(
  self_service_enabled boolean,
  payment_mode text,
  pending_order_id uuid,
  pending_order_reference text,
  pending_order_status text,
  pending_plan_name text,
  pending_total_minor bigint,
  pending_currency text
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
    pending.id,
    pending.reference,
    pending.status,
    plan.name,
    pending.total_minor,
    pending.currency
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
  left join public.community_host_plan_orders context
    on context.order_id = pending.id
  left join public.community_host_plans plan on plan.id = context.plan_id;
end;
$$;

create or replace function public.get_community_host_billing_admin()
returns table(
  self_service_enabled boolean,
  payment_mode text
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
    coalesce(settings.payment_mode, 'closed')
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
  plan public.community_host_plans%rowtype;
  billing_mode text;
  saved uuid;
  next_status text;
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
  into plan
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

  update public.community_host_subscriptions
  set status = 'expired', updated_at = now()
  where community_id = p_community_id
    and status in ('active', 'grace')
    and ends_at <= now();

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
    from public.community_host_subscriptions subscription
    where subscription.community_id = p_community_id
      and subscription.status in ('active', 'grace')
      and subscription.ends_at > now()
  ) then
    raise exception 'An active host plan already exists';
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
    raise exception 'A current host plan order already exists';
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
    plan.currency,
    plan.price_minor,
    plan.price_minor,
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
  values(saved, plan.id, 1, plan.price_minor, plan.price_minor);

  insert into public.community_host_plan_orders(
    order_id,
    community_id,
    plan_id,
    owner_id
  )
  values(saved, p_community_id, plan.id, actor);

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
      'mode', billing_mode
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
  plan public.community_host_plans%rowtype;
  subscription_id uuid;
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
  into plan
  from public.community_host_plans
  where id = context.plan_id;
  if not found then
    raise exception 'Host plan not found';
  end if;

  if exists(
    select 1
    from public.community_host_subscriptions subscription
    where subscription.community_id = context.community_id
      and subscription.status in ('active', 'grace')
      and subscription.ends_at > now()
  ) then
    raise exception 'An active host plan already exists';
  end if;

  insert into public.community_host_subscriptions(
    community_id,
    plan_id,
    granted_by,
    source,
    status,
    starts_at,
    ends_at,
    note,
    order_id
  )
  values(
    context.community_id,
    plan.id,
    null,
    'purchase',
    'active',
    now(),
    now() + make_interval(months => plan.duration_months),
    'Self-service verified purchase',
    target.id
  )
  returning id into subscription_id;

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
      'plan_id', plan.id,
      'features', plan.features
    )
  )
  on conflict(order_id, entitlement_type) do nothing;

  update public.orders
  set status = 'fulfilled', fulfilled_at = now(), updated_at = now()
  where id = target.id;

  perform public.enqueue_notification(
    target.user_id,
    'registration',
    'Your host plan is active',
    plan.name || ' is now available in your community Host workspace.',
    '/communities',
    'community-host-plan:' || subscription_id
  );
end;
$$;

create or replace function public.review_community_host_plan_order(
  p_order_id uuid,
  p_action text,
  p_note text
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
  if p_action not in ('approve', 'reject')
    or (
      p_action = 'reject'
      and char_length(trim(coalesce(p_note, ''))) < 5
    )
  then
    raise exception 'Valid review decision required';
  end if;

  update public.manual_payment_reviews
  set
    status = case when p_action = 'approve' then 'approved' else 'rejected' end,
    reviewer_id = auth.uid(),
    reviewer_note = nullif(trim(p_note), ''),
    reviewed_at = now(),
    updated_at = now()
  where order_id = p_order_id and status = 'pending';
  if not found then
    raise exception 'Pending review not found';
  end if;

  update public.orders
  set
    status = case when p_action = 'approve' then 'approved' else 'cancelled' end,
    updated_at = now()
  where id = p_order_id and order_type = 'community_host_plan';
  if not found then
    raise exception 'Host plan order not found';
  end if;

  if p_action = 'approve' then
    perform public.fulfill_community_host_plan_order(
      p_order_id,
      'manual_review'
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
    auth.uid(),
    'community.host_plan_manual_' || p_action,
    'order',
    p_order_id,
    jsonb_build_object('note', nullif(trim(p_note), ''))
  );
end;
$$;

create or replace function public.list_community_host_plan_orders_admin()
returns table(
  order_id uuid,
  reference text,
  community_id uuid,
  community_name text,
  plan_id uuid,
  plan_name text,
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

create or replace function public.create_community_order(
  p_offer_id uuid,
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
  offer public.community_offers%rowtype;
  saved uuid;
  next_status text;
begin
  if not public.community_creator_commerce_enabled()
    or not public.is_active_member(actor)
  then
    raise exception 'Community checkout is unavailable';
  end if;

  select *
  into offer
  from public.community_offers
  where id = p_offer_id
    and status = 'published'
    and access_type = 'paid'
  for share;
  if not found or offer.payment_mode = 'closed' then
    raise exception 'Community checkout is closed';
  end if;

  if not exists(
    select 1
    from public.community_host_subscriptions subscription
    join public.community_host_plans plan on plan.id = subscription.plan_id
    where subscription.community_id = offer.community_id
      and subscription.status in ('active', 'grace')
      and subscription.ends_at > now()
      and plan.status = 'published'
  ) then
    raise exception 'Community host plan is not active';
  end if;

  if not exists(
    select 1
    from public.community_host_accounts account
    where account.community_id = offer.community_id
      and account.payout_status = 'verified'
      and account.terms_accepted_at is not null
  ) then
    raise exception 'Community payout verification is not active';
  end if;

  if not exists(
    select 1
    from public.community_memberships membership
    where membership.community_id = offer.community_id
      and membership.user_id = actor
      and membership.status = 'approved_pending_payment'
  ) then
    raise exception 'Host approval is required before payment';
  end if;

  if exists(
    select 1
    from public.orders community_order
    join public.order_items item on item.order_id = community_order.id
    where community_order.user_id = actor
      and item.community_offer_id = offer.id
      and community_order.status in (
        'pending_payment',
        'pending_review',
        'paid',
        'approved',
        'fulfilled'
      )
  ) then
    raise exception 'An active community order already exists';
  end if;

  next_status := case
    when offer.payment_mode = 'automatic' then 'pending_payment'
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
    offer.payment_mode,
    offer.currency,
    offer.price_minor,
    offer.price_minor,
    case
      when offer.payment_mode = 'automatic' then now() + interval '20 minutes'
    end,
    'community'
  )
  returning id into saved;

  insert into public.order_items(
    order_id,
    community_offer_id,
    quantity,
    unit_price_minor,
    line_total_minor
  )
  values(saved, offer.id, 1, offer.price_minor, offer.price_minor);

  if offer.payment_mode = 'manual_review' then
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
    values(saved, trim(p_manual_reference), trim(p_manual_note));
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
    'community.order_created',
    'order',
    saved,
    jsonb_build_object(
      'community_id', offer.community_id,
      'offer_id', offer.id,
      'mode', offer.payment_mode
    )
  );
  return saved;
end;
$$;

create or replace function public.notify_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_title text;
  target_href text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.order_type = 'event' then
    select title, '/orders/' || new.reference
    into item_title, target_href
    from public.events
    where id = new.event_id;
  elsif new.order_type = 'course' then
    select course.title, '/learning/' || course.slug
    into item_title, target_href
    from public.order_items item
    join public.courses course on course.id = item.course_id
    where item.order_id = new.id;
  elsif new.order_type = 'membership' then
    select plan.name, '/membership'
    into item_title, target_href
    from public.order_items item
    join public.membership_plans plan on plan.id = item.membership_plan_id
    where item.order_id = new.id;
  elsif new.order_type = 'community' then
    select community.name, '/communities'
    into item_title, target_href
    from public.order_items item
    join public.community_offers offer on offer.id = item.community_offer_id
    join public.communities community on community.id = offer.community_id
    where item.order_id = new.id;
  else
    select
      plan.name,
      '/communities/' || community.slug || '/host#commerce'
    into item_title, target_href
    from public.community_host_plan_orders context
    join public.community_host_plans plan on plan.id = context.plan_id
    join public.communities community on community.id = context.community_id
    where context.order_id = new.id;
  end if;

  perform public.enqueue_notification(
    new.user_id,
    'registration',
    case new.order_type
      when 'membership' then 'Membership update'
      when 'course' then 'Learning order update'
      when 'community' then 'Community access update'
      when 'community_host_plan' then 'Host plan update'
      else 'Registration update'
    end,
    coalesce(item_title, 'Your order') || ' is now '
      || replace(new.status, '_', ' ') || '.',
    coalesce(target_href, '/orders/' || new.reference),
    'order-status:' || new.id || ':' || new.status
  );
  return new;
end;
$$;

create or replace function public.process_paystack_payment(
  p_provider_event_id text,
  p_event_type text,
  p_reference text,
  p_status text,
  p_amount_minor bigint,
  p_currency text,
  p_payload jsonb,
  p_signature_verified boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.orders%rowtype;
  processed timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if not p_signature_verified then
    raise exception 'Provider signature or server verification required';
  end if;

  insert into public.payment_events(
    provider,
    provider_event_id,
    event_type,
    signature_verified,
    payload
  )
  values(
    'paystack',
    p_provider_event_id,
    p_event_type,
    true,
    coalesce(p_payload, '{}')
  )
  on conflict(provider, provider_event_id) do nothing;

  select processed_at
  into processed
  from public.payment_events
  where provider = 'paystack'
    and provider_event_id = p_provider_event_id
  for update;
  if processed is not null then
    return 'already_processed';
  end if;

  select *
  into target
  from public.orders
  where reference = p_reference
  for update;
  if not found then
    update public.payment_events
    set error_message = 'Order reference not found', processed_at = now()
    where provider = 'paystack'
      and provider_event_id = p_provider_event_id;
    return 'order_not_found';
  end if;
  if target.total_minor <> p_amount_minor
    or target.currency <> upper(p_currency)
  then
    update public.payment_events
    set error_message = 'Amount or currency mismatch', processed_at = now()
    where provider = 'paystack'
      and provider_event_id = p_provider_event_id;
    return 'amount_mismatch';
  end if;

  insert into public.payment_attempts(
    order_id,
    provider,
    provider_reference,
    amount_minor,
    currency,
    status,
    provider_response
  )
  values(
    target.id,
    'paystack',
    p_reference,
    p_amount_minor,
    upper(p_currency),
    case
      when p_status = 'success' then 'success'
      when p_status in ('failed', 'abandoned', 'reversed') then p_status
      else 'pending'
    end,
    coalesce(p_payload, '{}')
  )
  on conflict(provider_reference) do update
  set
    status = excluded.status,
    provider_response = excluded.provider_response,
    updated_at = now();

  if p_status = 'success' then
    update public.orders
    set status = 'paid', updated_at = now()
    where id = target.id and status in ('pending_payment', 'paid');
    if target.status <> 'fulfilled' then
      if target.order_type = 'course' then
        perform public.fulfill_course_order(target.id, 'paystack_verified');
      elsif target.order_type = 'membership' then
        perform public.fulfill_membership_order(target.id, 'paystack_verified');
      elsif target.order_type = 'community' then
        perform public.fulfill_community_order(target.id, 'paystack_verified');
      elsif target.order_type = 'community_host_plan' then
        perform public.fulfill_community_host_plan_order(
          target.id,
          'paystack_verified'
        );
      else
        perform public.fulfill_registration_order(
          target.id,
          'paystack_verified'
        );
      end if;
    end if;
  elsif p_status in ('failed', 'abandoned') then
    update public.orders
    set status = 'expired', updated_at = now()
    where id = target.id and status = 'pending_payment';
    if target.order_type = 'event' then
      update public.registration_requests
      set status = 'cancelled', updated_at = now()
      where order_id = target.id and status = 'pending_payment';
    end if;
  elsif p_status = 'reversed' then
    update public.orders
    set status = 'refunded', updated_at = now()
    where id = target.id;
    update public.entitlements
    set status = 'revoked', revoked_at = now()
    where order_id = target.id and status = 'active';
    if target.order_type = 'event' then
      update public.event_memberships
      set status = 'cancelled', updated_at = now()
      where order_id = target.id;
    elsif target.order_type = 'course' then
      update public.course_enrollments
      set status = 'revoked', updated_at = now()
      where order_id = target.id;
    elsif target.order_type = 'membership' then
      update public.membership_periods
      set status = 'revoked', revoked_at = now(), updated_at = now()
      where order_id = target.id;
    elsif target.order_type = 'community' then
      update public.community_access_periods
      set status = 'revoked', revoked_at = now(), updated_at = now()
      where order_id = target.id;
      update public.community_revenue_ledger
      set settlement_status = 'reversed', updated_at = now()
      where order_id = target.id;
      update public.community_memberships membership
      set status = 'approved_pending_payment', updated_at = now()
      where membership.user_id = target.user_id
        and membership.community_id = (
          select offer.community_id
          from public.order_items item
          join public.community_offers offer
            on offer.id = item.community_offer_id
          where item.order_id = target.id
        );
    else
      update public.community_host_subscriptions
      set status = 'cancelled', updated_at = now()
      where order_id = target.id
        and status in ('active', 'grace');
      update public.community_offers
      set status = 'paused', updated_at = now()
      where community_id = (
        select context.community_id
        from public.community_host_plan_orders context
        where context.order_id = target.id
      )
        and access_type = 'paid'
        and status = 'published';
    end if;
  end if;

  update public.payment_events
  set processed_at = now(), error_message = null
  where provider = 'paystack'
    and provider_event_id = p_provider_event_id;

  insert into public.audit_events(
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    'payment.paystack_' || p_status,
    'order',
    target.id,
    jsonb_build_object(
      'order_type', target.order_type,
      'provider_event_id', p_provider_event_id
    )
  );
  return case when p_status = 'success' then 'fulfilled' else p_status end;
exception
  when others then
    update public.payment_events
    set error_message = sqlerrm
    where provider = 'paystack'
      and provider_event_id = p_provider_event_id;
    raise;
end;
$$;

revoke all on function public.community_host_self_service_billing_enabled()
  from public;
grant execute on function public.community_host_self_service_billing_enabled()
  to authenticated;
revoke all on function public.set_community_host_billing_configuration(
  boolean,
  text
) from public;
grant execute on function public.set_community_host_billing_configuration(
  boolean,
  text
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
revoke all on function public.review_community_host_plan_order(
  uuid,
  text,
  text
) from public;
grant execute on function public.review_community_host_plan_order(
  uuid,
  text,
  text
) to authenticated;
revoke all on function public.list_community_host_plan_orders_admin()
  from public;
grant execute on function public.list_community_host_plan_orders_admin()
  to authenticated;
revoke all on function public.create_community_order(uuid, text, text)
  from public;
grant execute on function public.create_community_order(uuid, text, text)
  to authenticated;
revoke all on function public.process_paystack_payment(
  text,
  text,
  text,
  text,
  bigint,
  text,
  jsonb,
  boolean
) from public;
grant execute on function public.process_paystack_payment(
  text,
  text,
  text,
  text,
  bigint,
  text,
  jsonb,
  boolean
) to service_role;

comment on table public.community_host_billing_settings is
  'Fail-closed switch for approved-owner host plan purchases.';
comment on table public.community_host_plan_orders is
  'Immutable community and plan context for each host plan order.';

commit;
