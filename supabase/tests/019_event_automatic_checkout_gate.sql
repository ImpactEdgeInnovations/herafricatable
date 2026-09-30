begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'checkout-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('d0000000-0000-4000-8000-000000000002', 'checkout-one@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('d0000000-0000-4000-8000-000000000003', 'checkout-two@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003'
);
insert into public.user_roles(user_id, role, granted_by)
values ('d0000000-0000-4000-8000-000000000001', 'super_admin',
        'd0000000-0000-4000-8000-000000000001');
insert into public.events(
  id, slug, title, format, audience, status, starts_at, ends_at,
  capacity, registration_mode, created_by
) values
  ('d1000000-0000-4000-8000-000000000001', 'checkout-manual-test',
   'Checkout Manual Test', 'virtual', 'public', 'published',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   5, 'manual_review', 'd0000000-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000002', 'checkout-automatic-test',
   'Checkout Automatic Test', 'virtual', 'public', 'draft',
   now() + interval '2 days', now() + interval '2 days 2 hours',
   5, 'automatic', 'd0000000-0000-4000-8000-000000000001');
insert into public.ticket_types(id, event_id, name, price_minor, currency, inventory_quantity, status)
values
  ('d2000000-0000-4000-8000-000000000001',
   'd1000000-0000-4000-8000-000000000001', 'Free place', 0, 'KES', 5, 'on_sale'),
  ('d2000000-0000-4000-8000-000000000002',
   'd1000000-0000-4000-8000-000000000002', 'Paid place', 10000, 'KES', 5, 'on_sale');

select is((select enabled from public.feature_flags
  where key = 'event_automatic_checkout'), false,
  'automatic event checkout starts closed');
select ok(public.event_automatic_checkout_guard_ready(),
  'both event publication and order creation are protected by database guards');
select throws_ok(
  $$update public.events set status = 'published'
    where id = 'd1000000-0000-4000-8000-000000000002'$$,
  'P0001', 'Automatic event payments are paused',
  'direct database publication of an automatic-payment event is blocked');
select throws_ok(
  $$insert into public.orders(user_id, event_id, status, processing_mode,
      currency, subtotal_minor, total_minor)
    values ('d0000000-0000-4000-8000-000000000002',
      'd1000000-0000-4000-8000-000000000002', 'pending_payment',
      'automatic', 'KES', 10000, 10000)$$,
  'P0001', 'Automatic event payments are paused',
  'direct automatic event order creation is blocked');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.set_feature_flag('event_automatic_checkout', true)$$,
  'P0001', 'Complete this module in Admin Release before enabling it',
  'Super Admin cannot open card checkout without release evidence');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_event_registration(
    'd1000000-0000-4000-8000-000000000001',
    'd2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'free manual event requests remain available while card checkout is closed');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);

-- These are transaction-local fixtures only. No acceptance evidence survives
-- the final rollback and they do not represent real provider approval.
select public.save_module_release_check(
  'event_automatic_checkout', check_key, 'passed', 'SQL test fixture',
  'Transaction-local SQL gate fixture; not real provider or launch evidence.'
)
from (values ('provider_approval'), ('two_account_journey'),
  ('refund_and_reversal'), ('admin_operations'),
  ('privacy_and_permissions'), ('rollback_and_recovery')) checks(check_key);
select lives_ok(
  $$select public.set_feature_flag('event_automatic_checkout', true)$$,
  'Super Admin may open checkout only after transactional release fixtures pass');
reset role;
select lives_ok(
  $$update public.events set status = 'published'
    where id = 'd1000000-0000-4000-8000-000000000002'$$,
  'an automatic event may publish after its release gate opens');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_event_registration(
    'd1000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002', 1, '', '', '')$$,
  'an approved payment release can create a pending-payment order');
reset role;
select is((select count(*) from public.orders
  where event_id = 'd1000000-0000-4000-8000-000000000002'
    and user_id = 'd0000000-0000-4000-8000-000000000002'
    and status = 'pending_payment'),
  1::bigint, 'the original payment order remains pending for provider verification');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.set_feature_flag('event_automatic_checkout', false)$$,
  'Super Admin can immediately pause new event card charges');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.create_event_registration(
    'd1000000-0000-4000-8000-000000000002',
    'd2000000-0000-4000-8000-000000000002', 1, '', '', '')$$,
  'P0001', 'Automatic event payments are paused',
  'another member cannot create a new payable event order after pause');
reset role;
select is((select count(*) from public.orders
  where event_id = 'd1000000-0000-4000-8000-000000000002'
    and status = 'pending_payment'),
  1::bigint, 'pausing checkout preserves the earlier order for reconciliation');

select * from finish();
rollback;
