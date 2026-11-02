-- TEST ONLY: fake tagged accounts; all data and queued notifications roll back.
begin;
create function pg_temp.follow_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label; end if;end;$$;
create function pg_temp.follow_denied(statement text) returns boolean language plpgsql as $$begin execute statement;return false;exception when others then return true;end;$$;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
select ('f1025000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'follow-'||n||'@test.invalid','authenticated','authenticated','{}','{}',now() from generate_series(1,8)n;
update public.profiles set access_status='active',visibility_paused=false,is_test_account=true,display_name='Amina Tester '||right(id::text,1) where id::text like 'f1025000-%';
insert into public.user_roles(user_id,role,granted_by) values('f1025000-0000-4000-8000-000000000001','super_admin','f1025000-0000-4000-8000-000000000001');
insert into public.venues(id,name,city,country,address_line) values('f1025100-0000-4000-8000-000000000001','[TEST] Follow-through room','Nairobi','Kenya','[TEST] No physical event');
insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,venue_id,created_by)
select ('f1025200-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'test-follow-'||n,'[TEST] Follow-through '||n,'in_person','public','published',now()-interval '30 minutes',now()+interval '1 hour','f1025100-0000-4000-8000-000000000001','f1025000-0000-4000-8000-000000000001' from generate_series(1,2)n;
insert into public.event_hosts(event_id,user_id,status,assigned_by) values('f1025200-0000-4000-8000-000000000001','f1025000-0000-4000-8000-000000000001','active','f1025000-0000-4000-8000-000000000001');
insert into public.orders(id,user_id,event_id,status,processing_mode,currency,subtotal_minor,total_minor)
select ('f1025300-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f1025000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f1025200-0000-4000-8000-000000000001','approved','manual_review','KES',0,0 from generate_series(2,6)n;
insert into public.event_memberships(event_id,user_id,status,order_id)
select 'f1025200-0000-4000-8000-000000000001',('f1025000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'attended',('f1025300-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(2,6)n;
insert into hat_networking.sessions(event_id,starts_at,ends_at,minutes,changeover,points,status,updated_by) values('f1025200-0000-4000-8000-000000000001',now()-interval '20 minutes',now()+interval '30 minutes',5,60,array['Table 1'],'paused','f1025000-0000-4000-8000-000000000001');
insert into hat_networking.matches(id,event_id,member_a,member_b,status,accepted_a,accepted_b,round_no,point,accept_by,ends_at,ended_at)
values('f1025400-0000-4000-8000-000000000001','f1025200-0000-4000-8000-000000000001','f1025000-0000-4000-8000-000000000002','f1025000-0000-4000-8000-000000000003','completed',true,true,1,'Table 1',now()-interval '15 minutes',now()-interval '10 minutes',now()-interval '10 minutes'),
('f1025400-0000-4000-8000-000000000002','f1025200-0000-4000-8000-000000000001','f1025000-0000-4000-8000-000000000002','f1025000-0000-4000-8000-000000000004','active',true,true,2,'Table 2',now()-interval '1 minute',now()+interval '3 minutes',null),
('f1025400-0000-4000-8000-000000000003','f1025200-0000-4000-8000-000000000001','f1025000-0000-4000-8000-000000000002','f1025000-0000-4000-8000-000000000005','closed',true,false,3,'Table 3',now(),now()+interval '3 minutes',now()),
('f1025400-0000-4000-8000-000000000004','f1025200-0000-4000-8000-000000000001','f1025000-0000-4000-8000-000000000002','f1025000-0000-4000-8000-000000000006','active',true,true,4,'Table 4',now()-interval '1 minute',now()+interval '3 minutes',null);
update hat_networking.matches set status='closed' where id='f1025400-0000-4000-8000-000000000002';
select pg_temp.follow_assert((select ended_at=now() from hat_networking.matches where id='f1025400-0000-4000-8000-000000000002'),'early end timestamp recorded');
select set_config('test.follow.notifications',(select count(*)::text from public.notifications),true);
set local role authenticated;
select set_config('request.jwt.claim.sub','f1025000-0000-4000-8000-000000000002',true);
select pg_temp.follow_assert(jsonb_array_length(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001'))=2,'only completed/early-ended mutual conversations');
select pg_temp.follow_assert(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0->>'match_id'='f1025400-0000-4000-8000-000000000002','latest conversation first');
select pg_temp.follow_assert(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0->>'name'='Amina','first name only');
select pg_temp.follow_assert(not(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0 ? 'email'),'no contact details returned');
select pg_temp.follow_assert(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0->>'connection_state'='available','ordinary connection opportunity');
select public.defer_networking_connection('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000002');
select public.defer_networking_connection('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000002');
select pg_temp.follow_assert(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0->>'deferred'='true','private deferral persists');
select pg_temp.follow_assert(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0->>'connection_state'='available','maybe later remains connectable');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.defer_networking_connection('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000003')$q$),'skipped offer cannot be deferred as conversation');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.connect_event_networking('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000003','')$q$),'one acceptance cannot create connection');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.connect_event_networking('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000004','')$q$),'active conversation has no post-conversation request');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.defer_networking_connection('f1025200-0000-4000-8000-000000000002','f1025400-0000-4000-8000-000000000002')$q$),'cross-event dismissal denied');
select set_config('request.jwt.claim.sub','f1025000-0000-4000-8000-000000000004',true);
select pg_temp.follow_assert(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0->>'deferred'='false','partner never sees private deferral');
reset role;
select pg_temp.follow_assert((select count(*)=current_setting('test.follow.notifications')::integer from public.notifications),'no notification from reading or deferring');
select pg_temp.follow_assert((select count(*)=0 from public.connections where requester_id::text like 'f1025000-%'),'no automatic connection');
select pg_temp.follow_assert((select count(*)=1 from hat_networking.followthrough_choices where user_id='f1025000-0000-4000-8000-000000000002'),'duplicate defer creates one row');
set local role authenticated;
select set_config('request.jwt.claim.sub','f1025000-0000-4000-8000-000000000002',true);
select set_config('test.follow.connection',public.connect_event_networking('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000002','I enjoyed our conversation and would love to stay connected.')::text,true);
select pg_temp.follow_assert(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0->>'connection_state'='outgoing','confirmed action creates pending request');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.connect_event_networking('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000002','')$q$),'duplicate request blocked');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.ensure_conversation(current_setting('test.follow.connection')::uuid)$q$),'private messages stay closed before acceptance');
select pg_temp.follow_assert(public.get_my_networking_updates()->'recent'->0->>'people_met'='2','home reminder includes early-ended mutual conversation');
select set_config('request.jwt.claim.sub','f1025000-0000-4000-8000-000000000004',true);
select pg_temp.follow_assert(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')->0->>'connection_state'='incoming','recipient sees request');
select pg_temp.follow_assert((select introduction_note='I enjoyed our conversation and would love to stay connected.' from public.connections where id=current_setting('test.follow.connection')::uuid),'recipient can read optional note');
select pg_temp.follow_assert((select count(*)=1 from public.notifications where user_id=auth.uid() and dedupe_key like 'connection-request:'||current_setting('test.follow.connection')||':%'),'recipient gets real in-app notification');
reset role;
select pg_temp.follow_assert((select count(*)=1 from public.notification_jobs where user_id='f1025000-0000-4000-8000-000000000004' and dedupe_key like 'connection-request:'||current_setting('test.follow.connection')||':%'),'Resend engine job queued, not cosmetic');
set local role authenticated;
select set_config('request.jwt.claim.sub','f1025000-0000-4000-8000-000000000007',true);
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')$q$),'unregistered member denied');
select set_config('request.jwt.claim.sub','f1025000-0000-4000-8000-000000000001',true);
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')$q$),'Host/Admin gets no personal preference override');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select * from hat_networking.followthrough_choices$q$),'no direct preference table reads');
reset role;
insert into public.member_blocks(blocker_id,blocked_id,reason) values('f1025000-0000-4000-8000-000000000002','f1025000-0000-4000-8000-000000000003','[TEST] Safety check');
set local role authenticated;
select set_config('request.jwt.claim.sub','f1025000-0000-4000-8000-000000000002',true);
select pg_temp.follow_assert(jsonb_array_length(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001'))=1,'blocked person excluded');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.connect_event_networking('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000001','')$q$),'blocked connection denied');
reset role;
update public.profiles set visibility_paused=true where id='f1025000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.follow_assert(jsonb_array_length(public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001'))=0,'paused visibility respected');
reset role;
update public.events set starts_at=now()-interval '16 days',ends_at=now()-interval '15 days' where id='f1025200-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')$q$),'existing 14-day event history limit retained');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.get_my_networking_followthrough('f1025200-0000-4000-8000-000000000001')$q$),'anonymous history denied');
select pg_temp.follow_assert(pg_temp.follow_denied($q$select public.defer_networking_connection('f1025200-0000-4000-8000-000000000001','f1025400-0000-4000-8000-000000000002')$q$),'anonymous defer denied');
reset role;
select pg_temp.follow_assert(not has_schema_privilege('authenticated','hat_networking','usage'),'private schema stays closed');
rollback;
