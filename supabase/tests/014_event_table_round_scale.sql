-- Isolated 21-person table-round rehearsal. Never run in the live SQL Editor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
values
  ('f0000000-0000-4000-8000-000000000101','round-scale-admin@test.invalid','authenticated','authenticated','{}','{}',now()),
  ('f0000000-0000-4000-8000-000000000102','round-scale-host@test.invalid','authenticated','authenticated','{}','{}',now());
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
select ('f0000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'round-scale-' || lpad(n::text,2,'0') || '@test.invalid',
       'authenticated','authenticated','{}'::jsonb,'{}'::jsonb,now()
from generate_series(1,21) n;
update public.profiles set access_status = 'active'
where id = 'f0000000-0000-4000-8000-000000000102'
   or id::text like 'f0000000-0000-4000-8000-0000000000__';
update public.profiles set access_status = 'pending'
where id = 'f0000000-0000-4000-8000-000000000020';
insert into public.user_roles(user_id,role,granted_by)
values ('f0000000-0000-4000-8000-000000000101','super_admin',
        'f0000000-0000-4000-8000-000000000101');
insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,capacity,created_by)
values ('f1000000-0000-4000-8000-000000000001','table-round-scale-test','Table Round Scale Test',
        'virtual','public','published',now()+interval '10 days',now()+interval '10 days 3 hours',
        'manual_review',25,'f0000000-0000-4000-8000-000000000101');
insert into public.event_hosts(event_id,user_id,status,assigned_by)
values ('f1000000-0000-4000-8000-000000000001',
        'f0000000-0000-4000-8000-000000000102','active',
        'f0000000-0000-4000-8000-000000000101');
