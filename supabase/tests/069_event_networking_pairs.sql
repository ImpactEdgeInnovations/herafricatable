-- ISOLATED TEST FIXTURE, NOT A MIGRATION. Run only in a transaction; always rollback.
-- No external sends. Tagged fake accounts, a fake venue and event only.
begin;
create function pg_temp.check_networking(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
create function pg_temp.networking_denied(statement text) returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end; $$;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
select ('f0250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'networking-'||n||'@test.invalid','authenticated','authenticated','{}','{}',now()
from generate_series(1,8) n;
update public.profiles set access_status='active',visibility_paused=false,is_test_account=true,
  display_name='Networking Tester '||right(id::text,1) where id::text like 'f0250000-%';
insert into public.user_roles(user_id,role,granted_by) values('f0250000-0000-4000-8000-000000000001','super_admin','f0250000-0000-4000-8000-000000000001');
insert into public.venues(id,name,city,country,address_line) values('f0251000-0000-4000-8000-000000000001','[TEST] Networking venue','Nairobi','Kenya','[TEST] 1 Networking Lane, Nairobi');
insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,venue_id,created_by)
values('f0252000-0000-4000-8000-000000000001','test-networking-rollback','[TEST] Networking rehearsal','in_person','public','published',now()-interval '10 minutes',now()+interval '2 hours','f0251000-0000-4000-8000-000000000001','f0250000-0000-4000-8000-000000000001');
insert into public.event_hosts(event_id,user_id,status,assigned_by) values('f0252000-0000-4000-8000-000000000001','f0250000-0000-4000-8000-000000000002','active','f0250000-0000-4000-8000-000000000001');
insert into public.orders(id,user_id,event_id,status,processing_mode,currency,subtotal_minor,total_minor)
select ('f0253000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f0250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'f0252000-0000-4000-8000-000000000001','approved','manual_review','KES',case when n=4 then 2000 else 0 end,case when n=4 then 2000 else 0 end from generate_series(3,8) n;
insert into public.event_memberships(event_id,user_id,status,order_id)
select 'f0252000-0000-4000-8000-000000000001',('f0250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case when n=7 then 'confirmed' when n=8 then 'cancelled' else 'attended' end,
  ('f0253000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(3,8) n;

set local role authenticated;
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000003',true);
select pg_temp.check_networking(pg_temp.networking_denied($q$select * from hat_networking.sessions$q$),'private tables inaccessible');
select pg_temp.check_networking(pg_temp.networking_denied($q$select public.save_event_networking('f0252000-0000-4000-8000-000000000001',now(),now()+interval '30 minutes',5,60,array['Table 1'],'Hello')$q$),'guest cannot schedule');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000002',true);
select public.save_event_networking('f0252000-0000-4000-8000-000000000001',now()-interval '1 minute',now()+interval '35 minutes',5,60,array['Table 1','Table 2'],'What are you building?');
select pg_temp.check_networking((public.get_event_networking('f0252000-0000-4000-8000-000000000001')->'session'->>'status')='scheduled','Host schedules without per-pair approval');
select public.control_event_networking('f0252000-0000-4000-8000-000000000001','start');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000007',true);
select pg_temp.check_networking(pg_temp.networking_denied($q$select public.join_event_networking('f0252000-0000-4000-8000-000000000001',true,'Building a food business')$q$),'confirmed but not checked in denied');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000008',true);
select pg_temp.check_networking(pg_temp.networking_denied($q$select public.get_event_networking('f0252000-0000-4000-8000-000000000001')$q$),'cancelled guest denied');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000003',true);
select public.join_event_networking('f0252000-0000-4000-8000-000000000001',true,'Building a food business');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000004',true);
select public.join_event_networking('f0252000-0000-4000-8000-000000000001',true,'Building a finance business');
select set_config('test.networking.match',(public.get_event_networking('f0252000-0000-4000-8000-000000000001')->'match'->>'id'),true);
select pg_temp.check_networking(current_setting('test.networking.match')<>'','pair offered automatically');
select pg_temp.check_networking(not(public.get_event_networking('f0252000-0000-4000-8000-000000000001') ? 'people'),'guest cannot see roster');
select pg_temp.check_networking(not(public.get_event_networking('f0252000-0000-4000-8000-000000000001')->'match'->'person' ? 'email'),'no contact details');
select public.answer_event_networking('f0252000-0000-4000-8000-000000000001',current_setting('test.networking.match')::uuid,true);
select pg_temp.check_networking(public.get_event_networking('f0252000-0000-4000-8000-000000000001')->'match'->>'status'='offered','one acceptance is not enough');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000003',true);
select public.answer_event_networking('f0252000-0000-4000-8000-000000000001',current_setting('test.networking.match')::uuid,true);
select pg_temp.check_networking(public.get_event_networking('f0252000-0000-4000-8000-000000000001')->'match'->>'status'='active','mutual acceptance opens conversation');
reset role;
update hat_networking.participants set seen_at=now()-interval '2 minutes' where user_id='f0250000-0000-4000-8000-000000000004' and event_id='f0252000-0000-4000-8000-000000000001';
select hat_networking.tick('f0252000-0000-4000-8000-000000000001');
select pg_temp.check_networking((select status='active' from hat_networking.matches where id=current_setting('test.networking.match')::uuid),'locking phone does not interrupt a mutual in-person conversation');
update hat_networking.participants set seen_at=now() where event_id='f0252000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_networking(pg_temp.networking_denied($q$select public.connect_event_networking('f0252000-0000-4000-8000-000000000001',current_setting('test.networking.match')::uuid,'')$q$),'cannot connect through incomplete round');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000005',true);
select pg_temp.check_networking(pg_temp.networking_denied($q$select public.answer_event_networking('f0252000-0000-4000-8000-000000000001',current_setting('test.networking.match')::uuid,true)$q$),'outsider cannot accept another pair');
select public.join_event_networking('f0252000-0000-4000-8000-000000000001',true,'Building a design business');
select pg_temp.check_networking(not(public.get_event_networking('f0252000-0000-4000-8000-000000000001') ? 'match'),'odd guest waits without duplicate partner');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000002',true);
select public.control_event_networking('f0252000-0000-4000-8000-000000000001','pause');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000003',true);
select pg_temp.check_networking(not(public.get_event_networking('f0252000-0000-4000-8000-000000000001') ? 'match'),'paused session hides introduction');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000002',true);
select public.control_event_networking('f0252000-0000-4000-8000-000000000001','resume');
select pg_temp.check_networking(pg_temp.networking_denied($q$select public.control_event_networking('f0252000-0000-4000-8000-000000000001','disable')$q$),'Host cannot override Admin disable');
reset role;
-- Move the shared schedule forward, not the wall clock. Still inside rollback.
update hat_networking.matches set ends_at=now()-interval '1 second' where event_id='f0252000-0000-4000-8000-000000000001';
update hat_networking.sessions set anchor_at=now()-interval '6 minutes',next_at=now()-interval '1 second' where event_id='f0252000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000005',true);
select public.get_event_networking('f0252000-0000-4000-8000-000000000001');
reset role;
select pg_temp.check_networking((select count(*)=1 from hat_networking.matches where status='completed'),'completed mutual conversation recorded');
select pg_temp.check_networking((select count(*)=2 from hat_networking.matches),'next round creates fresh pair');
select pg_temp.check_networking((select count(*)=0 from hat_networking.matches where round_no=2 and member_a='f0250000-0000-4000-8000-000000000003' and member_b='f0250000-0000-4000-8000-000000000004'),'no repeat pair');
select pg_temp.check_networking((select exists(select 1 from hat_networking.matches where round_no=2 and 'f0250000-0000-4000-8000-000000000005'::uuid in (member_a,member_b))),'waiting guest prioritised');
select pg_temp.check_networking((select count(*)=0 from public.connections where requester_id::text like 'f0250000-%'),'networking creates no automatic connections');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000003',true);
select public.connect_event_networking('f0252000-0000-4000-8000-000000000001',current_setting('test.networking.match')::uuid,'We met during networking and I would like to stay in touch.');
reset role;
select pg_temp.check_networking((select count(*)=1 from public.connections where requester_id='f0250000-0000-4000-8000-000000000003' and status='pending'),'explicit connection request uses existing consent workflow');
-- Blocks close a current offer and never pair those people in a later round.
insert into public.member_blocks(blocker_id,blocked_id,reason)
select member_a,member_b,'[TEST] Blocked pair' from hat_networking.matches where round_no=2;
select hat_networking.tick('f0252000-0000-4000-8000-000000000001');
select pg_temp.check_networking(not exists(select 1 from hat_networking.matches where round_no=2 and status in ('offered','active')),'block invalidates current offer');
delete from public.member_blocks where blocker_id::text like 'f0250000-%';
-- Bring in a fourth checked-in guest for skip/timeout/refresh assertions.
set local role authenticated;
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000006',true);
select public.join_event_networking('f0252000-0000-4000-8000-000000000001',true,'Building a local retail business');
reset role;
update hat_networking.sessions set anchor_at=now()-interval '12 minutes',next_at=now()-interval '1 second' where event_id='f0252000-0000-4000-8000-000000000001';
select hat_networking.tick('f0252000-0000-4000-8000-000000000001');
select pg_temp.check_networking(not exists(select 1 from hat_networking.matches where event_id='f0252000-0000-4000-8000-000000000001' group by member_a,member_b having count(*)>1),'unique event pair history survives rotations');
select set_config('test.networking.second',(select id::text from hat_networking.matches where status='offered' order by round_no desc limit 1),true);
select set_config('test.networking.actor',(select member_a::text from hat_networking.matches where id=current_setting('test.networking.second')::uuid),true);
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.networking.actor'),true);
select pg_temp.check_networking(public.get_event_networking('f0252000-0000-4000-8000-000000000001')->'match'->>'id'=current_setting('test.networking.second'),'refresh preserves same offer and server deadline');
select public.answer_event_networking('f0252000-0000-4000-8000-000000000001',current_setting('test.networking.second')::uuid,false);
reset role;
select pg_temp.check_networking((select status='closed' from hat_networking.matches where id=current_setting('test.networking.second')::uuid),'skip closes introduction');
select pg_temp.check_networking(not exists(select 1 from hat_networking.matches x join hat_networking.matches y on x.event_id=y.event_id and x.member_a=y.member_a and x.member_b=y.member_b and x.id<>y.id),'declined pairs never repeat');
-- Timeout a fresh offer without accepting it. No conversation is recorded.
select pg_temp.check_networking(exists(select 1 from hat_networking.matches where status='offered'),'timeout fixture has a real offered pair');
update hat_networking.matches set accept_by=now()-interval '1 second' where status='offered';
select hat_networking.tick('f0252000-0000-4000-8000-000000000001');
select pg_temp.check_networking(not exists(select 1 from hat_networking.matches where status='offered' and accept_by<now()),'expired offers close without starting');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000003',true);
select public.event_networking_help('f0252000-0000-4000-8000-000000000001','Please help me find the meeting point');
select pg_temp.check_networking(pg_temp.networking_denied($q$select public.event_networking_help('f0252000-0000-4000-8000-000000000001','Another request straight away')$q$),'help request throttled');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000002',true);
select pg_temp.check_networking(jsonb_array_length(public.get_event_networking('f0252000-0000-4000-8000-000000000001')->'help')=1,'help reaches scoped Host panel');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000001',true);
select public.control_event_networking('f0252000-0000-4000-8000-000000000001','disable');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000002',true);
select pg_temp.check_networking(pg_temp.networking_denied($q$select public.control_event_networking('f0252000-0000-4000-8000-000000000001','resume')$q$),'Host cannot resume Admin-disabled session');
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000001',true);
select public.control_event_networking('f0252000-0000-4000-8000-000000000001','enable');
select public.control_event_networking('f0252000-0000-4000-8000-000000000001','resume');
reset role;
-- Revocation invalidates a live pair; both offers and active sessions recheck it.
update public.event_memberships set status='cancelled' where event_id='f0252000-0000-4000-8000-000000000001' and user_id='f0250000-0000-4000-8000-000000000005';
select hat_networking.tick('f0252000-0000-4000-8000-000000000001');
select pg_temp.check_networking(not exists(select 1 from hat_networking.matches where status in ('offered','active') and 'f0250000-0000-4000-8000-000000000005'::uuid in(member_a,member_b)),'revoked guest removed from pairing');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0250000-0000-4000-8000-000000000002',true);
select public.control_event_networking('f0252000-0000-4000-8000-000000000001','finish');
select pg_temp.check_networking(public.get_event_networking('f0252000-0000-4000-8000-000000000001')->'session'->>'status'='finished','Host finishes session');
reset role;
select 'Networking integration assertions passed; every fixture and schema change rolled back' as result;
rollback;
