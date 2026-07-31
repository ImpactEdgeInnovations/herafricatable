begin;

create table public.community_reconciliation_entries(
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null
    references public.community_revenue_ledger(id) on delete restrict,
  community_id uuid not null
    references public.communities(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  entry_type text not null
    check(
      entry_type in (
        'provider_fee',
        'tax_withheld',
        'refund',
        'dispute_hold',
        'dispute_release',
        'reserve_hold',
        'reserve_release',
        'settlement'
      )
    ),
  signed_amount_minor bigint not null check(signed_amount_minor <> 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  source_provider text not null
    check(source_provider in ('paystack', 'manual', 'platform')),
  source_reference text not null check(char_length(source_reference) between 3 and 200),
  note text not null check(char_length(note) between 5 and 1000),
  metadata jsonb not null default '{}'::jsonb
    check(jsonb_typeof(metadata) = 'object'),
  recorded_by uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint community_reconciliation_direction check(
    (
      entry_type in (
        'provider_fee',
        'tax_withheld',
        'refund',
        'dispute_hold',
        'reserve_hold',
        'settlement'
      )
      and signed_amount_minor < 0
    )
    or (
      entry_type in ('dispute_release', 'reserve_release')
      and signed_amount_minor > 0
    )
  ),
  unique(source_provider, source_reference, entry_type)
);

create index community_reconciliation_statement_idx
  on public.community_reconciliation_entries(
    community_id,
    currency,
    occurred_at desc
  );
create index community_reconciliation_ledger_idx
  on public.community_reconciliation_entries(ledger_id, entry_type);

create table public.community_financial_cases(
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null
    references public.community_revenue_ledger(id) on delete restrict,
  community_id uuid not null
    references public.communities(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  case_type text not null check(case_type in ('refund', 'dispute')),
  status text not null
    check(
      status in (
        'pending',
        'processing',
        'needs_attention',
        'open',
        'under_review',
        'completed',
        'failed',
        'rejected',
        'won',
        'lost'
      )
    ),
  amount_minor bigint not null check(amount_minor > 0),
  host_impact_minor bigint not null check(host_impact_minor >= 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  provider text not null check(provider in ('paystack', 'manual')),
  provider_case_reference text not null
    check(char_length(provider_case_reference) between 2 and 200),
  opened_note text not null check(char_length(opened_note) between 5 and 1000),
  resolution_note text check(
    resolution_note is null or char_length(resolution_note) between 5 and 1000
  ),
  opened_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(provider, provider_case_reference, case_type)
);

create index community_financial_cases_queue_idx
  on public.community_financial_cases(status, case_type, opened_at);

create table public.community_settlement_batches(
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default(
    'HAT-PAYOUT-' || upper(
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    )
  ),
  community_id uuid not null
    references public.communities(id) on delete restrict,
  host_user_id uuid not null references auth.users(id) on delete restrict,
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  amount_minor bigint not null check(amount_minor > 0),
  period_ends_at timestamptz not null,
  status text not null default 'draft'
    check(status in ('draft', 'approved', 'paid', 'cancelled')),
  provider text not null check(provider in ('paystack', 'manual')),
  provider_settlement_reference text,
  creation_note text not null check(char_length(creation_note) between 5 and 1000),
  review_note text check(
    review_note is null or char_length(review_note) between 5 and 1000
  ),
  payment_note text check(
    payment_note is null or char_length(payment_note) between 5 and 1000
  ),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete set null,
  paid_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index community_one_open_settlement_idx
  on public.community_settlement_batches(community_id, currency)
  where status in ('draft', 'approved');
create index community_settlement_batches_status_idx
  on public.community_settlement_batches(status, created_at);

create table public.community_settlement_items(
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null
    references public.community_settlement_batches(id) on delete restrict,
  ledger_id uuid not null
    references public.community_revenue_ledger(id) on delete restrict,
  amount_minor bigint not null check(amount_minor > 0),
  created_at timestamptz not null default now(),
  unique(batch_id, ledger_id)
);

alter table public.community_reconciliation_entries enable row level security;
alter table public.community_financial_cases enable row level security;
alter table public.community_settlement_batches enable row level security;
alter table public.community_settlement_items enable row level security;

create policy "Hosts read their reconciliation entries"
  on public.community_reconciliation_entries for select
  to authenticated
  using(
    exists(
      select 1
      from public.community_revenue_ledger ledger
      where ledger.id = community_reconciliation_entries.ledger_id
        and ledger.host_user_id = auth.uid()
    )
    or public.is_admin(array['super_admin']::public.app_role[])
  );

create policy "Super admins read financial cases"
  on public.community_financial_cases for select
  to authenticated
  using(public.is_admin(array['super_admin']::public.app_role[]));

create policy "Hosts read visible settlement batches"
  on public.community_settlement_batches for select
  to authenticated
  using(
    (
      host_user_id = auth.uid()
      and status in ('approved', 'paid')
    )
    or public.is_admin(array['super_admin']::public.app_role[])
  );

create policy "Super admins read settlement items"
  on public.community_settlement_items for select
  to authenticated
  using(public.is_admin(array['super_admin']::public.app_role[]));

create or replace function public.prevent_community_financial_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Financial statement records are append-only';
end;
$$;

create trigger community_reconciliation_entries_immutable
before update or delete on public.community_reconciliation_entries
for each row execute function public.prevent_community_financial_mutation();

create trigger community_settlement_items_immutable
before update or delete on public.community_settlement_items
for each row execute function public.prevent_community_financial_mutation();

create or replace function public.community_ledger_available_minor(
  p_ledger_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select
    ledger.host_net_minor
    + coalesce(
      (
        select sum(entry.signed_amount_minor)
        from public.community_reconciliation_entries entry
        where entry.ledger_id = ledger.id
      ),
      0
    )
  from public.community_revenue_ledger ledger
  where ledger.id = p_ledger_id
$$;

create or replace function public.community_case_host_impact(
  p_ledger_id uuid,
  p_amount_minor bigint
)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select least(
    ledger.host_net_minor,
    floor(
      ledger.host_net_minor::numeric
      * least(p_amount_minor, ledger.gross_minor)::numeric
      / greatest(ledger.gross_minor, 1)::numeric
    )::bigint
  )
  from public.community_revenue_ledger ledger
  where ledger.id = p_ledger_id
$$;

create or replace function public.capture_initial_community_provider_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.payment_attempts%rowtype;
  raw_fee text;
  provider_fee bigint := 0;
begin
  select attempt.*
  into payment
  from public.payment_attempts attempt
  where attempt.order_id = new.order_id
    and attempt.provider = 'paystack'
    and attempt.status = 'success'
  order by attempt.updated_at desc
  limit 1;

  raw_fee := coalesce(
    payment.provider_response #>> '{data,fees}',
    payment.provider_response ->> 'fees'
  );
  if coalesce(raw_fee, '') ~ '^[0-9]+$' then
    provider_fee := least(raw_fee::bigint, new.gross_minor);
  end if;

  if provider_fee > 0 then
    insert into public.community_reconciliation_entries(
      ledger_id,
      community_id,
      order_id,
      entry_type,
      signed_amount_minor,
      currency,
      source_provider,
      source_reference,
      note,
      metadata
    )
    values(
      new.id,
      new.community_id,
      new.order_id,
      'provider_fee',
      -provider_fee,
      new.currency,
      'paystack',
      'charge-fee:' || new.order_id,
      'Verified Paystack transaction fee',
      jsonb_build_object('payment_attempt_id', payment.id)
    )
    on conflict(source_provider, source_reference, entry_type) do nothing;
  end if;
  return new;
end;
$$;

create trigger community_revenue_capture_provider_fee
after insert on public.community_revenue_ledger
for each row execute function public.capture_initial_community_provider_fee();

create or replace function public.process_community_financial_webhook(
  p_provider_event_id text,
  p_event_type text,
  p_transaction_reference text,
  p_provider_case_reference text,
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
  ledger public.community_revenue_ledger%rowtype;
  target_case public.community_financial_cases%rowtype;
  case_type text;
  next_status text;
  impact bigint;
  existing_refund_impact bigint := 0;
  dispute_hold bigint := 0;
  completed_refund_total bigint := 0;
  case_reference text;
  processed timestamptz;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if not p_signature_verified then
    raise exception 'Provider signature required';
  end if;
  if p_event_type not in(
    'refund.pending',
    'refund.processing',
    'refund.needs-attention',
    'refund.failed',
    'refund.processed',
    'charge.dispute.create',
    'charge.dispute.remind',
    'charge.dispute.resolve'
  ) then
    return 'ignored';
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

  select event.processed_at
  into processed
  from public.payment_events event
  where event.provider = 'paystack'
    and event.provider_event_id = p_provider_event_id
  for update;
  if processed is not null then
    return 'already_processed';
  end if;

  select *
  into target
  from public.orders
  where reference = trim(p_transaction_reference)
    and order_type = 'community'
  for update;
  if not found then
    update public.payment_events
    set error_message = 'Community order not found', processed_at = now()
    where provider = 'paystack'
      and provider_event_id = p_provider_event_id;
    return 'community_order_not_found';
  end if;

  select *
  into ledger
  from public.community_revenue_ledger
  where order_id = target.id
  for update;
  if not found then
    raise exception 'Community revenue ledger not found';
  end if;
  if p_amount_minor <= 0
    or p_amount_minor > ledger.gross_minor
    or upper(p_currency) <> ledger.currency
  then
    raise exception 'Financial event amount or currency mismatch';
  end if;

  case_type := case
    when p_event_type like 'refund.%' then 'refund'
    else 'dispute'
  end;
  case_reference := coalesce(
    nullif(trim(p_provider_case_reference), ''),
    p_provider_event_id
  );
  next_status := case p_event_type
    when 'refund.pending' then 'pending'
    when 'refund.processing' then 'processing'
    when 'refund.needs-attention' then 'needs_attention'
    when 'refund.failed' then 'failed'
    when 'refund.processed' then 'completed'
    when 'charge.dispute.create' then 'open'
    when 'charge.dispute.remind' then 'under_review'
    else case
      when lower(coalesce(p_status, '')) in(
        'merchant-accepted',
        'accepted',
        'lost',
        'resolved-lost'
      ) then 'lost'
      when lower(coalesce(p_status, '')) in(
        'declined',
        'won',
        'resolved-won'
      ) then 'won'
      else 'under_review'
    end
  end;

  impact := public.community_case_host_impact(ledger.id, p_amount_minor);

  insert into public.community_financial_cases(
    ledger_id,
    community_id,
    order_id,
    case_type,
    status,
    amount_minor,
    host_impact_minor,
    currency,
    provider,
    provider_case_reference,
    opened_note,
    resolution_note,
    reviewed_at,
    resolved_at
  )
  values(
    ledger.id,
    ledger.community_id,
    target.id,
    case_type,
    next_status,
    p_amount_minor,
    impact,
    ledger.currency,
    'paystack',
    case_reference,
    'Verified Paystack ' || replace(p_event_type, '.', ' ') || ' event',
    case
      when next_status in ('completed', 'failed', 'won', 'lost')
        then 'Final state received from signed Paystack webhook'
    end,
    case
      when next_status in ('completed', 'failed', 'won', 'lost') then now()
    end,
    case
      when next_status in ('completed', 'failed', 'won', 'lost') then now()
    end
  )
  on conflict(provider, provider_case_reference, case_type) do update
  set
    status = excluded.status,
    amount_minor = excluded.amount_minor,
    host_impact_minor = excluded.host_impact_minor,
    resolution_note = excluded.resolution_note,
    reviewed_at = excluded.reviewed_at,
    resolved_at = excluded.resolved_at,
    updated_at = now()
  returning * into target_case;

  if p_event_type = 'charge.dispute.create' and impact > 0 then
    insert into public.community_reconciliation_entries(
      ledger_id,
      community_id,
      order_id,
      entry_type,
      signed_amount_minor,
      currency,
      source_provider,
      source_reference,
      note,
      metadata
    )
    values(
      ledger.id,
      ledger.community_id,
      target.id,
      'dispute_hold',
      -impact,
      ledger.currency,
      'paystack',
      'case:' || case_reference,
      'Creator share held while a payment dispute is reviewed',
      jsonb_build_object('case_id', target_case.id)
    )
    on conflict(source_provider, source_reference, entry_type) do nothing;
  elsif p_event_type = 'charge.dispute.resolve'
    and next_status = 'won'
  then
    select greatest(
      -coalesce(sum(entry.signed_amount_minor), 0),
      0
    )
    into dispute_hold
    from public.community_reconciliation_entries entry
    where entry.ledger_id = ledger.id
      and entry.entry_type in ('dispute_hold', 'dispute_release');

    if dispute_hold > 0 then
      insert into public.community_reconciliation_entries(
        ledger_id,
        community_id,
        order_id,
        entry_type,
        signed_amount_minor,
        currency,
        source_provider,
        source_reference,
        note,
        metadata
      )
      values(
        ledger.id,
        ledger.community_id,
        target.id,
        'dispute_release',
        dispute_hold,
        ledger.currency,
        'paystack',
        'case:' || case_reference || ':release',
        'Creator share released after the dispute was resolved',
        jsonb_build_object('case_id', target_case.id)
      )
      on conflict(source_provider, source_reference, entry_type) do nothing;
    end if;
  elsif p_event_type = 'refund.processed' then
    select greatest(
      -coalesce(sum(entry.signed_amount_minor), 0),
      0
    )
    into dispute_hold
    from public.community_reconciliation_entries entry
    where entry.ledger_id = ledger.id
      and entry.entry_type in ('dispute_hold', 'dispute_release');

    if dispute_hold > 0 then
      insert into public.community_reconciliation_entries(
        ledger_id,
        community_id,
        order_id,
        entry_type,
        signed_amount_minor,
        currency,
        source_provider,
        source_reference,
        note,
        metadata
      )
      values(
        ledger.id,
        ledger.community_id,
        target.id,
        'dispute_release',
        dispute_hold,
        ledger.currency,
        'paystack',
        'refund:' || case_reference || ':hold-release',
        'Dispute hold replaced by the processed refund adjustment',
        jsonb_build_object('case_id', target_case.id)
      )
      on conflict(source_provider, source_reference, entry_type) do nothing;
    end if;

    select coalesce(-sum(entry.signed_amount_minor), 0)
    into existing_refund_impact
    from public.community_reconciliation_entries entry
    where entry.ledger_id = ledger.id
      and entry.entry_type = 'refund';
    impact := least(
      impact,
      greatest(ledger.host_net_minor - existing_refund_impact, 0)
    );

    if impact > 0 then
      insert into public.community_reconciliation_entries(
        ledger_id,
        community_id,
        order_id,
        entry_type,
        signed_amount_minor,
        currency,
        source_provider,
        source_reference,
        note,
        metadata
      )
      values(
        ledger.id,
        ledger.community_id,
        target.id,
        'refund',
        -impact,
        ledger.currency,
        'paystack',
        'refund:' || case_reference,
        'Creator share adjusted after a processed customer refund',
        jsonb_build_object(
          'case_id', target_case.id,
          'customer_refund_minor', p_amount_minor
        )
      )
      on conflict(source_provider, source_reference, entry_type) do nothing;
    end if;

    select coalesce(sum(financial_case.amount_minor), 0)
    into completed_refund_total
    from public.community_financial_cases financial_case
    where financial_case.ledger_id = ledger.id
      and financial_case.case_type = 'refund'
      and financial_case.status = 'completed';

    if completed_refund_total >= ledger.gross_minor then
      update public.orders
      set status = 'refunded', updated_at = now()
      where id = target.id;
      update public.entitlements
      set status = 'revoked', revoked_at = now()
      where order_id = target.id and status = 'active';
      update public.community_access_periods
      set status = 'revoked', revoked_at = now(), updated_at = now()
      where order_id = target.id
        and status in ('scheduled', 'active', 'grace');
      update public.community_revenue_ledger
      set settlement_status = 'reversed', updated_at = now()
      where id = ledger.id;
      update public.community_memberships
      set status = 'approved_pending_payment', updated_at = now()
      where community_id = ledger.community_id
        and user_id = target.user_id
        and role = 'member'
        and status = 'active';
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
    'community.finance_webhook_processed',
    'community_financial_case',
    target_case.id,
    jsonb_build_object(
      'event_type', p_event_type,
      'status', next_status,
      'order_id', target.id,
      'amount_minor', p_amount_minor
    )
  );
  return next_status;
exception
  when others then
    update public.payment_events
    set error_message = sqlerrm
    where provider = 'paystack'
      and provider_event_id = p_provider_event_id;
    raise;
end;
$$;

create or replace function public.record_community_financial_adjustment(
  p_order_id uuid,
  p_entry_type text,
  p_amount_minor bigint,
  p_source_provider text,
  p_source_reference text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ledger public.community_revenue_ledger%rowtype;
  saved uuid;
  held bigint := 0;
  released bigint := 0;
  signed_amount bigint;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_entry_type not in(
    'provider_fee',
    'tax_withheld',
    'reserve_hold',
    'reserve_release'
  )
    or p_source_provider not in ('paystack', 'manual', 'platform')
    or p_amount_minor <= 0
    or char_length(trim(coalesce(p_source_reference, ''))) < 3
    or char_length(trim(coalesce(p_note, ''))) < 5
  then
    raise exception 'Valid reconciliation adjustment required';
  end if;

  select *
  into ledger
  from public.community_revenue_ledger
  where order_id = p_order_id
  for update;
  if not found then
    raise exception 'Community revenue order not found';
  end if;
  if p_amount_minor > ledger.gross_minor then
    raise exception 'Adjustment exceeds the original order amount';
  end if;

  if p_entry_type = 'reserve_release' then
    select
      coalesce(
        -sum(entry.signed_amount_minor)
          filter(where entry.entry_type = 'reserve_hold'),
        0
      ),
      coalesce(
        sum(entry.signed_amount_minor)
          filter(where entry.entry_type = 'reserve_release'),
        0
      )
    into held, released
    from public.community_reconciliation_entries entry
    where entry.ledger_id = ledger.id;
    if p_amount_minor > held - released then
      raise exception 'Reserve release exceeds the amount currently held';
    end if;
  end if;

  signed_amount := case
    when p_entry_type = 'reserve_release' then p_amount_minor
    else -p_amount_minor
  end;

  insert into public.community_reconciliation_entries(
    ledger_id,
    community_id,
    order_id,
    entry_type,
    signed_amount_minor,
    currency,
    source_provider,
    source_reference,
    note,
    recorded_by
  )
  values(
    ledger.id,
    ledger.community_id,
    ledger.order_id,
    p_entry_type,
    signed_amount,
    ledger.currency,
    p_source_provider,
    trim(p_source_reference),
    trim(p_note),
    auth.uid()
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
    'community.finance_adjustment_recorded',
    'community_reconciliation_entry',
    saved,
    jsonb_build_object(
      'order_id', p_order_id,
      'entry_type', p_entry_type,
      'amount_minor', p_amount_minor
    )
  );
  return saved;
end;
$$;

create or replace function public.open_community_financial_case(
  p_order_id uuid,
  p_case_type text,
  p_amount_minor bigint,
  p_provider text,
  p_provider_case_reference text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ledger public.community_revenue_ledger%rowtype;
  saved uuid;
  impact bigint;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_case_type not in ('refund', 'dispute')
    or p_provider not in ('paystack', 'manual')
    or p_amount_minor <= 0
    or char_length(trim(coalesce(p_provider_case_reference, ''))) < 2
    or char_length(trim(coalesce(p_note, ''))) < 5
  then
    raise exception 'Valid financial case required';
  end if;

  select *
  into ledger
  from public.community_revenue_ledger
  where order_id = p_order_id
  for update;
  if not found or p_amount_minor > ledger.gross_minor then
    raise exception 'Community order or case amount is invalid';
  end if;

  impact := public.community_case_host_impact(ledger.id, p_amount_minor);
  insert into public.community_financial_cases(
    ledger_id,
    community_id,
    order_id,
    case_type,
    status,
    amount_minor,
    host_impact_minor,
    currency,
    provider,
    provider_case_reference,
    opened_note,
    opened_by
  )
  values(
    ledger.id,
    ledger.community_id,
    ledger.order_id,
    p_case_type,
    case when p_case_type = 'refund' then 'pending' else 'open' end,
    p_amount_minor,
    impact,
    ledger.currency,
    p_provider,
    trim(p_provider_case_reference),
    trim(p_note),
    auth.uid()
  )
  returning id into saved;

  if p_case_type = 'dispute' and impact > 0 then
    insert into public.community_reconciliation_entries(
      ledger_id,
      community_id,
      order_id,
      entry_type,
      signed_amount_minor,
      currency,
      source_provider,
      source_reference,
      note,
      metadata,
      recorded_by
    )
    values(
      ledger.id,
      ledger.community_id,
      ledger.order_id,
      'dispute_hold',
      -impact,
      ledger.currency,
      p_provider,
      'case:' || trim(p_provider_case_reference),
      'Creator share held while a payment dispute is reviewed',
      jsonb_build_object('case_id', saved),
      auth.uid()
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
    'community.financial_case_opened',
    'community_financial_case',
    saved,
    jsonb_build_object(
      'case_type', p_case_type,
      'order_id', p_order_id,
      'amount_minor', p_amount_minor
    )
  );
  return saved;
end;
$$;

create or replace function public.review_community_financial_case(
  p_case_id uuid,
  p_action text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.community_financial_cases%rowtype;
  ledger public.community_revenue_ledger%rowtype;
  target public.orders%rowtype;
  next_status text;
  dispute_hold bigint := 0;
  existing_refund_impact bigint := 0;
  impact bigint;
  completed_refund_total bigint := 0;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'A clear case review note is required';
  end if;

  select *
  into target_case
  from public.community_financial_cases
  where id = p_case_id
  for update;
  if not found
    or target_case.status in ('completed', 'failed', 'rejected', 'won', 'lost')
  then
    raise exception 'Open financial case not found';
  end if;

  select * into ledger
  from public.community_revenue_ledger
  where id = target_case.ledger_id
  for update;
  select * into target
  from public.orders
  where id = target_case.order_id
  for update;

  if target_case.case_type = 'refund' then
    if p_action not in(
      'processing',
      'needs_attention',
      'complete',
      'fail',
      'reject'
    ) then
      raise exception 'Unsupported refund action';
    end if;
    next_status := case p_action
      when 'complete' then 'completed'
      when 'fail' then 'failed'
      when 'reject' then 'rejected'
      else p_action
    end;

    if p_action = 'complete' then
      select greatest(
        -coalesce(sum(entry.signed_amount_minor), 0),
        0
      )
      into dispute_hold
      from public.community_reconciliation_entries entry
      where entry.ledger_id = ledger.id
        and entry.entry_type in ('dispute_hold', 'dispute_release');
      if dispute_hold > 0 then
        insert into public.community_reconciliation_entries(
          ledger_id,
          community_id,
          order_id,
          entry_type,
          signed_amount_minor,
          currency,
          source_provider,
          source_reference,
          note,
          metadata,
          recorded_by
        )
        values(
          ledger.id,
          ledger.community_id,
          ledger.order_id,
          'dispute_release',
          dispute_hold,
          ledger.currency,
          target_case.provider,
          'case:' || target_case.id || ':refund-release',
          'Dispute hold replaced by the completed refund adjustment',
          jsonb_build_object('case_id', target_case.id),
          auth.uid()
        )
        on conflict(source_provider, source_reference, entry_type) do nothing;
      end if;

      select coalesce(-sum(entry.signed_amount_minor), 0)
      into existing_refund_impact
      from public.community_reconciliation_entries entry
      where entry.ledger_id = ledger.id
        and entry.entry_type = 'refund';
      impact := least(
        target_case.host_impact_minor,
        greatest(ledger.host_net_minor - existing_refund_impact, 0)
      );
      if impact > 0 then
        insert into public.community_reconciliation_entries(
          ledger_id,
          community_id,
          order_id,
          entry_type,
          signed_amount_minor,
          currency,
          source_provider,
          source_reference,
          note,
          metadata,
          recorded_by
        )
        values(
          ledger.id,
          ledger.community_id,
          ledger.order_id,
          'refund',
          -impact,
          ledger.currency,
          target_case.provider,
          'case:' || target_case.id || ':refund',
          'Creator share adjusted after a completed customer refund',
          jsonb_build_object(
            'case_id', target_case.id,
            'customer_refund_minor', target_case.amount_minor
          ),
          auth.uid()
        )
        on conflict(source_provider, source_reference, entry_type) do nothing;
      end if;
    end if;
  else
    if p_action not in ('remind', 'win', 'lose') then
      raise exception 'Unsupported dispute action';
    end if;
    next_status := case p_action
      when 'remind' then 'under_review'
      when 'win' then 'won'
      else 'lost'
    end;
    if p_action = 'win' then
      select greatest(
        -coalesce(sum(entry.signed_amount_minor), 0),
        0
      )
      into dispute_hold
      from public.community_reconciliation_entries entry
      where entry.ledger_id = ledger.id
        and entry.entry_type in ('dispute_hold', 'dispute_release');
      if dispute_hold > 0 then
        insert into public.community_reconciliation_entries(
          ledger_id,
          community_id,
          order_id,
          entry_type,
          signed_amount_minor,
          currency,
          source_provider,
          source_reference,
          note,
          metadata,
          recorded_by
        )
        values(
          ledger.id,
          ledger.community_id,
          ledger.order_id,
          'dispute_release',
          dispute_hold,
          ledger.currency,
          target_case.provider,
          'case:' || target_case.id || ':release',
          'Creator share released after the dispute was won',
          jsonb_build_object('case_id', target_case.id),
          auth.uid()
        )
        on conflict(source_provider, source_reference, entry_type) do nothing;
      end if;
    end if;
  end if;

  update public.community_financial_cases
  set
    status = next_status,
    resolution_note = trim(p_note),
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    resolved_at = case
      when next_status in ('completed', 'failed', 'rejected', 'won', 'lost')
        then now()
    end,
    updated_at = now()
  where id = target_case.id;

  if target_case.case_type = 'refund' and next_status = 'completed' then
    select coalesce(sum(financial_case.amount_minor), 0)
    into completed_refund_total
    from public.community_financial_cases financial_case
    where financial_case.ledger_id = ledger.id
      and financial_case.case_type = 'refund'
      and (
        financial_case.status = 'completed'
        or financial_case.id = target_case.id
      );
    if completed_refund_total >= ledger.gross_minor then
      update public.orders
      set status = 'refunded', updated_at = now()
      where id = target.id;
      update public.entitlements
      set status = 'revoked', revoked_at = now()
      where order_id = target.id and status = 'active';
      update public.community_access_periods
      set status = 'revoked', revoked_at = now(), updated_at = now()
      where order_id = target.id
        and status in ('scheduled', 'active', 'grace');
      update public.community_revenue_ledger
      set settlement_status = 'reversed', updated_at = now()
      where id = ledger.id;
      update public.community_memberships
      set status = 'approved_pending_payment', updated_at = now()
      where community_id = ledger.community_id
        and user_id = target.user_id
        and role = 'member'
        and status = 'active';
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
    'community.financial_case_' || p_action,
    'community_financial_case',
    target_case.id,
    jsonb_build_object('status', next_status, 'note', trim(p_note))
  );
end;
$$;

create or replace function public.create_community_settlement_batch(
  p_community_id uuid,
  p_currency text,
  p_period_ends_at timestamptz,
  p_provider text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  host_id uuid;
  saved uuid;
  total bigint := 0;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if upper(p_currency) !~ '^[A-Z]{3}$'
    or p_period_ends_at > now()
    or p_provider not in ('paystack', 'manual')
    or char_length(trim(coalesce(p_note, ''))) < 5
  then
    raise exception 'Valid settlement configuration required';
  end if;

  select membership.user_id
  into host_id
  from public.community_memberships membership
  join public.community_host_accounts account
    on account.community_id = membership.community_id
  where membership.community_id = p_community_id
    and membership.role = 'owner'
    and membership.status = 'active'
    and account.payout_status = 'verified'
    and account.terms_accepted_at is not null
  limit 1;
  if host_id is null then
    raise exception 'Verified payout owner required';
  end if;
  if exists(
    select 1
    from public.community_financial_cases financial_case
    where financial_case.community_id = p_community_id
      and financial_case.status in(
        'pending',
        'processing',
        'needs_attention',
        'open',
        'under_review'
      )
  ) then
    raise exception 'Resolve open refunds and disputes before settlement';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'community-settlement:' || p_community_id::text || ':' || upper(p_currency),
      0
    )
  );

  select coalesce(sum(public.community_ledger_available_minor(ledger.id)), 0)
  into total
  from public.community_revenue_ledger ledger
  where ledger.community_id = p_community_id
    and ledger.currency = upper(p_currency)
    and ledger.created_at <= p_period_ends_at
    and public.community_ledger_available_minor(ledger.id) > 0;
  if total <= 0 then
    raise exception 'No reconciled creator balance is available';
  end if;

  insert into public.community_settlement_batches(
    community_id,
    host_user_id,
    currency,
    amount_minor,
    period_ends_at,
    provider,
    creation_note,
    created_by
  )
  values(
    p_community_id,
    host_id,
    upper(p_currency),
    total,
    p_period_ends_at,
    p_provider,
    trim(p_note),
    auth.uid()
  )
  returning id into saved;

  insert into public.community_settlement_items(
    batch_id,
    ledger_id,
    amount_minor
  )
  select
    saved,
    ledger.id,
    public.community_ledger_available_minor(ledger.id)
  from public.community_revenue_ledger ledger
  where ledger.community_id = p_community_id
    and ledger.currency = upper(p_currency)
    and ledger.created_at <= p_period_ends_at
    and public.community_ledger_available_minor(ledger.id) > 0;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    'community.settlement_batch_created',
    'community_settlement_batch',
    saved,
    jsonb_build_object(
      'community_id', p_community_id,
      'currency', upper(p_currency),
      'amount_minor', total,
      'period_ends_at', p_period_ends_at
    )
  );
  return saved;
end;
$$;

create or replace function public.review_community_settlement_batch(
  p_batch_id uuid,
  p_action text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.community_settlement_batches%rowtype;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_action not in ('approve', 'cancel')
    or char_length(trim(coalesce(p_note, ''))) < 5
  then
    raise exception 'Valid settlement decision required';
  end if;

  select *
  into target
  from public.community_settlement_batches
  where id = p_batch_id and status = 'draft'
  for update;
  if not found then
    raise exception 'Draft settlement batch not found';
  end if;

  update public.community_settlement_batches
  set
    status = case when p_action = 'approve' then 'approved' else 'cancelled' end,
    review_note = trim(p_note),
    approved_by = case when p_action = 'approve' then auth.uid() end,
    approved_at = case when p_action = 'approve' then now() end,
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
    'community.settlement_batch_' || p_action,
    'community_settlement_batch',
    target.id,
    jsonb_build_object('note', trim(p_note))
  );
end;
$$;

create or replace function public.mark_community_settlement_paid(
  p_batch_id uuid,
  p_provider_reference text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.community_settlement_batches%rowtype;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if char_length(trim(coalesce(p_provider_reference, ''))) < 3
    or char_length(trim(coalesce(p_note, ''))) < 5
  then
    raise exception 'Provider reference and payment note required';
  end if;

  select *
  into target
  from public.community_settlement_batches
  where id = p_batch_id and status = 'approved'
  for update;
  if not found then
    raise exception 'Approved settlement batch not found';
  end if;
  if exists(
    select 1
    from public.community_financial_cases financial_case
    where financial_case.community_id = target.community_id
      and financial_case.status in(
        'pending',
        'processing',
        'needs_attention',
        'open',
        'under_review'
      )
  ) then
    raise exception 'Resolve open refunds and disputes before payment';
  end if;
  if exists(
    select 1
    from public.community_settlement_items item
    where item.batch_id = target.id
      and item.amount_minor
        > greatest(public.community_ledger_available_minor(item.ledger_id), 0)
  ) then
    raise exception 'Creator balance changed; cancel and rebuild the batch';
  end if;

  insert into public.community_reconciliation_entries(
    ledger_id,
    community_id,
    order_id,
    entry_type,
    signed_amount_minor,
    currency,
    source_provider,
    source_reference,
    note,
    metadata,
    recorded_by
  )
  select
    item.ledger_id,
    target.community_id,
    ledger.order_id,
    'settlement',
    -item.amount_minor,
    target.currency,
    target.provider,
    target.reference || ':' || item.ledger_id,
    'Creator settlement marked paid: ' || trim(p_note),
    jsonb_build_object('batch_id', target.id),
    auth.uid()
  from public.community_settlement_items item
  join public.community_revenue_ledger ledger on ledger.id = item.ledger_id
  where item.batch_id = target.id;

  update public.community_settlement_batches
  set
    status = 'paid',
    provider_settlement_reference = trim(p_provider_reference),
    payment_note = trim(p_note),
    paid_by = auth.uid(),
    paid_at = now(),
    updated_at = now()
  where id = target.id;

  update public.community_revenue_ledger ledger
  set
    settlement_status = case
      when public.community_ledger_available_minor(ledger.id) <= 0
        then 'settled'
      else 'eligible'
    end,
    provider_settlement_reference = trim(p_provider_reference),
    settled_at = now(),
    updated_at = now()
  where ledger.id in(
    select item.ledger_id
    from public.community_settlement_items item
    where item.batch_id = target.id
  )
    and ledger.settlement_status <> 'reversed';

  perform public.enqueue_notification(
    target.host_user_id,
    'registration',
    'Creator settlement recorded',
    target.reference || ' for '
      || target.currency || ' '
      || to_char(target.amount_minor::numeric / 100, 'FM999G999G990D00')
      || ' has been marked paid.',
    '/communities',
    'community-settlement-paid:' || target.id
  );

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    'community.settlement_batch_paid',
    'community_settlement_batch',
    target.id,
    jsonb_build_object(
      'provider_reference', trim(p_provider_reference),
      'amount_minor', target.amount_minor
    )
  );
end;
$$;

create or replace function public.get_community_financial_summary(
  p_community_id uuid
)
returns table(
  currency text,
  gross_minor bigint,
  platform_fee_minor bigint,
  provider_fee_minor bigint,
  tax_withheld_minor bigint,
  refund_minor bigint,
  dispute_held_minor bigint,
  reserve_held_minor bigint,
  settled_minor bigint,
  available_minor bigint,
  open_cases bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_community_owner(p_community_id)
    and not public.is_admin(array['super_admin']::public.app_role[])
  then
    raise exception 'Community owner or Super Admin required';
  end if;

  return query
  with per_ledger as(
    select
      ledger.id,
      ledger.currency,
      ledger.gross_minor,
      ledger.platform_fee_minor,
      ledger.host_net_minor,
      coalesce(adjustment.provider_fee_minor, 0) as provider_fee_minor,
      coalesce(adjustment.tax_withheld_minor, 0) as tax_withheld_minor,
      coalesce(adjustment.refund_minor, 0) as refund_minor,
      greatest(coalesce(adjustment.dispute_held_minor, 0), 0)
        as dispute_held_minor,
      greatest(coalesce(adjustment.reserve_held_minor, 0), 0)
        as reserve_held_minor,
      coalesce(adjustment.settled_minor, 0) as settled_minor,
      coalesce(adjustment.total_adjustment_minor, 0)
        as total_adjustment_minor
    from public.community_revenue_ledger ledger
    left join lateral(
      select
        -coalesce(
          sum(entry.signed_amount_minor)
            filter(where entry.entry_type = 'provider_fee'),
          0
        ) as provider_fee_minor,
        -coalesce(
          sum(entry.signed_amount_minor)
            filter(where entry.entry_type = 'tax_withheld'),
          0
        ) as tax_withheld_minor,
        -coalesce(
          sum(entry.signed_amount_minor)
            filter(where entry.entry_type = 'refund'),
          0
        ) as refund_minor,
        -coalesce(
          sum(entry.signed_amount_minor)
            filter(
              where entry.entry_type in ('dispute_hold', 'dispute_release')
            ),
          0
        ) as dispute_held_minor,
        -coalesce(
          sum(entry.signed_amount_minor)
            filter(where entry.entry_type in ('reserve_hold', 'reserve_release')),
          0
        ) as reserve_held_minor,
        -coalesce(
          sum(entry.signed_amount_minor)
            filter(where entry.entry_type = 'settlement'),
          0
        ) as settled_minor,
        coalesce(sum(entry.signed_amount_minor), 0)
          as total_adjustment_minor
      from public.community_reconciliation_entries entry
      where entry.ledger_id = ledger.id
    ) adjustment on true
    where ledger.community_id = p_community_id
  )
  select
    per_ledger.currency,
    sum(per_ledger.gross_minor)::bigint,
    sum(per_ledger.platform_fee_minor)::bigint,
    sum(per_ledger.provider_fee_minor)::bigint,
    sum(per_ledger.tax_withheld_minor)::bigint,
    sum(per_ledger.refund_minor)::bigint,
    sum(per_ledger.dispute_held_minor)::bigint,
    sum(per_ledger.reserve_held_minor)::bigint,
    sum(per_ledger.settled_minor)::bigint,
    sum(
      per_ledger.host_net_minor + per_ledger.total_adjustment_minor
    )::bigint,
    (
      select count(*)
      from public.community_financial_cases financial_case
      where financial_case.community_id = p_community_id
        and financial_case.status in(
          'pending',
          'processing',
          'needs_attention',
          'open',
          'under_review'
        )
        and financial_case.currency = per_ledger.currency
    )::bigint
  from per_ledger
  group by per_ledger.currency
  order by per_ledger.currency;
end;
$$;

create or replace function public.list_community_financial_statement(
  p_community_id uuid,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  transaction_at timestamptz,
  order_reference text,
  entry_kind text,
  description text,
  credit_minor bigint,
  debit_minor bigint,
  currency text,
  source_reference text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_community_owner(p_community_id)
    and not public.is_admin(array['super_admin']::public.app_role[])
  then
    raise exception 'Community owner or Super Admin required';
  end if;

  return query
  select statement.*
  from(
    select
      ledger.created_at as transaction_at,
      host_order.reference as order_reference,
      'earning'::text as entry_kind,
      'Member payment · creator share before provider adjustments'::text
        as description,
      ledger.host_net_minor as credit_minor,
      0::bigint as debit_minor,
      ledger.currency,
      host_order.reference as source_reference
    from public.community_revenue_ledger ledger
    join public.orders host_order on host_order.id = ledger.order_id
    where ledger.community_id = p_community_id

    union all

    select
      entry.occurred_at,
      host_order.reference,
      entry.entry_type,
      case entry.entry_type
        when 'provider_fee' then 'Payment provider fee'
        when 'tax_withheld' then 'Tax withheld'
        when 'refund' then 'Processed customer refund'
        when 'dispute_hold' then 'Dispute hold'
        when 'dispute_release' then 'Dispute hold released'
        when 'reserve_hold' then 'Platform reserve'
        when 'reserve_release' then 'Platform reserve released'
        else 'Creator settlement paid'
      end,
      greatest(entry.signed_amount_minor, 0),
      greatest(-entry.signed_amount_minor, 0),
      entry.currency,
      entry.source_reference
    from public.community_reconciliation_entries entry
    join public.orders host_order on host_order.id = entry.order_id
    where entry.community_id = p_community_id
  ) statement
  order by statement.transaction_at desc, statement.order_reference
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
end;
$$;

create or replace function public.list_community_settlement_batches(
  p_community_id uuid
)
returns table(
  batch_id uuid,
  reference text,
  currency text,
  amount_minor bigint,
  period_ends_at timestamptz,
  status text,
  provider text,
  provider_settlement_reference text,
  created_at timestamptz,
  paid_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_community_owner(p_community_id)
    and not public.is_admin(array['super_admin']::public.app_role[])
  then
    raise exception 'Community owner or Super Admin required';
  end if;

  return query
  select
    batch.id,
    batch.reference,
    batch.currency,
    batch.amount_minor,
    batch.period_ends_at,
    batch.status,
    batch.provider,
    batch.provider_settlement_reference,
    batch.created_at,
    batch.paid_at
  from public.community_settlement_batches batch
  where batch.community_id = p_community_id
    and (
      public.is_admin(array['super_admin']::public.app_role[])
      or batch.status in ('approved', 'paid')
    )
  order by batch.created_at desc;
end;
$$;

create or replace function public.list_community_financial_cases_admin()
returns table(
  case_id uuid,
  community_id uuid,
  community_name text,
  order_id uuid,
  order_reference text,
  member_email text,
  case_type text,
  status text,
  amount_minor bigint,
  host_impact_minor bigint,
  currency text,
  provider text,
  provider_case_reference text,
  opened_note text,
  opened_at timestamptz
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
    financial_case.id,
    financial_case.community_id,
    community.name,
    host_order.id,
    host_order.reference,
    user_row.email::text,
    financial_case.case_type,
    financial_case.status,
    financial_case.amount_minor,
    financial_case.host_impact_minor,
    financial_case.currency,
    financial_case.provider,
    financial_case.provider_case_reference,
    financial_case.opened_note,
    financial_case.opened_at
  from public.community_financial_cases financial_case
  join public.communities community on community.id = financial_case.community_id
  join public.orders host_order on host_order.id = financial_case.order_id
  join auth.users user_row on user_row.id = host_order.user_id
  order by
    case
      when financial_case.status in(
        'pending',
        'processing',
        'needs_attention',
        'open',
        'under_review'
      ) then 0
      else 1
    end,
    financial_case.opened_at desc;
end;
$$;

create or replace function public.list_community_finance_admin()
returns table(
  community_id uuid,
  community_name text,
  community_slug text,
  owner_email text,
  currency text,
  gross_minor bigint,
  available_minor bigint,
  settled_minor bigint,
  open_cases bigint,
  payout_status text
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
  with per_ledger as(
    select
      ledger.id,
      ledger.community_id,
      ledger.currency,
      ledger.gross_minor,
      ledger.host_net_minor,
      coalesce(adjustment.total_adjustment_minor, 0)
        as total_adjustment_minor,
      coalesce(adjustment.settled_minor, 0) as settled_minor
    from public.community_revenue_ledger ledger
    left join lateral(
      select
        coalesce(sum(entry.signed_amount_minor), 0)
          as total_adjustment_minor,
        -coalesce(
          sum(entry.signed_amount_minor)
            filter(where entry.entry_type = 'settlement'),
          0
        ) as settled_minor
      from public.community_reconciliation_entries entry
      where entry.ledger_id = ledger.id
    ) adjustment on true
  )
  select
    community.id,
    community.name,
    community.slug,
    user_row.email::text,
    per_ledger.currency,
    sum(per_ledger.gross_minor)::bigint,
    sum(
      per_ledger.host_net_minor + per_ledger.total_adjustment_minor
    )::bigint,
    sum(per_ledger.settled_minor)::bigint,
    (
      select count(*)
      from public.community_financial_cases financial_case
      where financial_case.community_id = community.id
        and financial_case.status in(
          'pending',
          'processing',
          'needs_attention',
          'open',
          'under_review'
        )
    )::bigint,
    coalesce(account.payout_status, 'not_started')
  from public.communities community
  join per_ledger on per_ledger.community_id = community.id
  left join lateral(
    select membership.user_id
    from public.community_memberships membership
    where membership.community_id = community.id
      and membership.role = 'owner'
      and membership.status = 'active'
    order by membership.joined_at, membership.created_at
    limit 1
  ) owner_membership on true
  left join auth.users user_row on user_row.id = owner_membership.user_id
  left join public.community_host_accounts account
    on account.community_id = community.id
  group by
    community.id,
    community.name,
    community.slug,
    user_row.email,
    per_ledger.currency,
    account.payout_status
  order by community.name, per_ledger.currency;
end;
$$;

create or replace function public.list_community_settlements_admin()
returns table(
  batch_id uuid,
  reference text,
  community_id uuid,
  community_name text,
  owner_email text,
  currency text,
  amount_minor bigint,
  period_ends_at timestamptz,
  status text,
  provider text,
  provider_settlement_reference text,
  created_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz
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
    batch.id,
    batch.reference,
    batch.community_id,
    community.name,
    user_row.email::text,
    batch.currency,
    batch.amount_minor,
    batch.period_ends_at,
    batch.status,
    batch.provider,
    batch.provider_settlement_reference,
    batch.created_at,
    batch.approved_at,
    batch.paid_at
  from public.community_settlement_batches batch
  join public.communities community on community.id = batch.community_id
  join auth.users user_row on user_row.id = batch.host_user_id
  order by batch.created_at desc;
end;
$$;

revoke all on function public.prevent_community_financial_mutation()
  from public;
revoke all on function public.community_ledger_available_minor(uuid)
  from public;
revoke all on function public.community_case_host_impact(uuid, bigint)
  from public;
revoke all on function public.capture_initial_community_provider_fee()
  from public;
revoke all on function public.process_community_financial_webhook(
  text,
  text,
  text,
  text,
  text,
  bigint,
  text,
  jsonb,
  boolean
) from public;
grant execute on function public.process_community_financial_webhook(
  text,
  text,
  text,
  text,
  text,
  bigint,
  text,
  jsonb,
  boolean
) to service_role;
revoke all on function public.record_community_financial_adjustment(
  uuid,
  text,
  bigint,
  text,
  text,
  text
) from public;
grant execute on function public.record_community_financial_adjustment(
  uuid,
  text,
  bigint,
  text,
  text,
  text
) to authenticated;
revoke all on function public.open_community_financial_case(
  uuid,
  text,
  bigint,
  text,
  text,
  text
) from public;
grant execute on function public.open_community_financial_case(
  uuid,
  text,
  bigint,
  text,
  text,
  text
) to authenticated;
revoke all on function public.review_community_financial_case(uuid, text, text)
  from public;
grant execute on function public.review_community_financial_case(
  uuid,
  text,
  text
) to authenticated;
revoke all on function public.create_community_settlement_batch(
  uuid,
  text,
  timestamptz,
  text,
  text
) from public;
grant execute on function public.create_community_settlement_batch(
  uuid,
  text,
  timestamptz,
  text,
  text
) to authenticated;
revoke all on function public.review_community_settlement_batch(
  uuid,
  text,
  text
) from public;
grant execute on function public.review_community_settlement_batch(
  uuid,
  text,
  text
) to authenticated;
revoke all on function public.mark_community_settlement_paid(uuid, text, text)
  from public;
grant execute on function public.mark_community_settlement_paid(
  uuid,
  text,
  text
) to authenticated;
revoke all on function public.get_community_financial_summary(uuid)
  from public;
grant execute on function public.get_community_financial_summary(uuid)
  to authenticated;
revoke all on function public.list_community_financial_statement(
  uuid,
  integer,
  integer
) from public;
grant execute on function public.list_community_financial_statement(
  uuid,
  integer,
  integer
) to authenticated;
revoke all on function public.list_community_settlement_batches(uuid)
  from public;
grant execute on function public.list_community_settlement_batches(uuid)
  to authenticated;
revoke all on function public.list_community_financial_cases_admin()
  from public;
grant execute on function public.list_community_financial_cases_admin()
  to authenticated;
revoke all on function public.list_community_finance_admin()
  from public;
grant execute on function public.list_community_finance_admin()
  to authenticated;
revoke all on function public.list_community_settlements_admin()
  from public;
grant execute on function public.list_community_settlements_admin()
  to authenticated;

comment on table public.community_reconciliation_entries is
  'Append-only creator statement adjustments; no browser or host can mark earnings settled.';
comment on table public.community_financial_cases is
  'Refund and dispute states linked to the original community order and signed provider event.';
comment on table public.community_settlement_batches is
  'Audited creator settlement batches; automatic transfer execution remains disabled.';

commit;
