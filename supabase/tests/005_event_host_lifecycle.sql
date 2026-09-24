begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('d0000000-0000-4000-8000-000000000001', 'lifecycle-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('d0000000-0000-4000-8000-000000000002', 'first-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('d0000000-0000-4000-8000-000000000003', 'second-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in (
  'd0000000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000002',
  'd0000000-0000-4000-8000-000000000003'
);
insert into public.user_roles(user_id, role, granted_by)
values ('d0000000-0000-4000-8000-000000000001', 'super_admin', 'd0000000-0000-4000-8000-000000000001');
insert into public.events(id, slug, title, format, audience, status, starts_at, ends_at, registration_mode, created_by)
values (
  'd1000000-0000-4000-8000-000000000001', 'host-lifecycle-test',
  'Host Lifecycle Test', 'virtual', 'public', 'draft',
  now() + interval '10 days', now() + interval '10 days 2 hours',
  'manual_review', 'd0000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.assign_event_host('d1000000-0000-4000-8000-000000000001', 'first-host@test.invalid')$$,
  'Admin assigns an initial Host'
);
set local role postgres;
update public.event_host_workspaces
set status = 'submitted', summary = 'This is the first Host draft.', submitted_at = now()
where event_id = 'd1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.assign_event_host('d1000000-0000-4000-8000-000000000001', 'second-host@test.invalid')$$,
  'Admin replaces the unavailable Host'
);
select is(
  (select status from public.event_host_workspaces where event_id = 'd1000000-0000-4000-8000-000000000001'),
  'draft', 'transfer requires the new Host to submit the inherited draft again'
);
select is(
  (select summary from public.event_host_workspaces where event_id = 'd1000000-0000-4000-8000-000000000001'),
  'This is the first Host draft.', 'transfer preserves the working content'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', true);
select ok(not public.can_host_event('d1000000-0000-4000-8000-000000000001'), 'former Host loses access');
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select ok(public.can_host_event('d1000000-0000-4000-8000-000000000001'), 'replacement Host has scoped access');

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.set_event_host_status('d1000000-0000-4000-8000-000000000001', 'paused', 'The Host is unavailable for the event.')$$,
  'Admin pauses Host access with a reason'
);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select ok(not public.can_host_event('d1000000-0000-4000-8000-000000000001'), 'paused Host cannot use the workspace');
select is(
  (select status from public.events where id = 'd1000000-0000-4000-8000-000000000001'),
  'draft', 'pausing a Host does not publish or cancel the event'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.set_event_host_status('d1000000-0000-4000-8000-000000000001', 'active', '')$$,
  'Admin restores Host access'
);
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000003', true);
select ok(public.can_host_event('d1000000-0000-4000-8000-000000000001'), 'restored Host may use the workspace');

select * from finish();
rollback;
