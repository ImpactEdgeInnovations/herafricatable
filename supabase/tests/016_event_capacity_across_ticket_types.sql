begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('c0000000-0000-4000-8000-000000000001', 'capacity-one@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('c0000000-0000-4000-8000-000000000002', 'capacity-two@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('c0000000-0000-4000-8000-000000000003', 'capacity-three@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in (
  'c0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000002',
  'c0000000-0000-4000-8000-000000000003'
);
insert into public.events(
  id, slug, title, format, audience, status, starts_at, ends_at,
  capacity, registration_mode, created_by
) values (
  'c1000000-0000-4000-8000-000000000001', 'capacity-shared-test',
  'Capacity Shared Test', 'virtual', 'public', 'published',
  now() + interval '2 days', now() + interval '2 days 2 hours',
  2, 'manual_review', 'c0000000-0000-4000-8000-000000000001'
);
insert into public.ticket_types(id, event_id, name, price_minor, currency, inventory_quantity, status)
values
  ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
   'First ticket type', 0, 'KES', 10, 'on_sale'),
  ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
   'Second ticket type', 0, 'KES', 10, 'on_sale');

select ok(public.event_capacity_guard_ready(),
  'the shared event-capacity database triggers are installed');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.create_event_registration(
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'first attendee reserves one place from the first ticket type'
);
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.create_event_registration(
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000002', 1, '', '', '')$$,
  'second attendee reserves the final place from another ticket type'
);
select is(
  (select sum(item.quantity)::bigint from public.order_items item
   join public.orders booking on booking.id = item.order_id
   where booking.event_id = 'c1000000-0000-4000-8000-000000000001'
     and booking.status = 'pending_review'),
  2::bigint, 'both ticket types share the two-seat event capacity'
);
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.create_event_registration(
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'P0001', 'Event is full',
  'third request is refused even though its ticket type still has inventory'
);
select is(
  (select count(*) from public.orders
   where event_id = 'c1000000-0000-4000-8000-000000000001'),
  2::bigint, 'a refused request leaves no extra order'
);
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.cancel_my_event_place(
    (select order_id from public.registration_requests
     where event_id = 'c1000000-0000-4000-8000-000000000001'
       and user_id = 'c0000000-0000-4000-8000-000000000001'),
    'Cannot attend')$$,
  'cancelling a pending request releases its reserved place'
);
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.create_event_registration(
    'c1000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000001', 1, '', '', '')$$,
  'the third attendee can take the released place'
);
reset role;
select throws_ok(
  $$update public.events set capacity = 1
    where id = 'c1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Capacity is below places already requested',
  'Admin cannot lower capacity below existing reservations'
);
select throws_ok(
  $$update public.orders set status = 'approved'
    where event_id = 'c1000000-0000-4000-8000-000000000001'
      and user_id = 'c0000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Event is full',
  'a cancelled order cannot reactivate after its place has been taken'
);
select is(
  (select count(*) from public.orders
   where event_id = 'c1000000-0000-4000-8000-000000000001'
     and status = 'pending_review'),
  2::bigint, 'two active reservations remain after the rejected reactivation'
);
select * from finish();
rollback;
