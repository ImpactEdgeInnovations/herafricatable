begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('b0000000-0000-4000-8000-000000000001', 'waitlist-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('b0000000-0000-4000-8000-000000000002', 'waitlist-one@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('b0000000-0000-4000-8000-000000000003', 'waitlist-two@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in (
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000003'
);
insert into public.user_roles(user_id, role, granted_by)
values ('b0000000-0000-4000-8000-000000000001', 'super_admin',
        'b0000000-0000-4000-8000-000000000001');
insert into public.events(
  id, slug, title, format, audience, status, starts_at, ends_at,
  capacity, registration_mode, created_by
) values (
  'b1000000-0000-4000-8000-000000000001', 'event-waitlist-test',
  'Event Waitlist Test', 'virtual', 'public', 'published',
  now() + interval '2 days', now() + interval '2 days 2 hours',
  2, 'waitlist', 'b0000000-0000-4000-8000-000000000001'
);
insert into public.ticket_types(id, event_id, name, price_minor, currency, inventory_quantity, status)
values ('b2000000-0000-4000-8000-000000000001',
        'b1000000-0000-4000-8000-000000000001',
        'Free place', 0, 'KES', 2, 'on_sale');

select ok(public.event_waitlist_ready(), 'waitlist operations are installed');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_event_registration(
    'b1000000-0000-4000-8000-000000000001', null, 1,
    'I would love to attend', '', '')$$,
  'member joins the waiting list without receiving a place'
);
reset role;
select is((select count(*) from public.orders
  where event_id = 'b1000000-0000-4000-8000-000000000001'),
  0::bigint, 'waiting alone creates no chargeable order or reservation');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.list_event_waitlist(
  'b1000000-0000-4000-8000-000000000001')),
  1::bigint, 'Super Admin can see the private waiting list');
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select * from public.list_event_waitlist(
    'b1000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Not authorized', 'another member cannot read the waiting list'
);
select lives_ok(
  $$select public.create_event_registration(
    'b1000000-0000-4000-8000-000000000001', null, 1, '', '', '')$$,
  'a second member joins the waiting list'
);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.notify_waitlisted_event_guest(
    (select id from public.registration_requests
     where event_id = 'b1000000-0000-4000-8000-000000000001'
       and user_id = 'b0000000-0000-4000-8000-000000000002'))$$,
  'P0001', 'Reopen manual registration before emailing the waitlist',
  'Admin cannot promise an opening while bookings remain waitlist-only'
);
reset role;

update public.events set registration_mode = 'manual_review'
where id = 'b1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.notify_waitlisted_event_guest(
    (select id from public.registration_requests
     where event_id = 'b1000000-0000-4000-8000-000000000001'
       and user_id = 'b0000000-0000-4000-8000-000000000002'))$$,
  'Admin can email a waiting member when manual bookings reopen'
);
reset role;
select is((select count(*) from public.notification_jobs
  where user_id = 'b0000000-0000-4000-8000-000000000002'
    and dedupe_key like 'event-waitlist-open:%' and status = 'queued'),
  1::bigint, 'the existing email engine has one opening notice queued');
select is((select count(*) from public.notification_jobs
  where user_id = 'b0000000-0000-4000-8000-000000000002'
    and dedupe_key like 'event-waitlist-open:%'
    and payload->>'body' like '%No seat is held%'),
  1::bigint, 'the opening notice does not promise a reserved place');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select public.notify_waitlisted_event_guest(
    (select id from public.registration_requests
     where event_id = 'b1000000-0000-4000-8000-000000000001'
       and user_id = 'b0000000-0000-4000-8000-000000000002'))$$,
  'P0001', 'This opening notice was already sent',
  'Admin cannot queue the same opening notice twice'
);
select lives_ok(
  $$select public.notify_waitlisted_event_guest(
    (select id from public.registration_requests
     where event_id = 'b1000000-0000-4000-8000-000000000001'
       and user_id = 'b0000000-0000-4000-8000-000000000003'))$$,
  'Admin can separately email the next waiting member'
);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.leave_event_waitlist(
    'b1000000-0000-4000-8000-000000000001')$$,
  'the second member can leave the waiting list herself'
);
reset role;
select is((select count(*) from public.notification_jobs
  where user_id = 'b0000000-0000-4000-8000-000000000003'
    and dedupe_key like 'event-waitlist-open:%' and status = 'suppressed'),
  1::bigint, 'withdrawal suppresses the unsent opening email');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.request_event_place_from_waitlist(
    'b1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001', '', '', '')$$,
  'the waiting member must request an available place herself'
);
reset role;
select is((select status from public.registration_requests
  where event_id = 'b1000000-0000-4000-8000-000000000001'
    and user_id = 'b0000000-0000-4000-8000-000000000002'),
  'pending_review', 'the claim becomes a manually reviewed request');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.list_event_waitlist(
  'b1000000-0000-4000-8000-000000000001')),
  0::bigint, 'the waiting list no longer includes a requester or a withdrawal');
reset role;
select is((select count(*) from public.orders
  where event_id = 'b1000000-0000-4000-8000-000000000001'
    and user_id = 'b0000000-0000-4000-8000-000000000002'
    and status = 'pending_review'),
  1::bigint, 'the request reserves one place under the existing capacity guard');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.request_event_place_from_waitlist(
    'b1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001', '', '', '')$$,
  'P0001', 'You are not on this event waitlist',
  'a requester cannot claim the waiting list twice'
);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.request_event_place_from_waitlist(
    'b1000000-0000-4000-8000-000000000001',
    'b2000000-0000-4000-8000-000000000001', '', '', '')$$,
  'P0001', 'You are not on this event waitlist',
  'a member who withdrew cannot claim a waiting-list place'
);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_manual_registration(
    (select id from public.orders
     where event_id = 'b1000000-0000-4000-8000-000000000001'
       and user_id = 'b0000000-0000-4000-8000-000000000002'),
    'approve', 'Free place confirmed')$$,
  'Admin approves the requested place'
);
reset role;
select is((select count(*) from public.event_memberships
  where event_id = 'b1000000-0000-4000-8000-000000000001'
    and user_id = 'b0000000-0000-4000-8000-000000000002'
    and status = 'confirmed'),
  1::bigint, 'only approval creates a usable event pass');

select * from finish();
rollback;
