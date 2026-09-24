begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'event-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000002', 'event-guest@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000003', 'event-suspended@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id = 'a0000000-0000-4000-8000-000000000001';
update public.profiles set access_status = 'suspended'
where id = 'a0000000-0000-4000-8000-000000000003';
insert into public.user_roles(user_id, role, granted_by)
values (
  'a0000000-0000-4000-8000-000000000001', 'super_admin',
  'a0000000-0000-4000-8000-000000000001'
);

insert into public.events(
  id, slug, title, format, audience, status, starts_at, ends_at,
  registration_mode, created_by
) values
  (
    'a1000000-0000-4000-8000-000000000001', 'guest-access-public-test',
    'Guest Access Public Test', 'virtual', 'public', 'published',
    now() + interval '1 day', now() + interval '1 day 2 hours',
    'manual_review', 'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'a1000000-0000-4000-8000-000000000002', 'guest-access-community-test',
    'Guest Access Community Test', 'virtual', 'community', 'published',
    now() + interval '1 day', now() + interval '1 day 2 hours',
    'manual_review', 'a0000000-0000-4000-8000-000000000001'
  );
insert into public.ticket_types(
  id, event_id, name, price_minor, currency, inventory_quantity, status
) values
  (
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'Free place', 0, 'KES', 20, 'on_sale'
  ),
  (
    'a2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000002',
    'Community place', 0, 'KES', 20, 'on_sale'
  );