insert into public.event_memberships(event_id,user_id,status)
select 'f1000000-0000-4000-8000-000000000001',
       ('f0000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'confirmed'
from generate_series(1,21) n;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000101',true);
select public.set_event_round_enabled('f1000000-0000-4000-8000-000000000001',true);
do $$
declare n integer;
begin
  for n in 1..21 loop
    perform set_config('request.jwt.claim.sub',
      ('f0000000-0000-4000-8000-' || lpad(n::text,12,'0')),true);
    perform public.save_my_event_round_interest(
      'f1000000-0000-4000-8000-000000000001',true,
      'I would like thoughtful introductions at this event');
  end loop;
end;
$$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000102',true);
select is((select count(*)::integer from public.list_event_round_volunteers(
  'f1000000-0000-4000-8000-000000000001')),21,
  'Host sees all 21 consenting attendees, including one event-only guest');
select set_config('test.round_id',(select public.save_event_round(
  'f1000000-0000-4000-8000-000000000001',null,'Introductions round',
  'What could we build together after this event?',
  now()+interval '10 days 1 hour',now()+interval '10 days 2 hours'))::text,true);
select set_config('test.table_1',(select public.save_event_round_table(
  current_setting('test.round_id')::uuid,null,'Table A',5))::text,true);
select set_config('test.table_2',(select public.save_event_round_table(
  current_setting('test.round_id')::uuid,null,'Table B',5))::text,true);
select set_config('test.table_3',(select public.save_event_round_table(
  current_setting('test.round_id')::uuid,null,'Table C',5))::text,true);
select set_config('test.table_4',(select public.save_event_round_table(
  current_setting('test.round_id')::uuid,null,'Table D',5))::text,true);
select public.assign_event_round_seat(current_setting('test.round_id')::uuid,
  current_setting('test.table_1')::uuid,'f0000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
select public.block_member('f0000000-0000-4000-8000-000000000001',
  'Please do not place us at the same table');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000102',true);
select throws_ok($$select public.assign_event_round_seat(
  current_setting('test.round_id')::uuid,current_setting('test.table_1')::uuid,
  'f0000000-0000-4000-8000-000000000002')$$,
  'P0001','These guests cannot be seated together',
  'A blocked pair is rejected before the 20-person plan is filled');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
select public.unblock_member('f0000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000102',true);
do $$
declare n integer; table_number integer;
begin
  for n in 2..20 loop
    table_number := ((n - 1) / 5) + 1;
    perform public.assign_event_round_seat(
      current_setting('test.round_id')::uuid,
      current_setting('test.table_' || table_number)::uuid,
      ('f0000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid);
  end loop;
end;
$$;
reset role;
select is((select count(*)::integer from public.event_round_seats
  where round_id = current_setting('test.round_id')::uuid),20,
  'Exactly twenty consenting attendees have one seat each');
select is((select count(*)::integer from (
  select table_id from public.event_round_seats
  where round_id = current_setting('test.round_id')::uuid
  group by table_id having count(*) = 5) filled),4,
  'Four tables each hold five attendees');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000102',true);
select throws_ok($$select public.assign_event_round_seat(
  current_setting('test.round_id')::uuid,current_setting('test.table_1')::uuid,
  'f0000000-0000-4000-8000-000000000021')$$,
  'P0001','This table is full',
  'The twenty-first volunteer cannot overflow a full table');
select lives_ok($$select public.submit_event_round(
  current_setting('test.round_id')::uuid)$$,
  'Host submits four valid private tables for Admin review');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000101',true);
select lives_ok($$select public.review_event_round(
  current_setting('test.round_id')::uuid,'approve','')$$,
  'Super Admin approves all twenty private schedules');
select lives_ok($$do $check$
declare n integer; schedule_count integer; tablemates integer;
begin
  for n in 1..20 loop
    perform set_config('request.jwt.claim.sub',
      'f0000000-0000-4000-8000-' || lpad(n::text,12,'0'),true);
    select count(*)::integer, min(jsonb_array_length(schedule.tablemates))
    into schedule_count, tablemates
    from public.list_my_event_round_schedule(
      'f1000000-0000-4000-8000-000000000001') schedule;
    if schedule_count <> 1 or tablemates <> 4 then
      raise exception 'Private schedule mismatch for attendee %', n;
    end if;
  end loop;
end;
$check$;$$,
  'Every seated attendee sees only one table and four consenting tablemates');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000021',true);
select is((select count(*)::integer from public.list_my_event_round_schedule(
  'f1000000-0000-4000-8000-000000000001')),0,
  'The unseated volunteer receives no private table schedule');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000020',true);
select is((select access_status::text from public.profiles
  where id = 'f0000000-0000-4000-8000-000000000020'),'pending',
  'The seated event-only guest is not converted into a network member');
select lives_ok($$select public.save_my_event_round_interest(
  'f1000000-0000-4000-8000-000000000001',false,'')$$,
  'An event-only guest can withdraw from a published table plan');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000101',true);
select is((public.get_event_round_plan(
  'f1000000-0000-4000-8000-000000000001')->0->>'status'),
  'paused','Withdrawal pauses the entire plan for Admin review');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.list_my_event_round_schedule(
  'f1000000-0000-4000-8000-000000000001')),0,
  'A paused plan disappears from every attendee schedule');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000101',true);
select lives_ok($$select public.assign_event_host(
  'f1000000-0000-4000-8000-000000000001','round-scale-21@test.invalid')$$,
  'Admin can replace the Host while a round needs replanning');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000102',true);
select throws_ok($$select public.get_event_round_plan(
  'f1000000-0000-4000-8000-000000000001')$$,
  'P0001','Event Host or Super Admin required',
  'Former Host immediately loses the private table plan');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000021',true);
select is((public.get_event_round_plan(
  'f1000000-0000-4000-8000-000000000001')->0->>'status'),
  'paused','Replacement Host receives the paused plan without Admin-wide access');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000101',true);
select lives_ok($$select public.review_event_round(
  current_setting('test.round_id')::uuid,'request_changes',
  'Replan the table after the guest withdrew')$$,
  'Admin returns the paused plan for a new Host review');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000021',true);
select lives_ok($$select public.submit_event_round(
  current_setting('test.round_id')::uuid)$$,
  'Replacement Host resubmits the valid four-table plan');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000101',true);
select lives_ok($$select public.review_event_round(
  current_setting('test.round_id')::uuid,'approve','')$$,
  'Admin approves the replacement Host plan only after revalidation');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from public.list_my_event_round_schedule(
  'f1000000-0000-4000-8000-000000000001')),1,
  'Remaining attendees regain their private schedule after the new approval');

select * from finish();
rollback;
