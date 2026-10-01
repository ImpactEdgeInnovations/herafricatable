begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('f0000000-0000-4000-8000-000000000001', 'event-sequence-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('f0000000-0000-4000-8000-000000000002', 'event-sequence-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in ('f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002');
insert into public.user_roles(user_id, role, granted_by)
values ('f0000000-0000-4000-8000-000000000001', 'super_admin', 'f0000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select public.save_event(null, 'Sequence Test', 'sequence-test-public',
    'A considered gathering for useful introductions and local relationships.',
    'in_person', 'published', now() + interval '10 days', now() + interval '10 days 2 hours',
    'Africa/Nairobi', 'The Table', 'Nairobi', 'Kenya', '', '', '', 20, 'manual_review', false)$$,
  'P0001', 'Save a private event draft before publishing',
  'Admin cannot publish a public event at creation'
);
select lives_ok(
  $$select public.save_event(null, 'Sequence Test', 'sequence-test-public',
    'A considered gathering for useful introductions and local relationships.',
    'in_person', 'draft', now() + interval '10 days', now() + interval '10 days 2 hours',
    'Africa/Nairobi', 'The Table', 'Nairobi', 'Kenya', '', '', '', 20, 'manual_review', false)$$,
  'Admin can save the private event first'
);
select is((select status from public.events where slug = 'sequence-test-public'),
  'draft', 'first save stays private');

select throws_ok(
  $$select public.save_event((select id from public.events where slug = 'sequence-test-public'),
    'Sequence Test', 'sequence-test-public',
    'A considered gathering for useful introductions and local relationships.',
    'in_person', 'published', now() + interval '10 days', now() + interval '10 days 2 hours',
    'Africa/Nairobi', 'The Table', 'Nairobi', 'Kenya', '', '', '', 20, 'manual_review', false)$$,
  'P0001', 'Add an event safety contact before publishing',
  'public event cannot publish without a private safety contact'
);
select lives_ok(
  $$select public.save_event_safety_contact(
    (select id from public.events where slug = 'sequence-test-public'),
    'Safety Lead', '+254700000002')$$,
  'Admin records the safety contact'
);
select throws_ok(
  $$select public.save_event((select id from public.events where slug = 'sequence-test-public'),
    'Sequence Test', 'sequence-test-public',
    'A considered gathering for useful introductions and local relationships.',
    'in_person', 'published', now() + interval '10 days', now() + interval '10 days 2 hours',
    'Africa/Nairobi', 'The Table', 'Nairobi', 'Kenya', '', '', '', 20, 'manual_review', false)$$,
  'P0001', 'Add the exact venue address or map link before publishing',
  'public in-person event cannot publish with only a venue brand and city'
);
select lives_ok(
  $$select public.save_event((select id from public.events where slug = 'sequence-test-public'),
    'Sequence Test', 'sequence-test-public',
    'A considered gathering for useful introductions and local relationships.',
    'in_person', 'published', now() + interval '10 days', now() + interval '10 days 2 hours',
    'Africa/Nairobi', 'The Table', 'Nairobi', 'Kenya', 'Example Road, Nairobi', '', '', 20, 'manual_review', false)$$,
  'unhosted event may publish only after its safety contact exists'
);
select is((select status from public.events where slug = 'sequence-test-public'),
  'published', 'approved public event is now visible');
select lives_ok(
  $$select public.save_event((select id from public.events where slug = 'sequence-test-public'),
    'Sequence Test Updated', 'sequence-test-public',
    'A considered gathering for useful introductions and local relationships.',
    'in_person', 'published', now() + interval '10 days', now() + interval '10 days 2 hours',
    'Africa/Nairobi', 'The Table', 'Nairobi', 'Kenya', 'Example Road, Nairobi', '', '', 20, 'manual_review', false)$$,
  'existing published event can still be edited'
);

select lives_ok(
  $$select public.save_event(null, 'Hosted Sequence Test', 'hosted-sequence-test',
    'A private Host draft for a carefully reviewed Nairobi gathering.',
    'in_person', 'draft', now() + interval '12 days', now() + interval '12 days 2 hours',
    'Africa/Nairobi', 'The Table', 'Nairobi', 'Kenya', '', '', '', 20, 'manual_review', false)$$,
  'Host event starts as a private draft'
);
select public.save_event_safety_contact(
  (select id from public.events where slug = 'hosted-sequence-test'),
  'Safety Lead', '+254700000002');
set local role postgres;
insert into public.event_hosts(event_id, user_id, assigned_by)
values ((select id from public.events where slug = 'hosted-sequence-test'),
  'f0000000-0000-4000-8000-000000000002',
  'f0000000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$select public.save_event((select id from public.events where slug = 'hosted-sequence-test'),
    'Hosted Sequence Test', 'hosted-sequence-test',
    'A private Host draft for a carefully reviewed Nairobi gathering.',
    'in_person', 'published', now() + interval '12 days', now() + interval '12 days 2 hours',
    'Africa/Nairobi', 'The Table', 'Nairobi', 'Kenya', '', '', '', 20, 'manual_review', false)$$,
  'P0001', 'Approve the Event Host draft to publish this event',
  'Admin cannot skip the Host review by saving the event directly'
);
select is(
  (select pg_catalog.has_function_privilege('authenticated', routine.oid, 'EXECUTE')
   from pg_catalog.pg_proc routine
   join pg_catalog.pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public' and routine.proname = 'save_event_core'),
  false,
  'authenticated callers have no permission to invoke the internal save function'
);
select ok(public.event_publication_sequence_ready(),
  'the read-only live audit can detect this installed publication guard');

select * from finish();
rollback;
