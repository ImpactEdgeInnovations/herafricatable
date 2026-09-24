-- Isolated pgTAP only. Never paste this fixture into the live SQL Editor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
values
  ('e0000000-0000-4000-8000-000000000031','round-admin@test.invalid','authenticated','authenticated','{}','{}',now()),
  ('e0000000-0000-4000-8000-000000000032','round-host@test.invalid','authenticated','authenticated','{}','{}',now()),
  ('e0000000-0000-4000-8000-000000000033','round-member@test.invalid','authenticated','authenticated','{}','{}',now()),
  ('e0000000-0000-4000-8000-000000000034','round-guest@test.invalid','authenticated','authenticated','{}','{}',now()),
  ('e0000000-0000-4000-8000-000000000035','round-outsider@test.invalid','authenticated','authenticated','{}','{}',now());
update public.profiles set access_status = 'active', display_name = 'Round Host'
where id = 'e0000000-0000-4000-8000-000000000032';
update public.profiles set access_status = 'active', display_name = 'Round Member'
where id = 'e0000000-0000-4000-8000-000000000033';
update public.profiles set access_status = 'pending', display_name = 'Round Guest'
where id = 'e0000000-0000-4000-8000-000000000034';
insert into public.user_roles(user_id,role,granted_by)
values ('e0000000-0000-4000-8000-000000000031','super_admin',
        'e0000000-0000-4000-8000-000000000031');
insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,created_by)
values ('e1000000-0000-4000-8000-000000000031','table-round-test','Table Round Test',
        'virtual','public','published',now()+interval '10 days',now()+interval '10 days 3 hours',
        'manual_review','e0000000-0000-4000-8000-000000000031');
insert into public.event_hosts(event_id,user_id,status,assigned_by)
values ('e1000000-0000-4000-8000-000000000031',
        'e0000000-0000-4000-8000-000000000032','active',
        'e0000000-0000-4000-8000-000000000031');
insert into public.event_memberships(event_id,user_id,status)
values
  ('e1000000-0000-4000-8000-000000000031','e0000000-0000-4000-8000-000000000033','confirmed'),
  ('e1000000-0000-4000-8000-000000000031','e0000000-0000-4000-8000-000000000034','confirmed');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000034',true);
select is((select enabled from public.get_my_event_round_status(
  'e1000000-0000-4000-8000-000000000031')),false,
  'Table rounds are closed by default even for a confirmed event-only guest');
select throws_ok($$select public.save_my_event_round_interest(
  'e1000000-0000-4000-8000-000000000031',true,
  'I want to discuss regional trade and entrepreneurship')$$,
  'P0001','Table rounds are not open to you','A guest cannot opt in before opening');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000032',true);
select throws_ok($$select public.set_event_round_enabled(
  'e1000000-0000-4000-8000-000000000031',true)$$,
  'P0001','Super Admin required','The Host cannot open the feature');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000031',true);
select lives_ok($$select public.set_event_round_enabled(
  'e1000000-0000-4000-8000-000000000031',true)$$,
  'Super Admin deliberately opens table round opt-in');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000034',true);
select lives_ok($$select public.save_my_event_round_interest(
  'e1000000-0000-4000-8000-000000000031',true,
  'I want to discuss regional trade and entrepreneurship')$$,
  'A confirmed event-only guest can opt in without joining the member network');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000033',true);
select lives_ok($$select public.save_my_event_round_interest(
  'e1000000-0000-4000-8000-000000000031',true,
  'I am looking for thoughtful founder introductions')$$,
  'A confirmed member may opt in separately');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000032',true);
select is((select count(*)::integer from public.list_event_round_volunteers(
  'e1000000-0000-4000-8000-000000000031')),2,
  'The Host sees only the two opted-in guests');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000035',true);
select throws_ok($$select * from public.list_event_round_volunteers(
  'e1000000-0000-4000-8000-000000000031')$$,
  'P0001','Event Host or Super Admin required','An unrelated user cannot see the list');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000032',true);
