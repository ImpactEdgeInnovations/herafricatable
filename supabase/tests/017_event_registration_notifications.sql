begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('f0000000-0000-4000-8000-000000000001', 'notice-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('f0000000-0000-4000-8000-000000000002', 'notice-member-one@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('f0000000-0000-4000-8000-000000000003', 'notice-member-two@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in (
  'f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-000000000003'
);
insert into public.user_roles(user_id, role, granted_by)
values ('f0000000-0000-4000-8000-000000000001', 'super_admin',
        'f0000000-0000-4000-8000-000000000001');
insert into public.events(
  id, slug, title, format, audience, status, starts_at, ends_at,
  capacity, registration_mode, created_by
) values (
  'f1000000-0000-4000-8000-000000000001', 'event-notification-test',
  'Event Notification Test', 'virtual', 'public', 'published',
  now() + interval '2 days', now() + interval '2 days 2 hours',
  5, 'manual_review', 'f0000000-0000-4000-8000-000000000001'
);
insert into public.ticket_types(id, event_id, name, price_minor, currency, inventory_quantity, status)
values ('f2000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000001',
        'Free place', 0, 'KES', 5, 'on_sale');

select ok(public.event_registration_notification_ready(),
  'the registration-review notification trigger is installed');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_event_registration(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001', 1,
    'Private attendee note', '', '')$$,
  'a member can request a manually reviewed free place'
);
reset role;
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000001'
    and dedupe_key like 'event-registration-review:%'),
  1::bigint, 'Super Admin receives one queued review email');
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000001'
    and dedupe_key like 'event-registration-review:%'
    and payload::text ilike '%Private attendee note%'),
  0::bigint, 'the Admin email does not expose the private attendee note');
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000002'
    and dedupe_key like 'order-status:%:pending_review'
    and payload->>'title' = 'We have your event request'),
  1::bigint, 'the attendee receives a plain-language pending decision email');

update public.registration_requests set updated_at = now()
where event_id = 'f1000000-0000-4000-8000-000000000001'
  and user_id = 'f0000000-0000-4000-8000-000000000002';
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000001'
    and dedupe_key like 'event-registration-review:%'),
  1::bigint, 'an unchanged request does not alert Admin again');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_manual_registration(
    (select id from public.orders
     where event_id = 'f1000000-0000-4000-8000-000000000001'
       and user_id = 'f0000000-0000-4000-8000-000000000002'),
    'approve', 'Free place confirmed')$$,
  'Super Admin approves the request'
);
reset role;
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000002'
    and dedupe_key like 'order-status:%:fulfilled'
    and payload->>'title' = 'Your event place is confirmed'),
  1::bigint, 'the attendee receives one confirmed-pass email');
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000002'
    and dedupe_key like 'order-status:%:approved'),
  0::bigint, 'the intermediate approved order state sends no extra email');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.create_event_registration(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'a second member can request a place'
);
reset role;
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000001'
    and dedupe_key like 'event-registration-review:%'),
  2::bigint, 'each distinct manual request alerts Super Admin once');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_manual_registration(
    (select id from public.orders
     where event_id = 'f1000000-0000-4000-8000-000000000001'
       and user_id = 'f0000000-0000-4000-8000-000000000003'),
    'reject', 'Not suitable for this gathering')$$,
  'Super Admin can decline the second request'
);
reset role;
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000003'
    and dedupe_key like 'event-registration-declined:%'
    and payload->>'title' = 'Your event request was declined'),
  1::bigint, 'the declined attendee receives one clear decision email');
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000003'
    and dedupe_key like 'order-status:%:cancelled'),
  0::bigint, 'the declined attendee does not also receive a vague cancellation email');
select is((select count(*) from public.event_memberships
  where event_id = 'f1000000-0000-4000-8000-000000000001'
    and user_id = 'f0000000-0000-4000-8000-000000000003'),
  0::bigint, 'a declined request creates no event pass');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.cancel_my_event_place(
    (select id from public.orders
     where event_id = 'f1000000-0000-4000-8000-000000000001'
       and user_id = 'f0000000-0000-4000-8000-000000000002'),
    'Plans changed')$$,
  'a confirmed attendee can release a free place before the event'
);
select lives_ok(
  $$select public.create_event_registration(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'the attendee can request a fresh place after cancelling'
);
reset role;
select is((select count(*) from public.notification_jobs
  where user_id = 'f0000000-0000-4000-8000-000000000001'
    and dedupe_key like 'event-registration-review:%'),
  3::bigint, 'a fresh order generates a new Admin review alert');

select * from finish();
rollback;
