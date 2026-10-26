-- TEST ONLY. Two simultaneous fake events; all accounts, emails and records roll back.
begin;
create function pg_temp.check_arrival(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end; $$;
create function pg_temp.arrival_denied(statement text) returns boolean language plpgsql as $$
begin execute statement; return false; exception when others then return true; end; $$;
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
select ('f0270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'arrival-'||n||'@test.invalid','authenticated','authenticated','{}','{}',now() from generate_series(1,6) n;
update public.profiles set access_status='active',visibility_paused=false,is_test_account=true,display_name='Arrival Tester '||right(id::text,1) where id::text like 'f0270000-%';
insert into public.venues(id,name,city,country,address_line) values('f0271000-0000-4000-8000-000000000001','[TEST] Arrival venue','Nairobi','Kenya','[TEST] 1 Arrival Lane, Nairobi');
insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,venue_id,created_by)
select ('f0272000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'test-arrival-'||n,'[TEST] Simultaneous event '||n,'in_person','public','published',now()-interval '10 minutes',now()+interval '2 hours','f0271000-0000-4000-8000-000000000001',('f0270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,2) n;
insert into public.event_hosts(event_id,user_id,status,assigned_by)
select ('f0272000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f0270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'active',('f0270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,2) n;
insert into public.orders(id,user_id,event_id,status,processing_mode,currency,subtotal_minor,total_minor)
select ('f0273000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f0270000-0000-4000-8000-'||lpad((n+3)::text,12,'0'))::uuid,('f0272000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approved','manual_review','KES',0,0 from generate_series(1,2) n;
insert into public.event_memberships(event_id,user_id,status,order_id)
select ('f0272000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f0270000-0000-4000-8000-'||lpad((n+3)::text,12,'0'))::uuid,'confirmed',('f0273000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,2) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000004',true);
select set_config('test.arrival.a.manual',(select manual_code from public.get_my_event_pass('f0272000-0000-4000-8000-000000000001')),true);
select set_config('test.arrival.a.qr',(select qr_payload from public.get_my_event_pass('f0272000-0000-4000-8000-000000000001')),true);
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000005',true);
select set_config('test.arrival.b.manual',(select manual_code from public.get_my_event_pass('f0272000-0000-4000-8000-000000000002')),true);
select set_config('test.arrival.b.qr',(select qr_payload from public.get_my_event_pass('f0272000-0000-4000-8000-000000000002')),true);
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000001',true);
select pg_temp.check_arrival(public.can_operate_event_door('f0272000-0000-4000-8000-000000000001'),'Host can operate own door');
select pg_temp.check_arrival(not public.can_manage_event('f0272000-0000-4000-8000-000000000001'),'Host gains no finance/admin role');
select public.save_event_networking('f0272000-0000-4000-8000-000000000001',now()+interval '5 minutes',now()+interval '35 minutes',5,60,array['Table 1'],'Hello');
select public.manage_my_event_door_helper('f0272000-0000-4000-8000-000000000001','arrival-3@test.invalid','assign');
select public.manage_my_event_door_helper('f0272000-0000-4000-8000-000000000001','arrival-3@test.invalid','assign');
select pg_temp.check_arrival((public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001')->>'expected')::integer=1,'Host sees own confirmed guest count');
select pg_temp.check_arrival(pg_temp.arrival_denied($q$select public.get_my_event_arrival('f0272000-0000-4000-8000-000000000002')$q$),'Host cannot read another event roster');
select pg_temp.check_arrival(pg_temp.arrival_denied($q$select public.manage_my_event_door_helper('f0272000-0000-4000-8000-000000000002','arrival-3@test.invalid','assign')$q$),'Host cannot assign another event helper');
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000003',true);
select pg_temp.check_arrival(public.can_operate_event_door('f0272000-0000-4000-8000-000000000001'),'helper has assigned event access');
select pg_temp.check_arrival(not public.can_operate_event_door('f0272000-0000-4000-8000-000000000002'),'helper has no other simultaneous event access');
select pg_temp.check_arrival((select count(*)=0 from public.get_my_event_door('test-arrival-2')),'other scanner route denied');
select pg_temp.check_arrival(pg_temp.arrival_denied($q$select public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001')$q$),'helper cannot browse roster');
select pg_temp.check_arrival(pg_temp.arrival_denied($q$select public.manage_my_event_door_helper('f0272000-0000-4000-8000-000000000001','arrival-6@test.invalid','assign')$q$),'helper cannot delegate access');
select pg_temp.check_arrival((select outcome='not_found' from public.door_check_in_event_member('f0272000-0000-4000-8000-000000000001',current_setting('test.arrival.b.manual'),'manual','Test A')),'Event B manual pass rejected by Event A');
select pg_temp.check_arrival((select outcome='not_found' from public.door_check_in_event_member('f0272000-0000-4000-8000-000000000001',current_setting('test.arrival.b.qr'),'qr','Test A')),'Event B QR rejected by Event A');
select pg_temp.check_arrival((select outcome='checked_in' from public.door_check_in_event_member('f0272000-0000-4000-8000-000000000001',current_setting('test.arrival.a.qr'),'qr','Test A')),'correct QR records arrival');
select pg_temp.check_arrival((select outcome='already_checked_in' from public.door_check_in_event_member('f0272000-0000-4000-8000-000000000001',current_setting('test.arrival.a.manual'),'manual','Test A')),'repeat scan is idempotent');
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000001',true);
select pg_temp.check_arrival((public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001')->>'arrived')::integer=1,'arrival persists in Host view');
select pg_temp.check_arrival(public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001')->'guests'->0->>'checked_in_at' is not null,'arrival time visible');
select pg_temp.check_arrival(not(public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001')->'guests'->0 ? 'attendee_email'),'attendance view omits guest email');
select pg_temp.check_arrival((public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001','No such guest')->>'total')::integer=0,'search returns accurate empty result');
select public.manage_my_event_door_helper('f0272000-0000-4000-8000-000000000001','arrival-3@test.invalid','remove');
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000003',true);
select pg_temp.check_arrival(not public.can_operate_event_door('f0272000-0000-4000-8000-000000000001'),'removal ends access without token refresh');
select pg_temp.check_arrival(pg_temp.arrival_denied($q$select public.door_check_in_event_member('f0272000-0000-4000-8000-000000000001',current_setting('test.arrival.a.manual'),'manual','Test')$q$),'removed helper cannot scan');
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000001',true);
select public.manage_my_event_door_helper('f0272000-0000-4000-8000-000000000001','arrival-3@test.invalid','assign');
reset role;
update public.event_hosts set status='paused' where event_id='f0272000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000003',true);
select pg_temp.check_arrival(not public.can_operate_event_door('f0272000-0000-4000-8000-000000000001'),'Host suspension invalidates delegated helpers');
reset role;
update public.event_hosts set status='active' where event_id='f0272000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_arrival(public.get_event_networking_schedule('f0272000-0000-4000-8000-000000000001')->>'minutes'='5','public schedule visible before booking');
select pg_temp.check_arrival(not(public.get_event_networking_schedule('f0272000-0000-4000-8000-000000000001') ? 'points'),'public schedule never exposes meeting points');
reset role;
update public.orders set status='fulfilled',fulfilled_at=now() where id='f0273000-0000-4000-8000-000000000001';
select pg_temp.check_arrival(exists(select 1 from public.notification_jobs where user_id='f0270000-0000-4000-8000-000000000004' and payload->>'body' like '%Networking:%'),'future booking email contains saved networking time');
select pg_temp.check_arrival(exists(select 1 from public.notifications where user_id='f0270000-0000-4000-8000-000000000003' and href='/events/test-arrival-1/door'),'helper gets event-specific in-app link');
select pg_temp.check_arrival((select count(*)=1 from public.event_checkins where event_id='f0272000-0000-4000-8000-000000000001' and reversed_at is null),'one persisted check-in for repeated scan');
select pg_temp.check_arrival(not exists(select 1 from public.event_checkins where event_id='f0272000-0000-4000-8000-000000000002'),'wrong-event scans create no attendance');
-- A larger guest list must remain bounded and searchable.
insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
select ('f0270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'arrival-'||n||'@test.invalid','authenticated','authenticated','{}','{}',now() from generate_series(10,39) n;
update public.profiles set access_status='active',is_test_account=true,display_name='Guest '||right(id::text,2) where id::text like 'f0270000-%' and right(id::text,2)::integer>=10;
insert into public.orders(id,user_id,event_id,status,processing_mode,currency,subtotal_minor,total_minor)
select ('f0273000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('f0270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'f0272000-0000-4000-8000-000000000001','approved','manual_review','KES',0,0 from generate_series(10,39) n;
insert into public.event_memberships(event_id,user_id,status,order_id)
select 'f0272000-0000-4000-8000-000000000001',('f0270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'confirmed',('f0273000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(10,39) n;
set local role authenticated;
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000001',true);
select pg_temp.check_arrival(jsonb_array_length(public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001')->'guests')=25,'first page bounded to 25');
select pg_temp.check_arrival(jsonb_array_length(public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001','','all',25)->'guests')=6,'second page returns remaining guests');
select pg_temp.check_arrival((public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001','','arrived')->>'total')::integer=1,'arrived filter reflects actual check-ins');
reset role;
update public.event_memberships set status='cancelled' where event_id='f0272000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000002',true);
select pg_temp.check_arrival((select outcome='not_found' from public.door_check_in_event_member('f0272000-0000-4000-8000-000000000002',current_setting('test.arrival.b.manual'),'manual','Test B')),'cancelled pass rejected even at correct event');
reset role;
update public.events set ends_at=now()-interval '1 minute' where id='f0272000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000001',true);
select public.manage_my_event_door_helper('f0272000-0000-4000-8000-000000000001','arrival-3@test.invalid','remove');
select pg_temp.check_arrival(public.get_my_event_arrival('f0272000-0000-4000-8000-000000000001') is not null,'Host retains attendance after event');
select set_config('request.jwt.claim.sub','f0270000-0000-4000-8000-000000000003',true);
select pg_temp.check_arrival(not public.can_operate_event_door('f0272000-0000-4000-8000-000000000001'),'Host can revoke a helper after the event');
reset role;
update public.events set status='draft' where id='f0272000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_arrival(public.get_event_networking_schedule('f0272000-0000-4000-8000-000000000001') is null,'draft networking schedule not public');
reset role;
select pg_temp.check_arrival(not has_schema_privilege('authenticated','hat_event_ops','usage'),'private helper table inaccessible');
select pg_temp.check_arrival(not has_function_privilege('anon','public.manage_my_event_door_helper(uuid,text,text)','execute'),'anonymous helper management denied');
select 'PASS: Host attendance, delegated helpers, simultaneous event isolation and schedule/email integration; rollback only' as result;
rollback;
