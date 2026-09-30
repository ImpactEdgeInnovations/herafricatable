begin;

-- Event card checkout is a separate commercial release from free/manual
-- registration. Default closed even when Paystack keys are configured.
insert into public.feature_flags(key, enabled, description)
values ('event_automatic_checkout', false,
  'Automatic card checkout for event places after provider, refund and reversal acceptance')
on conflict (key) do nothing;

create or replace function public.module_release_catalog()
returns table(feature_key text, feature_label text, module_key text,
  sort_order integer)
language sql immutable security definer set search_path = ''
as $$
  values
    ('communities', 'Communities', 'community_core', 10),
    ('communities', 'Communities', 'community_conversations', 10),
    ('communities', 'Communities', 'community_member_experience', 10),
    ('communities', 'Communities', 'community_programmes', 10),
    ('communities', 'Communities', 'community_release', 10),
    ('community_creator_commerce', 'Community host payments', 'community_commerce', 20),
    ('learning', 'Learning', 'learning', 30),
    ('referrals', 'Referrals', 'referrals', 40),
    ('memberships', 'Membership checkout', 'membership', 50),
    ('circles', 'Circles', 'circles', 60),
    ('partner_perks', 'Partner benefits', 'perks', 70),
    ('event_guest_access', 'Public event guests', 'events_content', 80),
    ('event_guest_access', 'Public event guests', 'registration_payments', 80),
    ('event_automatic_checkout', 'Automatic event payments',
      'registration_payments', 90)
$$;

insert into public.module_release_checks(
  feature_key, check_key, label, guidance, sort_order
) values
  ('event_automatic_checkout', 'provider_approval',
    'Confirm the payment provider approved event charges',
    'Record written provider approval, supported countries/cards, settlement account and the applicable terms.', 10),
  ('event_automatic_checkout', 'two_account_journey',
    'Rehearse two real payment journeys',
    'Use separate test accounts to verify checkout, verified webhook, duplicate callback, expiry, attendee confirmation and receipts.', 20),
  ('event_automatic_checkout', 'refund_and_reversal',
    'Rehearse refunds and reversals',
    'Verify cancellation, refund request, provider reversal, entitlement revocation and reconciliation without granting a pass twice.', 30),
  ('event_automatic_checkout', 'admin_operations',
    'Rehearse payment support and reconciliation',
    'Verify Admin can inspect payment evidence, handle failed charges, pause checkout and reconcile the event ledger.', 40),
  ('event_automatic_checkout', 'privacy_and_permissions',
    'Protect financial and attendee records',
    'Confirm attendees cannot read another order, payment attempt, refund or event check-in pass.', 50),
  ('event_automatic_checkout', 'rollback_and_recovery',
    'Rehearse turning off new charges',
    'Pause automatic checkout, verify new payment requests stop and existing paid or pending orders remain recoverable.', 60)
on conflict(feature_key, check_key) do nothing;

create or replace function public.enforce_event_automatic_checkout_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'published' and new.registration_mode = 'automatic'
    and not coalesce((select enabled from public.feature_flags
      where key = 'event_automatic_checkout'), false) then
    raise exception 'Automatic event payments are paused';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_event_automatic_checkout_event() from public;
drop trigger if exists event_automatic_checkout_event_guard on public.events;
create trigger event_automatic_checkout_event_guard
before insert or update of status, registration_mode on public.events
for each row execute function public.enforce_event_automatic_checkout_event();

-- Protect direct API/RPC order creation as well as the Admin publication
-- control. Status-only updates to existing orders remain possible after a
-- checkout pause so payments and refunds can be reconciled safely.
create or replace function public.enforce_event_automatic_checkout_order()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.order_type = 'event' and new.processing_mode = 'automatic'
    and not coalesce((select enabled from public.feature_flags
      where key = 'event_automatic_checkout'), false) then
    raise exception 'Automatic event payments are paused';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_event_automatic_checkout_order() from public;
drop trigger if exists event_automatic_checkout_order_guard on public.orders;
create trigger event_automatic_checkout_order_guard
before insert or update of order_type, processing_mode, event_id on public.orders
for each row execute function public.enforce_event_automatic_checkout_order();

create or replace function public.event_automatic_checkout_guard_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.feature_flags
    where key = 'event_automatic_checkout')
    and (select count(*) from pg_catalog.pg_trigger trigger_row
      where trigger_row.tgenabled = 'O' and (
        (trigger_row.tgrelid = 'public.events'::pg_catalog.regclass
          and trigger_row.tgname = 'event_automatic_checkout_event_guard'
          and trigger_row.tgfoid =
            'public.enforce_event_automatic_checkout_event()'::pg_catalog.regprocedure)
        or (trigger_row.tgrelid = 'public.orders'::pg_catalog.regclass
          and trigger_row.tgname = 'event_automatic_checkout_order_guard'
          and trigger_row.tgfoid =
            'public.enforce_event_automatic_checkout_order()'::pg_catalog.regprocedure)
      )) = 2;
$$;
revoke all on function public.event_automatic_checkout_guard_ready() from public;
grant execute on function public.event_automatic_checkout_guard_ready()
  to authenticated, service_role;

-- Public event pages need only a boolean, never the release evidence or
-- payment configuration behind this switch.
create or replace function public.event_automatic_checkout_open()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select enabled from public.feature_flags
    where key = 'event_automatic_checkout'), false);
$$;
revoke all on function public.event_automatic_checkout_open() from public;
grant execute on function public.event_automatic_checkout_open()
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
