begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id, email, aud, role, raw_app_meta_data,
  raw_user_meta_data, email_confirmed_at)
values ('ac000000-0000-4000-8000-000000000001',
  'event-end-member@test.invalid', 'authenticated', 'authenticated',
  '{}', '{}', now());
update public.profiles set access_status = 'active'
where id = 'ac000000-0000-4000-8000-000000000001';

insert into public.events(id, slug, title, format, audience, status,
  starts_at, ends_at, capacity, registration_mode)
values
  ('ac000000-0000-4000-8000-000000000002', 'ended-event-manual-test',
   'Ended Manual Event', 'virtual', 'public', 'published',
   now() - interval '3 days', now() - interval '1 day', 20, 'manual_review'),
  ('ac000000-0000-4000-8000-000000000003', 'ended-event-waitlist-test',
   'Ended Waiting Event', 'virtual', 'public', 'published',
   now() - interval '3 days', now() - interval '1 day', 20, 'waitlist'),
  ('ac000000-0000-4000-8000-000000000004', 'future-event-guard-test',
   'Future Event', 'virtual', 'public', 'published',
   now() + interval '2 days', now() + interval '2 days 2 hours', 20,
   'manual_review');
insert into public.ticket_types(id, event_id, name, price_minor,
  currency, inventory_quantity, status)
values
  ('ac000000-0000-4000-8000-000000000005',
   'ac000000-0000-4000-8000-000000000002', 'Free place', 0, 'KES', 20, 'on_sale'),
  ('ac000000-0000-4000-8000-000000000006',
   'ac000000-0000-4000-8000-000000000004', 'Free place', 0, 'KES', 20, 'on_sale');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub',
  'ac000000-0000-4000-8000-000000000001', true);

select ok(public.event_registration_end_guard_ready(),
  'the audited registration implementation is not directly callable');
select is((
  select pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
  from pg_catalog.pg_proc routine
  join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.proname = 'create_event_registration_core'
), false, 'members cannot bypass the registration end guard');
select throws_ok(
  $$select public.create_event_registration(
    'ac000000-0000-4000-8000-000000000002',
    'ac000000-0000-4000-8000-000000000005', 1, '', '', '')$$,
  'P0001', 'This event is over or no longer open for registration',
  'manual requests cannot be placed after an event ends');
select throws_ok(
  $$select public.create_event_registration(
    'ac000000-0000-4000-8000-000000000003',
    null, 1, '', '', '')$$,
  'P0001', 'This event is over or no longer open for registration',
  'a stale waiting-list link cannot create an entry after the event ends');
select is((
  select count(*) from public.registration_requests
  where event_id in ('ac000000-0000-4000-8000-000000000002',
    'ac000000-0000-4000-8000-000000000003')
), 0::bigint, 'failed ended-event attempts leave no registration behind');
select lives_ok(
  $$select public.create_event_registration(
    'ac000000-0000-4000-8000-000000000004',
    'ac000000-0000-4000-8000-000000000006', 1, '', '', '')$$,
  'a future free/manual event still accepts a place request');

select * from finish();
rollback;