select is(
  (select enabled from public.feature_flags where key = 'event_guest_access'),
  false, 'event-only guest access begins disabled'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.create_event_registration(
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'P0001', 'Event registration is available after membership approval',
  'pending guest cannot register while the pilot flag is off'
);

-- Prove the production release gate stays closed without acceptance evidence.
-- All following evidence is a transaction-local test fixture and rolls back.
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.set_feature_flag('event_guest_access', true)$$,
  'P0001', 'Complete this module in Admin Release before enabling it',
  'Admin cannot open guest entry before release checks are complete'
);
select public.save_module_release_check(
  'event_guest_access', 'database_boundary', 'passed', 'SQL test fixture',
  'Transaction-local SQL test fixture for the guest registration boundary; not real launch evidence.'
);
select public.save_module_release_check(
  'event_guest_access', 'two_account_journey', 'passed', 'SQL test fixture',
  'Transaction-local SQL test fixture for the guest registration boundary; not real launch evidence.'
);
select public.save_module_release_check(
  'event_guest_access', 'admin_operations', 'passed', 'SQL test fixture',
  'Transaction-local SQL test fixture for the guest registration boundary; not real launch evidence.'
);
select public.save_module_release_check(
  'event_guest_access', 'privacy_and_permissions', 'passed', 'SQL test fixture',
  'Transaction-local SQL test fixture for the guest registration boundary; not real launch evidence.'
);
select public.save_module_release_check(
  'event_guest_access', 'rollback_and_recovery', 'passed', 'SQL test fixture',
  'Transaction-local SQL test fixture for the guest registration boundary; not real launch evidence.'
);
select lives_ok(
  $$select public.set_feature_flag('event_guest_access', true)$$,
  'Admin can open guest entry only after the transactional release fixtures are complete'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_event_registration(
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'verified pending guest requests a public event place'
);
select is(
  (select status from public.registration_requests
   where event_id = 'a1000000-0000-4000-8000-000000000001'
     and user_id = 'a0000000-0000-4000-8000-000000000002'),
  'pending_review', 'guest registration awaits an event decision'
);
select throws_ok(
  $$select public.create_event_registration(
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'P0001', 'You already have a registration for this event',
  'duplicate pending registration is rejected'
);
select throws_ok(
  $$select public.create_event_registration(
    'a1000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000002', 1, '', '', '')$$,
  'P0001', 'Event is not available to this account',
  'public guest cannot use event access for a private Community event'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_manual_registration(
    (select id from public.orders
      where event_id = 'a1000000-0000-4000-8000-000000000001'
        and user_id = 'a0000000-0000-4000-8000-000000000002'),
    'approve', 'Approved for the event only')$$,
  'Super Admin confirms the guest event place'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select is(
  (select status from public.event_memberships
   where event_id = 'a1000000-0000-4000-8000-000000000001'
     and user_id = 'a0000000-0000-4000-8000-000000000002'),
  'confirmed', 'guest receives confirmed event access'
);
select is(
  (select count(*) from public.entitlements
   where user_id = 'a0000000-0000-4000-8000-000000000002'
     and entitlement_type = 'event_access'),
  1::bigint, 'approval grants the event entitlement'
);
select is(
  (select count(*) from public.entitlements
   where user_id = 'a0000000-0000-4000-8000-000000000002'
     and entitlement_type = 'member_onboarding'),
  0::bigint, 'event approval grants no membership entitlement'
);
select is(
  (select access_status::text from public.profiles
   where id = 'a0000000-0000-4000-8000-000000000002'),
  'pending', 'event approval leaves membership under separate review'
);
select is(
  (select count(*) from public.get_my_event_pass(
    'a1000000-0000-4000-8000-000000000001')),
  1::bigint, 'confirmed guest can open the private event pass'
);
select throws_ok(
  $$select * from public.list_member_directory(null, null, null, 24, 0)$$,
  'P0001', 'Active visible membership required',
  'event access does not open the full member directory'
);

select lives_ok(
  $$select public.cancel_my_event_place(
    (select order_id from public.registration_requests
     where event_id = 'a1000000-0000-4000-8000-000000000001'
       and user_id = 'a0000000-0000-4000-8000-000000000002'),
    'Plans changed')$$,
  'guest can release an unused free place before the event'
);
select is(
  (select status from public.event_memberships
   where event_id = 'a1000000-0000-4000-8000-000000000001'
     and user_id = 'a0000000-0000-4000-8000-000000000002'),
  'cancelled', 'free cancellation removes confirmed event access'
);
select is(
  (select status from public.entitlements
   where event_id = 'a1000000-0000-4000-8000-000000000001'
     and user_id = 'a0000000-0000-4000-8000-000000000002'
     and entitlement_type = 'event_access'),
  'revoked', 'free cancellation revokes the event entitlement'
);
select throws_ok(
  $$select * from public.get_my_event_pass(
    'a1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'A confirmed event registration is required',
  'cancelled guest cannot open the old pass'
);
select is(
  (select count(*) from public.event_checkin_credentials
   where event_id = 'a1000000-0000-4000-8000-000000000001'
     and user_id = 'a0000000-0000-4000-8000-000000000002'),
  0::bigint, 'self-cancellation destroys the old unused pass code'
);
select lives_ok(
  $$select public.create_event_registration(
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'cancelled guest can request a new place with a new order'
);
select is(
  (select count(*) from public.orders
   where event_id = 'a1000000-0000-4000-8000-000000000001'
     and user_id = 'a0000000-0000-4000-8000-000000000002'),
  2::bigint, 'reapplication preserves both order records for audit'
);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_manual_registration(
    (select order_id from public.registration_requests
     where event_id = 'a1000000-0000-4000-8000-000000000001'
       and user_id = 'a0000000-0000-4000-8000-000000000002'),
    'approve', 'New event place approved')$$,
  'Super Admin can review the new request independently'
);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select is(
  (select membership.order_id from public.event_memberships membership
   where membership.event_id = 'a1000000-0000-4000-8000-000000000001'
     and membership.user_id = 'a0000000-0000-4000-8000-000000000002'),
  (select order_id from public.registration_requests
   where event_id = 'a1000000-0000-4000-8000-000000000001'
     and user_id = 'a0000000-0000-4000-8000-000000000002'),
  'reapproved event access points to the new order'
);
select is(
  (select count(*) from public.get_my_event_pass(
    'a1000000-0000-4000-8000-000000000001')),
  1::bigint, 'reapproved guest receives a fresh pass'
);

select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.create_event_registration(
    'a1000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'P0001', 'This account cannot request an event place',
  'suspended account cannot register as a guest'
);

select * from finish();
rollback;
