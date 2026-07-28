begin;

create table public.launch_gate_checks (
  check_key text primary key check (check_key ~ '^[a-z0-9_]+$'),
  category text not null check (
    category in (
      'authentication',
      'data_security',
      'payments',
      'event_operations',
      'member_safety',
      'experience',
      'governance'
    )
  ),
  label text not null check (char_length(label) between 3 and 120),
  guidance text not null check (char_length(guidance) between 10 and 600),
  status text not null default 'not_started' check (
    status in ('not_started', 'in_progress', 'passed', 'blocked')
  ),
  owner_label text check (
    owner_label is null or char_length(owner_label) between 2 and 120
  ),
  evidence_note text check (
    evidence_note is null or char_length(evidence_note) between 10 and 2000
  ),
  required boolean not null default true,
  sort_order integer not null default 0,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.launch_gate_checks (
  check_key,
  category,
  label,
  guidance,
  sort_order
)
values
  (
    'member_email_otp',
    'authentication',
    'Member email OTP',
    'Request, receive and verify a six-digit production OTP using a real member inbox. Confirm expiry and invalid-code recovery.',
    10
  ),
  (
    'admin_email_otp',
    'authentication',
    'Admin email OTP and role boundary',
    'Verify the Super Admin OTP journey and confirm a normal member cannot enter any Admin workspace.',
    20
  ),
  (
    'production_migration_parity',
    'data_security',
    'Production migration parity',
    'Confirm every committed forward-only migration is applied and the production schema matches the release commit.',
    30
  ),
  (
    'authorization_boundaries',
    'data_security',
    'Role and privacy boundaries',
    'Run anonymous, member, event-staff, moderator and Super Admin boundary checks against the release candidate.',
    40
  ),
  (
    'backup_restore_rehearsal',
    'data_security',
    'Backup and restore rehearsal',
    'Record a successful backup, restore rehearsal and the person authorized to order a rollback.',
    50
  ),
  (
    'manual_registration',
    'payments',
    'Manual registration approval',
    'Complete registration, manual evidence review, approval and single entitlement issuance with a tagged test identity.',
    60
  ),
  (
    'paystack_reconciliation',
    'payments',
    'Paystack payment reconciliation',
    'Reconcile one low-value payment from initialization through signed webhook, fulfillment and Admin reporting.',
    70
  ),
  (
    'event_publish_and_checkin',
    'event_operations',
    'Event publish and guest arrival',
    'Create a draft, verify it is private, publish it, register a guest, scan the pass and rehearse an audited reversal.',
    80
  ),
  (
    'notification_delivery',
    'event_operations',
    'Notification delivery and retry',
    'Verify the sender domain, production worker schedule, successful delivery and one controlled retry path.',
    90
  ),
  (
    'safety_support_privacy',
    'member_safety',
    'Safety, support and privacy response',
    'Exercise a report, support request and deletion cooling-off path, then confirm the on-duty escalation owners.',
    100
  ),
  (
    'device_accessibility',
    'experience',
    'Device and accessibility acceptance',
    'Record keyboard, screen-reader, 200% zoom, iPhone Safari, Android Chrome and tablet acceptance evidence.',
    110
  ),
  (
    'launch_signoff',
    'governance',
    'Launch decision and owner sign-off',
    'Record product, operations, engineering/security and legal/privacy approval after every other required gate passes.',
    120
  )
on conflict (check_key) do nothing;

create index launch_gate_checks_status_idx
  on public.launch_gate_checks(status, sort_order);

alter table public.launch_gate_checks enable row level security;

create policy "Super admins read launch gate checks"
  on public.launch_gate_checks
  for select
  to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]));

create or replace function public.list_launch_gate_checks()
returns table (
  check_key text,
  category text,
  label text,
  guidance text,
  status text,
  owner_label text,
  evidence_note text,
  required boolean,
  sort_order integer,
  verified_by_name text,
  verified_at timestamptz,
  updated_at timestamptz
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
    gate.check_key,
    gate.category,
    gate.label,
    gate.guidance,
    gate.status,
    gate.owner_label,
    gate.evidence_note,
    gate.required,
    gate.sort_order,
    verifier.display_name,
    gate.verified_at,
    gate.updated_at
  from public.launch_gate_checks gate
  left join public.profiles verifier on verifier.id = gate.verified_by
  order by gate.sort_order, gate.check_key;
end;
$$;

create or replace function public.save_launch_gate_check(
  p_check_key text,
  p_status text,
  p_owner_label text,
  p_evidence_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  normalized_owner text := nullif(trim(p_owner_label), '');
  normalized_evidence text := nullif(trim(p_evidence_note), '');
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  if p_status not in ('not_started', 'in_progress', 'passed', 'blocked') then
    raise exception 'Invalid launch gate status';
  end if;

  if p_status in ('in_progress', 'blocked') and normalized_owner is null then
    raise exception 'Add an accountable owner';
  end if;

  if p_status = 'passed'
    and char_length(coalesce(normalized_evidence, '')) < 20 then
    raise exception 'Passed checks require concise evidence';
  end if;

  if p_status = 'blocked'
    and char_length(coalesce(normalized_evidence, '')) < 10 then
    raise exception 'Blocked checks require a clear reason';
  end if;

  if normalized_evidence is not null
    and char_length(normalized_evidence) < 10 then
    raise exception 'Launch gate evidence must contain at least 10 characters';
  end if;

  if char_length(coalesce(normalized_owner, '')) > 120
    or char_length(coalesce(normalized_evidence, '')) > 2000 then
    raise exception 'Launch gate evidence is too long';
  end if;

  update public.launch_gate_checks
  set status = p_status,
      owner_label = normalized_owner,
      evidence_note = normalized_evidence,
      verified_by = case when p_status = 'passed' then actor else null end,
      verified_at = case when p_status = 'passed' then now() else null end,
      updated_by = actor,
      updated_at = now()
  where check_key = p_check_key;

  if not found then
    raise exception 'Unknown launch gate';
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
    'launch.gate_updated',
    'launch_gate',
    null,
    jsonb_build_object(
      'check_key', p_check_key,
      'status', p_status,
      'has_evidence', normalized_evidence is not null
    )
  );
end;
$$;

revoke all on function public.list_launch_gate_checks() from public;
grant execute on function public.list_launch_gate_checks() to authenticated;
revoke all on function public.save_launch_gate_check(text, text, text, text)
  from public;
grant execute on function public.save_launch_gate_check(text, text, text, text)
  to authenticated;

comment on table public.launch_gate_checks is
  'Super Admin-only operational launch evidence. Store concise outcomes, never credentials, OTPs, payment data or private member content.';

commit;
