begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('e0000000-0000-4000-8000-000000000001', 'safety-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('e0000000-0000-4000-8000-000000000002', 'safety-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002');
insert into public.user_roles(user_id, role, granted_by)
values ('e0000000-0000-4000-8000-000000000001', 'super_admin', 'e0000000-0000-4000-8000-000000000001');
insert into public.events(id, slug, title, format, audience, status, starts_at, ends_at, registration_mode, created_by)
values (
  'e1000000-0000-4000-8000-000000000001', 'safety-gate-test',
  'Safety Gate Test', 'virtual', 'public', 'draft',
  now() + interval '10 days', now() + interval '10 days 2 hours',
  'manual_review', 'e0000000-0000-4000-8000-000000000001'
);
insert into public.event_hosts(event_id, user_id, assigned_by)
values (
  'e1000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000002',
  'e0000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$update public.events set status = 'published' where id = 'e1000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Add an event safety contact before publishing',
  'Host-reviewed event cannot publish without a named safety contact'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.save_event_safety_contact('e1000000-0000-4000-8000-000000000001', 'Host Name', '+254700000001')$$,
  'P0001', 'Super Admin required', 'Host cannot set their own safety contact'
);

select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.save_event_safety_contact('e1000000-0000-4000-8000-000000000001', 'Safety Lead', '+254700000002')$$,
  'Super Admin records a reachable safety contact'
);
select is(
  (select contact_name from public.event_safety_contacts where event_id = 'e1000000-0000-4000-8000-000000000001'),
  'Safety Lead', 'private safety contact is saved'
);

set local role postgres;
select lives_ok(
  $$update public.events set status = 'published' where id = 'e1000000-0000-4000-8000-000000000001'$$,
  'publication succeeds after the safety contact is recorded'
);
select is(
  (select status from public.events where id = 'e1000000-0000-4000-8000-000000000001'),
  'published', 'event status reflects the reviewed publication'
);

select * from finish();
rollback;