select set_config('test.round_id',(select public.save_event_round(
  'e1000000-0000-4000-8000-000000000031',null,'Founders table',
  'What would you like to build with someone at this event?',
  now()+interval '10 days 1 hour',now()+interval '10 days 2 hours'))::text,true);
select set_config('test.table_id',(select public.save_event_round_table(
  current_setting('test.round_id')::uuid,null,'Table A',4))::text,true);
select throws_ok($$select public.assign_event_round_seat(
  current_setting('test.round_id')::uuid,current_setting('test.table_id')::uuid,
  'e0000000-0000-4000-8000-000000000035')$$,
  'P0001','Only confirmed guests who opted in can be seated',
  'An outsider cannot be assigned a table place');
select lives_ok($$select public.assign_event_round_seat(
  current_setting('test.round_id')::uuid,current_setting('test.table_id')::uuid,
  'e0000000-0000-4000-8000-000000000034')$$,
  'The Host assigns the opted-in event guest');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000033',true);
select lives_ok($$select public.block_member(
  'e0000000-0000-4000-8000-000000000034','Not for shared table')$$,
  'A member can block another attendee');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000032',true);
select throws_ok($$select public.assign_event_round_seat(
  current_setting('test.round_id')::uuid,current_setting('test.table_id')::uuid,
  'e0000000-0000-4000-8000-000000000033')$$,
  'P0001','These guests cannot be seated together',
  'A blocked pair cannot share a table');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000033',true);
select public.unblock_member('e0000000-0000-4000-8000-000000000034');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000032',true);
select lives_ok($$select public.assign_event_round_seat(
  current_setting('test.round_id')::uuid,current_setting('test.table_id')::uuid,
  'e0000000-0000-4000-8000-000000000033')$$,
  'The Host fills the table after the block is removed');
select lives_ok($$select public.submit_event_round(current_setting('test.round_id')::uuid)$$,
  'The Host sends a valid private plan to Admin');
select throws_ok($$select public.review_event_round(
  current_setting('test.round_id')::uuid,'approve','')$$,
  'P0001','Super Admin required','The Host cannot approve her own plan');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000031',true);
select lives_ok($$select public.review_event_round(
  current_setting('test.round_id')::uuid,'approve','')$$,
  'Super Admin approves and sends private schedules');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000034',true);
select is((select count(*)::integer from public.list_my_event_round_schedule(
  'e1000000-0000-4000-8000-000000000031')),1,
  'The guest sees only her approved table round');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000033',true);
select lives_ok($$select public.block_member(
  'e0000000-0000-4000-8000-000000000034','Safety block after schedule approval')$$,
  'A safety block can be recorded after a plan is approved');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000031',true);
select is((public.get_event_round_plan(
  'e1000000-0000-4000-8000-000000000031')->0->>'status'),
  'paused','The approved round is paused automatically after the block');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000034',true);
select is((select count(*)::integer from public.list_my_event_round_schedule(
  'e1000000-0000-4000-8000-000000000031')),0,
  'Guests stop seeing the paused schedule immediately');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000033',true);
select public.unblock_member('e0000000-0000-4000-8000-000000000034');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000031',true);
select lives_ok($$select public.review_event_round(
  current_setting('test.round_id')::uuid,'restore','')$$,
  'Admin can restore only after eligibility and blocked pairs pass again');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000034',true);
select lives_ok($$select public.save_my_event_round_interest(
  'e1000000-0000-4000-8000-000000000031',false,'')$$,
  'The guest can leave and immediately lose her table place');
select is((select count(*)::integer from public.list_my_event_round_schedule(
  'e1000000-0000-4000-8000-000000000031')),0,
  'Opting out removes the guest schedule immediately');
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000031',true);
select is((public.get_event_round_plan(
  'e1000000-0000-4000-8000-000000000031')->0->>'status'),
  'paused','Leaving an approved table pauses the plan for Admin replanning');

select * from finish();
rollback;
