begin;

insert into public.feature_flags(key, enabled, description)
values(
  'community_creator_commerce',
  false,
  'Approved host plans, paid community access and held creator earnings'
)
on conflict(key) do nothing;

create table public.community_host_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check(char_length(name) between 3 and 80),
  description text not null check(char_length(description) between 20 and 1200),
  price_minor bigint not null check(price_minor >= 0),
  currency text not null default 'KES' check(currency ~ '^[A-Z]{3}$'),
  duration_months integer not null default 1
    check(duration_months between 1 and 12),
  platform_fee_bps integer not null
    check(platform_fee_bps between 0 and 3000),
  max_moderators integer not null default 1
    check(max_moderators between 1 and 50),
  features jsonb not null default '{}'::jsonb
    check(jsonb_typeof(features) = 'object'),
  status text not null default 'draft'
    check(status in ('draft', 'published', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.community_host_subscriptions (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  plan_id uuid not null references public.community_host_plans(id) on delete restrict,
  granted_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual_grant'
    check(source in ('manual_grant', 'purchase')),
  status text not null
    check(status in ('active', 'grace', 'paused', 'cancelled', 'expired')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text check(note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_host_subscription_window check(ends_at > starts_at)
);

create unique index community_one_current_host_plan_idx
  on public.community_host_subscriptions(community_id)
  where status in ('active', 'grace');
create index community_host_subscriptions_expiry_idx
  on public.community_host_subscriptions(status, ends_at);

create table public.community_host_accounts (
  community_id uuid primary key references public.communities(id) on delete cascade,
  payout_status text not null default 'not_started'
    check(payout_status in ('not_started', 'pending', 'verified', 'paused')),
  provider text not null default 'paystack'
    check(provider in ('paystack', 'manual')),
  provider_subaccount_code text,
  terms_version text,
  terms_accepted_by uuid references auth.users(id) on delete set null,
  terms_accepted_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  review_note text check(review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_host_verified_account
    check(
      payout_status <> 'verified'
      or (
        provider_subaccount_code is not null
        and verified_by is not null
        and verified_at is not null
        and terms_accepted_at is not null
      )
    )
);

create table public.community_offers (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null unique references public.communities(id) on delete cascade,
  name text not null check(char_length(name) between 3 and 100),
  description text not null check(char_length(description) between 20 and 1500),
  access_type text not null default 'free'
    check(access_type in ('free', 'paid')),
  billing_interval text not null default 'monthly'
    check(billing_interval in ('one_time', 'monthly', 'annual')),
  price_minor bigint not null default 0 check(price_minor >= 0),
  currency text not null default 'KES' check(currency ~ '^[A-Z]{3}$'),
  duration_months integer not null default 1
    check(duration_months between 1 and 60),
  grace_days integer not null default 7 check(grace_days between 0 and 30),
  payment_mode text not null default 'closed'
    check(payment_mode in ('automatic', 'manual_review', 'closed')),
  status text not null default 'draft'
    check(status in ('draft', 'published', 'paused', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_offer_price
    check(
      (access_type = 'free' and price_minor = 0)
      or (access_type = 'paid' and price_minor > 0)
    )
);

create table public.community_access_periods (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  offer_id uuid not null references public.community_offers(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid unique references public.orders(id) on delete restrict,
  source text not null
    check(source in ('purchase', 'manual_grant', 'host_invitation')),
  status text not null
    check(status in ('scheduled', 'active', 'grace', 'expired', 'revoked')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  grace_ends_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_access_period_window
    check(ends_at > starts_at and grace_ends_at >= ends_at)
);

create index community_access_periods_member_idx
  on public.community_access_periods(user_id, community_id, status, ends_at desc);

create table public.community_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete restrict,
  host_user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  gross_minor bigint not null check(gross_minor >= 0),
  platform_fee_bps integer not null check(platform_fee_bps between 0 and 3000),
  platform_fee_minor bigint not null check(platform_fee_minor >= 0),
  provider_fee_minor bigint not null default 0 check(provider_fee_minor >= 0),
  host_net_minor bigint not null check(host_net_minor >= 0),
  settlement_status text not null default 'held'
    check(settlement_status in ('held', 'eligible', 'settled', 'reversed')),
  provider_settlement_reference text,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_revenue_allocation
    check(platform_fee_minor + provider_fee_minor + host_net_minor <= gross_minor)
);

create index community_revenue_host_idx
  on public.community_revenue_ledger(
    host_user_id,
    settlement_status,
    created_at desc
  );

alter table public.community_host_plans enable row level security;
alter table public.community_host_subscriptions enable row level security;
alter table public.community_host_accounts enable row level security;
alter table public.community_offers enable row level security;
alter table public.community_access_periods enable row level security;
alter table public.community_revenue_ledger enable row level security;

create policy "Approved members read published host plans"
  on public.community_host_plans for select
  to authenticated
  using(
    status = 'published'
    or public.is_admin(array['super_admin']::public.app_role[])
  );

create policy "Community owners read their host plan"
  on public.community_host_subscriptions for select
  to authenticated
  using(
    public.is_admin(array['super_admin']::public.app_role[])
    or exists(
      select 1
      from public.community_memberships membership
      where membership.community_id = community_host_subscriptions.community_id
        and membership.user_id = auth.uid()
        and membership.role = 'owner'
        and membership.status = 'active'
    )
  );

create policy "Members read available community offers"
  on public.community_offers for select
  to authenticated
  using(
    status = 'published'
    or public.can_manage_community(community_id)
    or public.is_admin(array['super_admin']::public.app_role[])
  );

create policy "Members read own community access"
  on public.community_access_periods for select
  to authenticated
  using(
    user_id = auth.uid()
    or public.can_manage_community(community_id)
    or public.is_admin(array['super_admin']::public.app_role[])
  );

create policy "Hosts read their held community earnings"
  on public.community_revenue_ledger for select
  to authenticated
  using(
    host_user_id = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  );

alter table public.community_memberships
  drop constraint if exists community_memberships_status_check;
alter table public.community_memberships
  add constraint community_memberships_status_check
  check(
    status in (
      'requested',
      'invited',
      'approved_pending_payment',
      'active',
      'declined',
      'removed'
    )
  );

alter table public.orders
  drop constraint if exists orders_order_type_check;
alter table public.orders
  add constraint orders_order_type_check
  check(order_type in ('event', 'course', 'membership', 'community'));
alter table public.orders
  drop constraint if exists order_context_present;
alter table public.orders
  add constraint order_context_present
  check(
    (order_type = 'event' and event_id is not null)
    or (
      order_type in ('course', 'membership', 'community')
      and event_id is null
    )
  );

alter table public.order_items
  add column community_offer_id uuid
  references public.community_offers(id) on delete restrict;
alter table public.order_items
  drop constraint if exists order_item_exactly_one_product;
alter table public.order_items
  add constraint order_item_exactly_one_product
  check(
    num_nonnulls(
      ticket_type_id,
      course_id,
      membership_plan_id,
      community_offer_id
    ) = 1
  );

alter table public.entitlements
  add column community_id uuid references public.communities(id) on delete cascade;
alter table public.entitlements
  add column community_access_period_id uuid
  references public.community_access_periods(id) on delete cascade;
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
      'community_access'
    )
  );
create unique index entitlements_community_access_period_idx
  on public.entitlements(
    user_id,
    community_access_period_id,
    entitlement_type
  )
  where community_access_period_id is not null;

create policy "Community hosts read community orders"
  on public.orders for select
  to authenticated
  using(
    order_type = 'community'
    and exists(
      select 1
      from public.order_items item
      join public.community_offers offer
        on offer.id = item.community_offer_id
      where item.order_id = orders.id
        and public.can_manage_community(offer.community_id)
    )
  );

create policy "Community hosts read community order items"
  on public.order_items for select
  to authenticated
  using(
    community_offer_id is not null
    and exists(
      select 1
      from public.community_offers offer
      where offer.id = order_items.community_offer_id
        and public.can_manage_community(offer.community_id)
    )
  );

create policy "Community hosts read manual community reviews"
  on public.manual_payment_reviews for select
  to authenticated
  using(
    exists(
      select 1
      from public.orders community_order
      join public.order_items item on item.order_id = community_order.id
      join public.community_offers offer
        on offer.id = item.community_offer_id
      where community_order.id = manual_payment_reviews.order_id
        and public.can_manage_community(offer.community_id)
    )
  );

create or replace function public.community_creator_commerce_enabled()
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
      where key = 'community_creator_commerce'
    ),
    false
  )
$$;

create or replace function public.is_community_owner(
  p_community_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists(
      select 1
      from public.user_roles role_assignment
      where role_assignment.user_id = auth.uid()
        and role_assignment.role = 'super_admin'
        and (
          role_assignment.expires_at is null
          or role_assignment.expires_at > now()
        )
    )
    or exists(
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.role = 'owner'
        and membership.status = 'active'
    )
$$;

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
    or jsonb_typeof(coalesce(p_features, '{}'::jsonb)) <> 'object'
  then
    raise exception 'Valid host plan configuration required';
  end if;

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
      coalesce(p_features, '{}'::jsonb),
      p_status,
      auth.uid()
    )
    returning id into saved;
  else
    update public.community_host_plans
    set
      slug = lower(trim(p_slug)),
      name = trim(p_name),
      description = trim(p_description),
      price_minor = p_price_minor,
      currency = upper(p_currency),
      duration_months = p_duration_months,
      platform_fee_bps = p_platform_fee_bps,
      max_moderators = p_max_moderators,
      features = coalesce(p_features, '{}'::jsonb),
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
    case when p_plan_id is null
      then 'community.host_plan_created'
      else 'community.host_plan_updated'
    end,
    'community_host_plan',
    saved,
    jsonb_build_object(
      'status', p_status,
      'platform_fee_bps', p_platform_fee_bps,
      'max_moderators', p_max_moderators
    )
  );
  return saved;
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
    or not exists(
      select 1
      from public.community_memberships
      where community_id = p_community_id
        and role = 'owner'
        and status = 'active'
    )
  then
    raise exception 'Published plan, active owner and grant reason required';
  end if;

  update public.community_host_subscriptions
  set status = 'expired', updated_at = now()
  where community_id = p_community_id
    and status in ('active', 'grace');

  insert into public.community_host_subscriptions(
    community_id,
    plan_id,
    granted_by,
    source,
    status,
    starts_at,
    ends_at,
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
    trim(p_note)
  )
  returning id into saved;

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
      'note', trim(p_note)
    )
  );
  return saved;
end;
$$;

create or replace function public.accept_community_host_terms(
  p_community_id uuid,
  p_terms_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_community_owner(p_community_id)
    or char_length(trim(coalesce(p_terms_version, ''))) not between 2 and 40
  then
    raise exception 'Active community owner and terms version required';
  end if;

  insert into public.community_host_accounts(
    community_id,
    payout_status,
    terms_version,
    terms_accepted_by,
    terms_accepted_at
  )
  values(
    p_community_id,
    'not_started',
    trim(p_terms_version),
    auth.uid(),
    now()
  )
  on conflict(community_id) do update
  set
    terms_version = excluded.terms_version,
    terms_accepted_by = excluded.terms_accepted_by,
    terms_accepted_at = excluded.terms_accepted_at,
    payout_status = case
      when community_host_accounts.payout_status = 'verified'
        then 'pending'
      else community_host_accounts.payout_status
    end,
    verified_by = case
      when community_host_accounts.payout_status = 'verified'
        then null
      else community_host_accounts.verified_by
    end,
    verified_at = case
      when community_host_accounts.payout_status = 'verified'
        then null
      else community_host_accounts.verified_at
    end,
    updated_at = now();

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    'community.host_terms_accepted',
    'community',
    p_community_id,
    jsonb_build_object('terms_version', trim(p_terms_version))
  );
end;
$$;

create or replace function public.review_community_host_payout(
  p_community_id uuid,
  p_status text,
  p_provider text,
  p_provider_subaccount_code text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  terms_at timestamptz;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_status not in ('pending', 'verified', 'paused')
    or p_provider not in ('paystack', 'manual')
    or char_length(trim(coalesce(p_note, ''))) < 5
  then
    raise exception 'Valid payout review required';
  end if;

  select terms_accepted_at
  into terms_at
  from public.community_host_accounts
  where community_id = p_community_id;

  if p_status = 'verified'
    and (
      terms_at is null
      or nullif(trim(coalesce(p_provider_subaccount_code, '')), '') is null
    )
  then
    raise exception 'Accepted host terms and provider subaccount required';
  end if;

  update public.community_host_accounts
  set
    payout_status = p_status,
    provider = p_provider,
    provider_subaccount_code =
      nullif(trim(p_provider_subaccount_code), ''),
    verified_by = case when p_status = 'verified' then auth.uid() end,
    verified_at = case when p_status = 'verified' then now() end,
    review_note = trim(p_note),
    updated_at = now()
  where community_id = p_community_id;

  if not found then
    insert into public.community_host_accounts(
      community_id,
      payout_status,
      provider,
      provider_subaccount_code,
      verified_by,
      verified_at,
      review_note
    )
    values(
      p_community_id,
      p_status,
      p_provider,
      nullif(trim(p_provider_subaccount_code), ''),
      case when p_status = 'verified' then auth.uid() end,
      case when p_status = 'verified' then now() end,
      trim(p_note)
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
    'community.payout_' || p_status,
    'community',
    p_community_id,
    jsonb_build_object('provider', p_provider, 'note', trim(p_note))
  );
end;
$$;

create or replace function public.save_community_offer(
  p_community_id uuid,
  p_name text,
  p_description text,
  p_access_type text,
  p_billing_interval text,
  p_price_minor bigint,
  p_currency text,
  p_duration_months integer,
  p_grace_days integer,
  p_payment_mode text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved uuid;
  account_ready boolean := false;
  host_plan_ready boolean := false;
begin
  if not public.is_community_owner(p_community_id) then
    raise exception 'Community owner required';
  end if;
  if p_access_type not in ('free', 'paid')
    or p_billing_interval not in ('one_time', 'monthly', 'annual')
    or p_payment_mode not in ('automatic', 'manual_review', 'closed')
    or p_status not in ('draft', 'published', 'paused', 'archived')
    or upper(p_currency) !~ '^[A-Z]{3}$'
    or p_duration_months not between 1 and 60
    or p_grace_days not between 0 and 30
    or (p_access_type = 'free' and p_price_minor <> 0)
    or (p_access_type = 'paid' and p_price_minor <= 0)
  then
    raise exception 'Valid community offer configuration required';
  end if;

  select exists(
    select 1
    from public.community_host_subscriptions subscription
    join public.community_host_plans plan on plan.id = subscription.plan_id
    where subscription.community_id = p_community_id
      and subscription.status in ('active', 'grace')
      and subscription.ends_at > now()
      and plan.status = 'published'
  )
  into host_plan_ready;

  select exists(
    select 1
    from public.community_host_accounts account
    where account.community_id = p_community_id
      and account.payout_status = 'verified'
      and account.terms_accepted_at is not null
  )
  into account_ready;

  if not host_plan_ready then
    raise exception 'An active approved host plan is required';
  end if;
  if p_status = 'published'
    and not exists(
      select 1
      from public.communities
      where id = p_community_id and status = 'published'
    )
  then
    raise exception 'Publish the accepted community before its offer';
  end if;
  if p_status = 'published'
    and p_access_type = 'paid'
    and (
      not public.community_creator_commerce_enabled()
      or not account_ready
      or p_payment_mode = 'closed'
    )
  then
    raise exception 'Paid publishing requires release approval and verified payouts';
  end if;

  insert into public.community_offers(
    community_id,
    name,
    description,
    access_type,
    billing_interval,
    price_minor,
    currency,
    duration_months,
    grace_days,
    payment_mode,
    status,
    created_by
  )
  values(
    p_community_id,
    trim(p_name),
    trim(p_description),
    p_access_type,
    p_billing_interval,
    p_price_minor,
    upper(p_currency),
    p_duration_months,
    p_grace_days,
    p_payment_mode,
    p_status,
    auth.uid()
  )
  on conflict(community_id) do update
  set
    name = excluded.name,
    description = excluded.description,
    access_type = excluded.access_type,
    billing_interval = excluded.billing_interval,
    price_minor = excluded.price_minor,
    currency = excluded.currency,
    duration_months = excluded.duration_months,
    grace_days = excluded.grace_days,
    payment_mode = excluded.payment_mode,
    status = excluded.status,
    updated_at = now()
  returning id into saved;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    'community.offer_saved',
    'community_offer',
    saved,
    jsonb_build_object(
      'community_id', p_community_id,
      'access_type', p_access_type,
      'billing_interval', p_billing_interval,
      'price_minor', p_price_minor,
      'currency', upper(p_currency),
      'status', p_status
    )
  );
  return saved;
end;
$$;

drop function if exists public.list_communities();
create function public.list_communities()
returns table(
  community_id uuid,
  slug text,
  name text,
  description text,
  community_type text,
  status text,
  membership_status text,
  membership_role text,
  member_count bigint,
  pending_count bigint,
  offer_id uuid,
  offer_access_type text,
  offer_price_minor bigint,
  offer_currency text,
  offer_billing_interval text,
  offer_payment_mode text
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
  if not public.communities_enabled()
    and not public.is_admin(array['super_admin']::public.app_role[])
  then
    raise exception 'Communities are not available yet';
  end if;

  return query
  select
    community.id,
    community.slug,
    community.name,
    community.description,
    community.community_type,
    community.status,
    membership.status,
    membership.role,
    (
      select count(*)
      from public.community_memberships active_membership
      where active_membership.community_id = community.id
        and active_membership.status = 'active'
    ),
    (
      select count(*)
      from public.community_memberships pending_membership
      where pending_membership.community_id = community.id
        and pending_membership.status in (
          'requested',
          'invited',
          'approved_pending_payment'
        )
    ),
    offer.id,
    offer.access_type,
    offer.price_minor,
    offer.currency,
    offer.billing_interval,
    offer.payment_mode
  from public.communities community
  left join public.community_memberships membership
    on membership.community_id = community.id
    and membership.user_id = auth.uid()
  left join public.community_offers offer
    on offer.community_id = community.id
    and offer.status = 'published'
  where community.status = 'published'
    or membership.user_id = auth.uid()
    or public.is_admin(array['super_admin']::public.app_role[])
  order by
    case when membership.status = 'active' then 0 else 1 end,
    community.name;
end;
$$;

create or replace function public.request_community_access(
  p_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.communities%rowtype;
  paid_offer boolean := false;
  next_status text;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
  then
    raise exception 'Communities are unavailable';
  end if;

  select *
  into target
  from public.communities
  where id = p_community_id and status = 'published';
  if not found then
    raise exception 'Community not found';
  end if;

  select exists(
    select 1
    from public.community_offers offer
    where offer.community_id = p_community_id
      and offer.status = 'published'
      and offer.access_type = 'paid'
  )
  into paid_offer;

  next_status := case
    when target.community_type = 'private' then 'requested'
    when paid_offer then 'approved_pending_payment'
    else 'active'
  end;

  insert into public.community_memberships(
    community_id,
    user_id,
    role,
    status,
    joined_at
  )
  values(
    p_community_id,
    actor,
    'member',
    next_status,
    case when next_status = 'active' then now() end
  )
  on conflict(community_id, user_id) do update
  set
    status = excluded.status,
    joined_at = excluded.joined_at,
    updated_at = now()
  where community_memberships.status in ('declined', 'removed');
  if not found then
    raise exception 'Membership already exists';
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
    'community.membership_' || next_status,
    'community',
    p_community_id,
    jsonb_build_object('status', next_status, 'paid_offer', paid_offer)
  );
end;
$$;

create or replace function public.respond_to_community_invitation(
  p_community_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.community_memberships%rowtype;
  paid_offer boolean := false;
  next_status text;
begin
  if not public.communities_enabled() then
    raise exception 'Communities are unavailable';
  end if;

  select *
  into target
  from public.community_memberships
  where community_id = p_community_id
    and user_id = auth.uid()
    and status = 'invited'
  for update;
  if not found then
    raise exception 'Invitation not found';
  end if;

  select exists(
    select 1
    from public.community_offers offer
    where offer.community_id = p_community_id
      and offer.status = 'published'
      and offer.access_type = 'paid'
  )
  into paid_offer;

  next_status := case
    when not p_accept then 'declined'
    when target.role <> 'member' then 'active'
    when paid_offer then 'approved_pending_payment'
    else 'active'
  end;

  update public.community_memberships
  set
    status = next_status,
    joined_at = case when next_status = 'active' then now() end,
    updated_at = now()
  where id = target.id;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    'community.invitation_responded',
    'community',
    p_community_id,
    jsonb_build_object(
      'accepted', p_accept,
      'resulting_status', next_status,
      'paid_offer', paid_offer
    )
  );
end;
$$;

create or replace function public.review_community_membership(
  p_membership_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.community_memberships%rowtype;
  paid_offer boolean := false;
  next_status text;
  moderator_limit integer;
begin
  if p_action not in (
    'approve',
    'decline',
    'remove',
    'promote',
    'demote',
    'transfer_ownership'
  ) then
    raise exception 'Unsupported membership action';
  end if;

  select *
  into target
  from public.community_memberships
  where id = p_membership_id
  for update;
  if not found or not public.can_manage_community(target.community_id) then
    raise exception 'Not authorized';
  end if;
  if target.role = 'owner' and p_action in ('remove', 'demote') then
    raise exception 'The community owner cannot be removed';
  end if;

  if p_action = 'transfer_ownership' then
    if not public.is_admin(array['super_admin']::public.app_role[])
      or target.status <> 'active'
      or target.role = 'owner'
    then
      raise exception 'Super admin and an active successor are required';
    end if;
    update public.community_memberships
    set role = 'member', updated_at = now()
    where community_id = target.community_id
      and status = 'active'
      and role = 'owner';
    update public.community_memberships
    set role = 'owner', reviewed_by = auth.uid(), updated_at = now()
    where id = p_membership_id;
    insert into public.audit_events(
      actor_id,
      action,
      target_type,
      target_id,
      metadata
    )
    values(
      auth.uid(),
      'community.ownership_transferred',
      'community_membership',
      p_membership_id,
      jsonb_build_object(
        'community_id', target.community_id,
        'member_id', target.user_id
      )
    );
    return;
  end if;

  if p_action = 'promote' then
    select plan.max_moderators
    into moderator_limit
    from public.community_host_subscriptions subscription
    join public.community_host_plans plan on plan.id = subscription.plan_id
    where subscription.community_id = target.community_id
      and subscription.status in ('active', 'grace')
      and subscription.ends_at > now()
    limit 1;
    if moderator_limit is not null
      and (
        select count(*)
        from public.community_memberships
        where community_id = target.community_id
          and role = 'moderator'
          and status = 'active'
      ) >= moderator_limit
    then
      raise exception 'Host plan moderator limit reached';
    end if;
  end if;

  select exists(
    select 1
    from public.community_offers offer
    where offer.community_id = target.community_id
      and offer.status = 'published'
      and offer.access_type = 'paid'
  )
  into paid_offer;

  next_status := case
    when p_action = 'approve' and paid_offer
      then 'approved_pending_payment'
    when p_action = 'approve' then 'active'
    when p_action = 'decline' then 'declined'
    when p_action = 'remove' then 'removed'
    else target.status
  end;

  update public.community_memberships
  set
    status = next_status,
    role = case
      when p_action = 'promote' then 'moderator'
      when p_action = 'demote' then 'member'
      else role
    end,
    reviewed_by = auth.uid(),
    joined_at = case
      when next_status = 'active' then coalesce(joined_at, now())
      else joined_at
    end,
    updated_at = now()
  where id = p_membership_id;

  if p_action = 'approve' and paid_offer then
    perform public.enqueue_notification(
      target.user_id,
      'registration',
      'Community access approved',
      'Your host approved your request. Complete the published payment option to enter.',
      '/communities',
      'community-payment-required:' || target.id
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
    'community.membership_' || p_action,
    'community_membership',
    p_membership_id,
    jsonb_build_object(
      'community_id', target.community_id,
      'member_id', target.user_id,
      'resulting_status', next_status
    )
  );
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

create or replace function public.issue_community_access_period(
  p_user_id uuid,
  p_offer_id uuid,
  p_order_id uuid,
  p_source text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer public.community_offers%rowtype;
  previous public.community_access_periods%rowtype;
  period_start timestamptz;
  period_end timestamptz;
  saved uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_offer_id::text, 0)
  );
  select * into offer
  from public.community_offers
  where id = p_offer_id;
  if not found then
    raise exception 'Community offer not found';
  end if;

  if p_order_id is not null then
    select id into saved
    from public.community_access_periods
    where order_id = p_order_id;
    if saved is not null then
      return saved;
    end if;
  end if;

  select *
  into previous
  from public.community_access_periods
  where community_id = offer.community_id
    and user_id = p_user_id
    and status in ('scheduled', 'active', 'grace')
  order by ends_at desc
  limit 1
  for update;

  period_start := greatest(coalesce(previous.ends_at, now()), now());
  period_end := period_start + make_interval(months => offer.duration_months);

  insert into public.community_access_periods(
    community_id,
    offer_id,
    user_id,
    order_id,
    source,
    status,
    starts_at,
    ends_at,
    grace_ends_at
  )
  values(
    offer.community_id,
    offer.id,
    p_user_id,
    p_order_id,
    p_source,
    case
      when period_start > now() + interval '1 minute' then 'scheduled'
      else 'active'
    end,
    period_start,
    period_end,
    period_end + make_interval(days => offer.grace_days)
  )
  returning id into saved;

  insert into public.entitlements(
    user_id,
    community_id,
    community_access_period_id,
    order_id,
    entitlement_type,
    metadata
  )
  values(
    p_user_id,
    offer.community_id,
    saved,
    p_order_id,
    'community_access',
    jsonb_build_object('source', p_source, 'offer_id', offer.id)
  )
  on conflict(
    user_id,
    community_access_period_id,
    entitlement_type
  )
  where community_access_period_id is not null
  do nothing;

  return saved;
end;
$$;

create or replace function public.fulfill_community_order(
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
  offer public.community_offers%rowtype;
  host_id uuid;
  access_id uuid;
  fee_bps integer;
  platform_fee bigint;
begin
  select *
  into target
  from public.orders
  where id = p_order_id and order_type = 'community'
  for update;
  if not found then
    raise exception 'Community order not found';
  end if;
  if target.status = 'fulfilled' then
    return;
  end if;
  if target.status not in ('paid', 'approved') then
    raise exception 'Order is not approved for fulfillment';
  end if;

  select offer_row.*
  into offer
  from public.order_items item
  join public.community_offers offer_row
    on offer_row.id = item.community_offer_id
  where item.order_id = p_order_id;
  if not found then
    raise exception 'Community offer item not found';
  end if;

  select membership.user_id
  into host_id
  from public.community_memberships membership
  where membership.community_id = offer.community_id
    and membership.role = 'owner'
    and membership.status = 'active'
  limit 1;
  if host_id is null then
    raise exception 'Active community owner required';
  end if;

  select plan.platform_fee_bps
  into fee_bps
  from public.community_host_subscriptions subscription
  join public.community_host_plans plan on plan.id = subscription.plan_id
  where subscription.community_id = offer.community_id
    and subscription.status in ('active', 'grace')
    and subscription.ends_at > now()
  limit 1;
  if fee_bps is null then
    raise exception 'Active host plan required';
  end if;

  access_id := public.issue_community_access_period(
    target.user_id,
    offer.id,
    target.id,
    'purchase'
  );

  update public.community_memberships
  set
    status = 'active',
    joined_at = coalesce(joined_at, now()),
    updated_at = now()
  where community_id = offer.community_id
    and user_id = target.user_id
    and status = 'approved_pending_payment';
  if not found then
    raise exception 'Approved community membership required';
  end if;

  platform_fee := floor(
    target.total_minor::numeric * fee_bps::numeric / 10000
  )::bigint;
  insert into public.community_revenue_ledger(
    community_id,
    host_user_id,
    order_id,
    currency,
    gross_minor,
    platform_fee_bps,
    platform_fee_minor,
    provider_fee_minor,
    host_net_minor,
    settlement_status
  )
  values(
    offer.community_id,
    host_id,
    target.id,
    target.currency,
    target.total_minor,
    fee_bps,
    platform_fee,
    0,
    greatest(target.total_minor - platform_fee, 0),
    'held'
  )
  on conflict(order_id) do nothing;

  update public.orders
  set status = 'fulfilled', fulfilled_at = now(), updated_at = now()
  where id = p_order_id;

  perform public.enqueue_notification(
    target.user_id,
    'registration',
    'Community access confirmed',
    offer.name || ' is ready for you.',
    '/communities',
    'community-access:' || access_id
  );
end;
$$;

create or replace function public.review_community_order(
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
  where id = p_order_id and order_type = 'community';
  if not found then
    raise exception 'Community order not found';
  end if;

  if p_action = 'approve' then
    perform public.fulfill_community_order(p_order_id, 'manual_review');
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
    'community.manual_' || p_action,
    'order',
    p_order_id,
    jsonb_build_object('note', nullif(trim(p_note), ''))
  );
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
      and current_subscription.ends_at > now()
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

create or replace function public.list_community_host_plans()
returns table(
  plan_id uuid,
  slug text,
  name text,
  description text,
  price_minor bigint,
  currency text,
  duration_months integer,
  platform_fee_bps integer,
  max_moderators integer,
  features jsonb,
  status text
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
    plan.id,
    plan.slug,
    plan.name,
    plan.description,
    plan.price_minor,
    plan.currency,
    plan.duration_months,
    plan.platform_fee_bps,
    plan.max_moderators,
    plan.features,
    plan.status
  from public.community_host_plans plan
  order by plan.price_minor, plan.name;
end;
$$;

create or replace function public.list_community_commerce_admin()
returns table(
  community_id uuid,
  community_name text,
  community_slug text,
  owner_name text,
  owner_email text,
  host_plan_id uuid,
  host_plan_name text,
  host_plan_status text,
  host_plan_ends_at timestamptz,
  payout_status text,
  terms_accepted_at timestamptz,
  offer_status text,
  offer_access_type text,
  offer_price_minor bigint,
  offer_currency text,
  gross_minor bigint,
  held_minor bigint,
  paying_members bigint
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
    community.id,
    community.name,
    community.slug,
    profile.display_name,
    user_row.email::text,
    plan.id,
    plan.name,
    subscription.status,
    subscription.ends_at,
    coalesce(account.payout_status, 'not_started'),
    account.terms_accepted_at,
    offer.status,
    offer.access_type,
    offer.price_minor,
    offer.currency,
    coalesce(ledger.gross_minor, 0),
    coalesce(ledger.held_minor, 0),
    coalesce(access.paying_members, 0)
  from public.communities community
  left join public.community_memberships owner_membership
    on owner_membership.community_id = community.id
    and owner_membership.role = 'owner'
    and owner_membership.status = 'active'
  left join public.profiles profile on profile.id = owner_membership.user_id
  left join auth.users user_row on user_row.id = owner_membership.user_id
  left join lateral(
    select current_subscription.*
    from public.community_host_subscriptions current_subscription
    where current_subscription.community_id = community.id
      and current_subscription.status in ('active', 'grace')
      and current_subscription.ends_at > now()
    order by current_subscription.ends_at desc
    limit 1
  ) subscription on true
  left join public.community_host_plans plan on plan.id = subscription.plan_id
  left join public.community_host_accounts account
    on account.community_id = community.id
  left join public.community_offers offer
    on offer.community_id = community.id
  left join lateral(
    select
      sum(entry.gross_minor)::bigint as gross_minor,
      sum(entry.host_net_minor)
        filter(where entry.settlement_status in ('held', 'eligible'))::bigint
        as held_minor
    from public.community_revenue_ledger entry
    where entry.community_id = community.id
  ) ledger on true
  left join lateral(
    select count(distinct period.user_id)::bigint as paying_members
    from public.community_access_periods period
    where period.community_id = community.id
      and period.status in ('active', 'grace')
      and period.grace_ends_at > now()
  ) access on true
  order by community.name;
end;
$$;

create or replace function public.list_community_orders_admin()
returns table(
  order_id uuid,
  reference text,
  community_id uuid,
  community_name text,
  member_email text,
  member_name text,
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
    community_order.id,
    community_order.reference,
    community.id,
    community.name,
    user_row.email::text,
    profile.display_name,
    community_order.status,
    community_order.processing_mode,
    community_order.total_minor,
    community_order.currency,
    review.submitted_reference,
    review.submitter_note,
    community_order.created_at
  from public.orders community_order
  join public.order_items item on item.order_id = community_order.id
  join public.community_offers offer on offer.id = item.community_offer_id
  join public.communities community on community.id = offer.community_id
  join auth.users user_row on user_row.id = community_order.user_id
  left join public.profiles profile on profile.id = community_order.user_id
  left join public.manual_payment_reviews review
    on review.order_id = community_order.id
  where community_order.order_type = 'community'
  order by community_order.created_at desc;
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
  else
    select community.name, '/communities'
    into item_title, target_href
    from public.order_items item
    join public.community_offers offer on offer.id = item.community_offer_id
    join public.communities community on community.id = offer.community_id
    where item.order_id = new.id;
  end if;

  perform public.enqueue_notification(
    new.user_id,
    'registration',
    case new.order_type
      when 'membership' then 'Membership update'
      when 'course' then 'Learning order update'
      when 'community' then 'Community access update'
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
      else
        perform public.fulfill_registration_order(target.id, 'paystack_verified');
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
    else
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

revoke all on function public.community_creator_commerce_enabled() from public;
grant execute on function public.community_creator_commerce_enabled()
  to authenticated;
revoke all on function public.is_community_owner(uuid) from public;
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
revoke all on function public.accept_community_host_terms(uuid, text)
  from public;
grant execute on function public.accept_community_host_terms(uuid, text)
  to authenticated;
revoke all on function public.review_community_host_payout(
  uuid,
  text,
  text,
  text,
  text
) from public;
grant execute on function public.review_community_host_payout(
  uuid,
  text,
  text,
  text,
  text
) to authenticated;
revoke all on function public.save_community_offer(
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  text,
  integer,
  integer,
  text,
  text
) from public;
grant execute on function public.save_community_offer(
  uuid,
  text,
  text,
  text,
  text,
  bigint,
  text,
  integer,
  integer,
  text,
  text
) to authenticated;
revoke all on function public.list_communities() from public;
grant execute on function public.list_communities() to authenticated;
revoke all on function public.request_community_access(uuid) from public;
grant execute on function public.request_community_access(uuid) to authenticated;
revoke all on function public.respond_to_community_invitation(uuid, boolean)
  from public;
grant execute on function public.respond_to_community_invitation(uuid, boolean)
  to authenticated;
revoke all on function public.review_community_membership(uuid, text)
  from public;
grant execute on function public.review_community_membership(uuid, text)
  to authenticated;
revoke all on function public.create_community_order(uuid, text, text)
  from public;
grant execute on function public.create_community_order(uuid, text, text)
  to authenticated;
revoke all on function public.issue_community_access_period(
  uuid,
  uuid,
  uuid,
  text
) from public;
revoke all on function public.fulfill_community_order(uuid, text) from public;
revoke all on function public.review_community_order(uuid, text, text)
  from public;
grant execute on function public.review_community_order(uuid, text, text)
  to authenticated;
revoke all on function public.get_community_host_commerce(uuid) from public;
grant execute on function public.get_community_host_commerce(uuid)
  to authenticated;
revoke all on function public.list_community_host_plans() from public;
grant execute on function public.list_community_host_plans() to authenticated;
revoke all on function public.list_community_commerce_admin() from public;
grant execute on function public.list_community_commerce_admin()
  to authenticated;
revoke all on function public.list_community_orders_admin() from public;
grant execute on function public.list_community_orders_admin()
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

comment on table public.community_revenue_ledger is
  'Creator earnings remain held until payout identity and provider settlement are reconciled.';
comment on column public.community_host_accounts.provider_subaccount_code is
  'Provider reference only; bank account details must never be stored here.';

commit;
