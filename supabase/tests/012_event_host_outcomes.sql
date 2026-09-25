begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('a0000000-0000-4000-8000-000000000001', 'outcome-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000002', 'outcome-other@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000003', 'outcome-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000101', 'outcome-guest-1@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000102', 'outcome-guest-2@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000103', 'outcome-guest-3@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000104', 'outcome-guest-4@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000105', 'outcome-guest-5@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000106', 'outcome-guest-6@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('a0000000-0000-4000-8000-000000000107', 'outcome-guest-7@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in ('a0000000-0000-4000-8000-000000000001',
             'a0000000-0000-4000-8000-000000000003');
insert into public.user_roles(user_id, role)
values ('a0000000-0000-4000-8000-000000000003', 'super_admin');

insert into public.events(id, slug, title, format, audience, status, starts_at, ends_at, registration_mode)
values ('b0000000-0000-4000-8000-000000000001', 'host-outcome-test',
        'Host Outcome Test', 'virtual', 'public', 'completed',
        now() - interval '2 days', now() - interval '1 day', 'closed');
insert into public.event_hosts(event_id, user_id, assigned_by)
values ('b0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-000000000003');
insert into public.event_host_workspaces(event_id)
values ('b0000000-0000-4000-8000-000000000001');
insert into public.event_memberships(event_id, user_id, status, confirmed_at)
select 'b0000000-0000-4000-8000-000000000001', id, 'confirmed', now() - interval '2 days'
from auth.users where id in (
  'a0000000-0000-4000-8000-000000000101',
  'a0000000-0000-4000-8000-000000000102',
  'a0000000-0000-4000-8000-000000000103',
  'a0000000-0000-4000-8000-000000000104',
  'a0000000-0000-4000-8000-000000000105',
  'a0000000-0000-4000-8000-000000000106',
  'a0000000-0000-4000-8000-000000000107'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.get_my_event_host_workspace('host-outcome-test')),
  0::bigint, 'an unrelated member cannot open the completed Host workspace');
select throws_ok(
  $$select * from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Event outcomes are unavailable',
  'an unrelated member cannot read even aggregate outcomes');
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.get_my_event_host_workspace('host-outcome-test')),
  1::bigint, 'the current Host can reopen her completed event read-only');
select is(public.can_host_event('b0000000-0000-4000-8000-000000000001'),
  false, 'read-only outcome access does not reopen Host editing');
select is((select report_ready from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  false, 'small events do not reveal outcomes');
select is((select confirmed_places from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  null::bigint, 'a report below the attendance threshold hides even confirmed totals');

set local role postgres;
insert into public.event_checkins(event_id, user_id, method, checked_in_by)
select 'b0000000-0000-4000-8000-000000000001', id, 'manual',
       'a0000000-0000-4000-8000-000000000003'
from auth.users where id in (
  'a0000000-0000-4000-8000-000000000101',
  'a0000000-0000-4000-8000-000000000102',
  'a0000000-0000-4000-8000-000000000103',
  'a0000000-0000-4000-8000-000000000104',
  'a0000000-0000-4000-8000-000000000105'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select is((select report_ready from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  true, 'five real check-ins open aggregate Host outcomes');
select is((select confirmed_places from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  7::bigint, 'confirmed places reconcile to event memberships');
select is((select checked_in from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  5::bigint, 'attendance reconciles to active check-ins');
select is((select feedback_responses from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  null::bigint, 'small feedback cells stay hidden');

set local role postgres;
insert into public.event_feedback(event_id, user_id, overall_rating, relevance_rating,
  connection_rating, would_recommend)
select 'b0000000-0000-4000-8000-000000000001', id, 5, 4, 5, true
from auth.users where id in (
  'a0000000-0000-4000-8000-000000000101',
  'a0000000-0000-4000-8000-000000000102',
  'a0000000-0000-4000-8000-000000000103',
  'a0000000-0000-4000-8000-000000000104',
  'a0000000-0000-4000-8000-000000000105'
);
insert into public.event_follow_up_interests(event_id, user_id, interested)
values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000101', true),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000102', true);
insert into public.event_intro_requests(event_id, user_low, user_high, requested_by, status)
select 'b0000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000101', id,
       'a0000000-0000-4000-8000-000000000101', 'accepted'
from auth.users where id in (
  'a0000000-0000-4000-8000-000000000102',
  'a0000000-0000-4000-8000-000000000103',
  'a0000000-0000-4000-8000-000000000104',
  'a0000000-0000-4000-8000-000000000105',
  'a0000000-0000-4000-8000-000000000106'
);
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select is((select feedback_responses from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  5::bigint, 'feedback count appears once the cell reaches five');
select is((select community_interest from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  null::bigint, 'two Community interests cannot be identified from the Host report');
select is((select accepted_introductions from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  5::bigint, 'accepted introductions reconcile to their source requests');

set local role postgres;
update public.profiles set is_test_account = true
where id = 'a0000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select is((select report_ready from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  false, 'test attendees do not satisfy the privacy threshold');

set local role postgres;
update public.event_hosts set status = 'paused'
where event_id = 'b0000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', true);
select throws_ok(
  $$select * from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')$$,
  'P0001', 'Event outcomes are unavailable',
  'a paused Host loses access to outcomes');
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000003', true);
select is((select report_ready from public.get_event_host_outcomes('b0000000-0000-4000-8000-000000000001')),
  false, 'Super Admin retains oversight but sees the same privacy threshold');

select * from finish();
rollback;
