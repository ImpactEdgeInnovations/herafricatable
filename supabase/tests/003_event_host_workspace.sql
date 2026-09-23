begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('b0000000-0000-4000-8000-000000000001', 'host-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('b0000000-0000-4000-8000-000000000002', 'event-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('b0000000-0000-4000-8000-000000000003', 'other-member@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in (
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002',
  'b0000000-0000-4000-8000-000000000003'
);
insert into public.user_roles(user_id, role, granted_by)
values ('b0000000-0000-4000-8000-000000000001', 'super_admin', 'b0000000-0000-4000-8000-000000000001');

insert into public.events(id, slug, title, format, audience, status, starts_at, ends_at, registration_mode, created_by)
values
  ('b1000000-0000-4000-8000-000000000001', 'host-workspace-test', 'Host Workspace Test', 'virtual', 'public', 'draft', now() + interval '10 days', now() + interval '10 days 2 hours', 'manual_review', 'b0000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000002', 'other-host-test', 'Other Host Test', 'virtual', 'public', 'draft', now() + interval '12 days', now() + interval '12 days 2 hours', 'manual_review', 'b0000000-0000-4000-8000-000000000001');
insert into public.event_private_details(event_id, online_url)
values ('b1000000-0000-4000-8000-000000000001', 'https://meet.example.test/private');
insert into public.ticket_types(event_id, name, price_minor, currency, inventory_quantity, status)
values ('b1000000-0000-4000-8000-000000000001', 'Complimentary place', 0, 'KES', 20, 'draft');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.assign_event_host('b1000000-0000-4000-8000-000000000001', 'event-host@test.invalid')$$,
  'P0001', 'Super Admin required', 'an ordinary member cannot assign a Host'
);

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.assign_event_host('b1000000-0000-4000-8000-000000000001', 'event-host@test.invalid')$$,
  'Super Admin assigns an active member without granting event_staff'
);
select is(
  (select count(*) from public.user_roles where user_id = 'b0000000-0000-4000-8000-000000000002' and role = 'event_staff'),
  0::bigint, 'Host assignment does not grant event staff role'
);

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select ok(public.can_host_event('b1000000-0000-4000-8000-000000000001'), 'Host can prepare the assigned event');
select ok(not public.can_host_event('b1000000-0000-4000-8000-000000000002'), 'Host cannot prepare another event');
select ok(not public.can_manage_event('b1000000-0000-4000-8000-000000000001'), 'Host cannot use Admin event permissions');
select is(
  (select count(*) from public.get_my_event_host_workspace('host-workspace-test')),
  1::bigint, 'Host can open the private draft workspace'
);
select throws_ok(
  $$select public.save_event_host_workspace('b1000000-0000-4000-8000-000000000002', 'This gathering introduces founders who are exploring a new opportunity.', 'Please join ten minutes early at the online link in your private confirmation.', '[]'::jsonb, '[]'::jsonb)$$,
  'P0001', 'You are not the active Host for this event', 'Host cannot edit another event'
);
select lives_ok(
  $$select public.save_event_host_workspace(
    'b1000000-0000-4000-8000-000000000001',
    'A considered gathering for women exploring useful business partnerships.',
    'Please join ten minutes early. Your private joining link comes with your confirmation.',
    jsonb_build_array(jsonb_build_object(
      'key', 'b2000000-0000-4000-8000-000000000001',
      'title', 'Welcome and introductions', 'description', 'Meet the table.',
      'starts_at', now() + interval '10 days 15 minutes',
      'ends_at', now() + interval '10 days 45 minutes',
      'speaker_name', 'The Host'
    )), '[]'::jsonb
  )$$,
  'Host saves programme content privately'
);
select is((select status from public.events where id = 'b1000000-0000-4000-8000-000000000001'), 'draft', 'saving never publishes the event');
select lives_ok(
  $$select public.submit_event_host_workspace('b1000000-0000-4000-8000-000000000001')$$,
  'Host sends a complete draft for review'
);
select throws_ok(
  $$select public.review_event_host_workspace('b1000000-0000-4000-8000-000000000001', 'approve', '')$$,
  'P0001', 'Super Admin required', 'Host cannot self-approve publication'
);

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_event_host_workspace('b1000000-0000-4000-8000-000000000001', 'request_changes', 'Please make the arrival guidance more specific.')$$,
  'Admin can ask for changes'
);
select is((select status from public.events where id = 'b1000000-0000-4000-8000-000000000001'), 'draft', 'asking for changes keeps the event private');

select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$select public.save_event_host_workspace(
    'b1000000-0000-4000-8000-000000000001',
    'A considered gathering for women exploring useful business partnerships.',
    'Please join ten minutes early and have your private confirmation link ready.',
    (select programme from public.event_host_workspaces where event_id = 'b1000000-0000-4000-8000-000000000001'),
    '[]'::jsonb
  )$$,
  'Host revises after Admin feedback'
);
select public.submit_event_host_workspace('b1000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.review_event_host_workspace('b1000000-0000-4000-8000-000000000001', 'approve', 'Ready to welcome guests.')$$,
  'Admin approves the prepared event'
);
select is((select status from public.events where id = 'b1000000-0000-4000-8000-000000000001'), 'published', 'only Admin approval publishes the event');

select * from finish();
rollback;
