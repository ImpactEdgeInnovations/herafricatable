-- TEST ONLY, NOT A MIGRATION. Fake accounts and all changes roll back.
begin;
create function pg_temp.check_notice(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
create function pg_temp.notice_denied(statement text) returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end; $$;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
select ('f0260000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'networking-notice-'||n||'@test.invalid','authenticated','authenticated','{}','{}',now() from generate_series(1,4) n;
update public.profiles set access_status='active',visibility_paused=false,is_test_account=true,display_name='Notice Tester '||right(id::text,1) where id::text like 'f0260000-%';
insert into public.venues(id,name,city,country,address_line) values('f0261000-0000-4000-8000-000000000001','[TEST] Notice venue','Nairobi','Kenya','[TEST] 1 Notice Lane, Nairobi');
insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,venue_id,created_by)
values('f0262000-0000-4000-8000-000000000001','test-networking-notice-rollback','[TEST] Notice rehearsal','in_person','public','published',now()-interval '10 minutes',now()+interval '2 hours','f0261000-0000-4000-8000-000000000001','f0260000-0000-4000-8000-000000000001');
insert into public.event_hosts(event_id,user_id,status,assigned_by) values('f0262000-0000-4000-8000-000000000001','f0260000-0000-4000-8000-000000000001','active','f0260000-0000-4000-8000-000000000001');
insert into public.orders(id,user_id,event_id,status,processing_mode,currency,subtotal_minor,total_minor)
select ('f0263000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f0260000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f0262000-0000-4000-8000-000000000001','approved','manual_review','KES',0,0 from generate_series(2,4) n;
insert into public.event_memberships(event_id,user_id,status,order_id)
select 'f0262000-0000-4000-8000-000000000001',('f0260000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'attended',('f0263000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(2,4) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000001',true);
select public.save_event_networking('f0262000-0000-4000-8000-000000000001',now()-interval '1 minute',now()+interval '30 minutes',5,60,array['Table 1','Table 2'],'What are you building?');
select public.control_event_networking('f0262000-0000-4000-8000-000000000001','start');
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000002',true);
select public.join_event_networking('f0262000-0000-4000-8000-000000000001',true,'Building a food business');
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000003',true);
select public.join_event_networking('f0262000-0000-4000-8000-000000000001',true,'Building a retail business');
select set_config('test.notice.id',public.get_event_networking('f0262000-0000-4000-8000-000000000001')->'match'->>'id',true);
select public.answer_event_networking('f0262000-0000-4000-8000-000000000001',current_setting('test.notice.id')::uuid,true);
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000002',true);
select public.answer_event_networking('f0262000-0000-4000-8000-000000000001',current_setting('test.notice.id')::uuid,true);
select public.answer_event_networking('f0262000-0000-4000-8000-000000000001',current_setting('test.notice.id')::uuid,false);
select pg_temp.check_notice((public.get_event_networking('f0262000-0000-4000-8000-000000000001')->'end_notice'->>'conversation')::boolean,'actor has durable conversation notice');
select pg_temp.check_notice(not(public.get_event_networking('f0262000-0000-4000-8000-000000000001')->>'joined')::boolean,'actor no longer ready');
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000003',true);
select pg_temp.check_notice(public.get_event_networking('f0262000-0000-4000-8000-000000000001')->'end_notice'->>'id'=current_setting('test.notice.id'),'peer gets same durable generic notice');
select pg_temp.check_notice(not(public.get_event_networking('f0262000-0000-4000-8000-000000000001') ? 'match'),'old match and timer removed');
select pg_temp.check_notice((select count(*)=3 from jsonb_object_keys(public.get_event_networking('f0262000-0000-4000-8000-000000000001')->'end_notice')),'notice exposes no actor, reason or contact');
select pg_temp.check_notice(pg_temp.notice_denied($q$select public.join_event_networking('f0262000-0000-4000-8000-000000000001',true,'Building a retail business')$q$),'stale join cannot bypass acknowledgement');
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000004',true);
select public.join_event_networking('f0262000-0000-4000-8000-000000000001',true,'Building a design business');
select pg_temp.check_notice(not(public.get_event_networking('f0262000-0000-4000-8000-000000000001') ? 'end_notice'),'unrelated guest cannot see notice');
select pg_temp.check_notice(pg_temp.notice_denied($q$select public.continue_event_networking('f0262000-0000-4000-8000-000000000001',current_setting('test.notice.id')::uuid)$q$),'unrelated guest cannot acknowledge');
reset role;
select pg_temp.check_notice((select count(*)=1 from hat_networking.matches where event_id='f0262000-0000-4000-8000-000000000001'),'no automatic replacement before choice');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000003',true);
select public.continue_event_networking('f0262000-0000-4000-8000-000000000001',current_setting('test.notice.id')::uuid);
select pg_temp.check_notice(not(public.get_event_networking('f0262000-0000-4000-8000-000000000001') ? 'end_notice'),'choice clears own notice');
select pg_temp.check_notice(public.get_event_networking('f0262000-0000-4000-8000-000000000001') ? 'match','choice allows a new offer');
select pg_temp.check_notice(pg_temp.notice_denied($q$select public.continue_event_networking('f0262000-0000-4000-8000-000000000001',current_setting('test.notice.id')::uuid)$q$),'duplicate acknowledgement rejected safely');
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000002',true);
select pg_temp.check_notice(public.get_event_networking('f0262000-0000-4000-8000-000000000001') ? 'end_notice','one choice does not clear peer notice');
select public.join_event_networking('f0262000-0000-4000-8000-000000000001',false);
select pg_temp.check_notice(not(public.get_event_networking('f0262000-0000-4000-8000-000000000001') ? 'end_notice'),'leave clears own notice');
select pg_temp.check_notice(not(public.get_event_networking('f0262000-0000-4000-8000-000000000001')->>'joined')::boolean,'leave stays outside pool');
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000003',true);
select public.join_event_networking('f0262000-0000-4000-8000-000000000001',false);
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000004',true);
select pg_temp.check_notice(public.get_event_networking('f0262000-0000-4000-8000-000000000001') ? 'end_notice','leaving networking notifies current partner');
select pg_temp.check_notice(not(public.get_event_networking('f0262000-0000-4000-8000-000000000001')->'end_notice'->>'conversation')::boolean,'unaccepted offer is not called a conversation');
select set_config('test.notice.next',public.get_event_networking('f0262000-0000-4000-8000-000000000001')->'end_notice'->>'id',true);
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000001',true);
select public.control_event_networking('f0262000-0000-4000-8000-000000000001','pause');
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000004',true);
select pg_temp.check_notice(pg_temp.notice_denied($q$select public.continue_event_networking('f0262000-0000-4000-8000-000000000001',current_setting('test.notice.next')::uuid)$q$),'paused session cannot continue');
select pg_temp.check_notice(public.get_event_networking('f0262000-0000-4000-8000-000000000001') ? 'end_notice','Host pause preserves notice');
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000001',true);
select public.control_event_networking('f0262000-0000-4000-8000-000000000001','resume');
reset role;
update public.event_memberships set status='cancelled' where event_id='f0262000-0000-4000-8000-000000000001' and user_id='f0260000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub','f0260000-0000-4000-8000-000000000004',true);
select pg_temp.check_notice(pg_temp.notice_denied($q$select public.continue_event_networking('f0262000-0000-4000-8000-000000000001',current_setting('test.notice.next')::uuid)$q$),'revoked registration cannot continue');
reset role;
select pg_temp.check_notice(not exists(select 1 from hat_networking.matches where event_id='f0262000-0000-4000-8000-000000000001' group by member_a,member_b having count(*)>1),'early ended pair never repeats');
select pg_temp.check_notice(not has_function_privilege('anon','public.continue_event_networking(uuid,uuid)','execute'),'anonymous continue denied');
select pg_temp.check_notice(not has_schema_privilege('authenticated','hat_networking','usage'),'private schema remains inaccessible');
select 'PASS: private end notices and scoped continuation; all fake data rolled back' as result;
rollback;
