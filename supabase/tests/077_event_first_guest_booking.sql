-- TEST ONLY, NOT A MIGRATION. All fake identities, bookings, queued email and
-- release-check fixtures below roll back. No provider email is sent.
begin;
create function pg_temp.guest_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label;end if;
 perform set_config('hat.guest_assertions',(coalesce(nullif(current_setting('hat.guest_assertions',true),''),'0')::int+1)::text,true);
end;$$;
create function pg_temp.guest_error(statement text,fragment text) returns boolean language plpgsql as $$begin
 execute statement;return false;exception when others then
 return sqlstate in ('P0001','42501') and position(lower(fragment) in lower(sqlerrm))>0;
end;$$;
do $$
<<guest_booking>>
declare
 host_id uuid:='f1104000-0000-4000-8000-000000000001';
 guest_id uuid:='f1104000-0000-4000-8000-000000000002';
 other_id uuid:='f1104000-0000-4000-8000-000000000004';
 event_id uuid:='f1104200-0000-4000-8000-000000000001';
 ticket_id uuid:='f1104400-0000-4000-8000-000000000001';
 community_id uuid:='f1104600-0000-4000-8000-000000000001';
 booking uuid; paid_order uuid; key text; n int;
begin
 insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
 select ('f1104000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'event-first-'||i||'@test.invalid','authenticated','authenticated','{}','{}',case when i=6 then null else now() end from generate_series(1,6)i;
 update public.profiles set is_test_account=true,display_name='[TEST] Event guest',access_status=case when id in(host_id,'f1104000-0000-4000-8000-000000000003'::uuid) then 'active'::public.member_access_status when id='f1104000-0000-4000-8000-000000000005'::uuid then 'suspended'::public.member_access_status else 'pending'::public.member_access_status end where id::text like 'f1104000-%';
 insert into public.user_roles(user_id,role,granted_by) values(host_id,'super_admin',host_id);
 insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,capacity,created_by)
 select ('f1104200-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'test-event-first-'||i,'[TEST] Guest booking '||i,'virtual',case when i=4 then 'community' else 'public' end,'published',now()+case when i=6 then interval '-2 days' else interval '2 days' end,now()+case when i=6 then interval '-1 day' else interval '2 days 2 hours' end,case when i=5 then 'closed' else 'manual_review' end,case when i=1 then 1 else 10 end,host_id from generate_series(1,6)i;
 insert into public.ticket_types(id,event_id,name,price_minor,currency,inventory_quantity,status)
 select ('f1104400-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,('f1104200-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'[TEST] Place',case when i=3 then 1000 else 0 end,'KES',case when i=1 then 1 else 20 end,'on_sale' from generate_series(1,6)i;
 insert into public.event_hosts(event_id,user_id,status,assigned_by) values(event_id,host_id,'active',host_id);
 perform pg_temp.guest_assert(not has_table_privilege('authenticated','hat_event_ops.guest_details','select'),'guest details table is private');
 perform pg_temp.guest_assert(not has_function_privilege('anon','public.save_my_event_guest_details(uuid,text,boolean)','execute'),'anonymous details writes denied');
 perform pg_temp.guest_assert(not has_function_privilege('authenticated','public.reserve_free_event_place_core(uuid,uuid,text)','execute'),'inner confirmation helper private');
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',host_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 -- These are transaction-local fixtures, never persisted launch evidence.
 foreach key in array array['database_boundary','two_account_journey','admin_operations','privacy_and_permissions','rollback_and_recovery'] loop
  perform public.save_module_release_check('event_guest_access',key,'passed','[TEST] Rollback-only fixture','Isolated transaction fixture, not real launch evidence.');
 end loop;
 perform public.set_feature_flag('event_guest_access',true);
 perform pg_temp.guest_assert(public.set_event_free_instant_booking(event_id,true),'free Host setting independent of pilot membership');
 perform set_config('request.jwt.claim.sub',guest_id::text,true);
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.reserve_free_event_place('f1104200-0000-4000-8000-000000000001','f1104400-0000-4000-8000-000000000001',null)$q$,'Guest booking is not open'),'new guest needs booking consent');
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.save_my_event_guest_details('f1104200-0000-4000-8000-000000000001','A',true)$q$,'Add your name'),'short name denied');
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.save_my_event_guest_details('f1104200-0000-4000-8000-000000000001','Guest',false)$q$,'accept'),'missing consent denied');
 perform public.save_my_event_guest_details(event_id,'  Guest Tester  ',true);
 perform pg_temp.guest_assert(public.get_my_event_guest_details(event_id)->>'display_name'='Guest Tester','name saved and trimmed');
 booking:=public.reserve_free_event_place(event_id,ticket_id,null);
 perform pg_temp.guest_assert((select status='fulfilled' and total_minor=0 from public.orders where id=booking),'free guest booking fulfilled');
 perform pg_temp.guest_assert((select count(*)=1 from public.get_my_event_pass(event_id)),'confirmed guest pass available');
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-1')->>'guest_only'='true','ticket identifies optional membership');
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-1')->>'guest_name'='Guest Tester','ticket has booking guest name');
 perform pg_temp.guest_assert((select access_status='pending' from public.profiles where id=guest_id),'guest remains pending, not a member');
 perform pg_temp.guest_assert(not public.can_host_event(event_id),'guest does not become Host');
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select * from public.list_member_directory(null,null,null,24,0)$q$,'Active visible membership required'),'guest cannot browse member directory');
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.set_event_free_instant_booking('f1104200-0000-4000-8000-000000000001',false)$q$,'Host or Super Admin'),'guest cannot manage booking setting');
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.create_event_registration('f1104200-0000-4000-8000-000000000001','f1104400-0000-4000-8000-000000000001',1,'','','')$q$,'already have'),'duplicate registration denied');
 perform public.save_my_event_guest_details('f1104200-0000-4000-8000-000000000002','Guest Tester',true);
 paid_order:=public.create_event_registration('f1104200-0000-4000-8000-000000000002','f1104400-0000-4000-8000-000000000002',1,'','','');
 perform pg_temp.guest_assert((select status='pending_review' from public.orders where id=paid_order),'reviewed free event remains reviewed');
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-2') is null,'pending review has no ticket');
 perform public.save_my_event_guest_details('f1104200-0000-4000-8000-000000000003','Guest Tester',true);
 paid_order:=public.create_event_registration('f1104200-0000-4000-8000-000000000003','f1104400-0000-4000-8000-000000000003',1,'','FAKE REFERENCE','Not proof');
 perform pg_temp.guest_assert((select status='pending_review' and total_minor=1000 from public.orders where id=paid_order),'typed payment reference is not paid confirmation');
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-3') is null,'unverified paid booking has no ticket');
 for n in 4..6 loop
  perform pg_temp.guest_assert(pg_temp.guest_error(format('select public.save_my_event_guest_details(%L,''Guest'',true)',('f1104200-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid),'Guest booking is not open'),'private, closed and ended guest entry blocked '||n);
 end loop;
 perform set_config('request.jwt.claim.sub',other_id::text,true);
 perform pg_temp.guest_assert(public.get_my_event_guest_details(event_id) is null,'own-account details only');
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-1') is null,'other guest cannot read ticket');
 perform public.save_my_event_guest_details(event_id,'Other Guest',true);
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.reserve_free_event_place('f1104200-0000-4000-8000-000000000001','f1104400-0000-4000-8000-000000000001',null)$q$,'fully booked'),'ticket inventory cap retained');
 execute 'reset role';
 update public.ticket_types set inventory_quantity=20 where id=ticket_id;
 execute 'set local role authenticated';
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.reserve_free_event_place('f1104200-0000-4000-8000-000000000001','f1104400-0000-4000-8000-000000000001',null)$q$,'full'),'event capacity cap retained');
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.reserve_free_event_place('f1104200-0000-4000-8000-000000000001','f1104400-0000-4000-8000-000000000002',null)$q$,'Ticket is not available'),'cross-event ticket denied');
 for n in 5..6 loop
  perform set_config('request.jwt.claim.sub',('f1104000-0000-4000-8000-'||lpad(n::text,12,'0')),true);
  perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.save_my_event_guest_details('f1104200-0000-4000-8000-000000000002','Guest',true)$q$,case when n=5 then 'cannot make a new guest booking' else 'Confirm your email' end),'suspended/unverified account denied '||n);
 end loop;
 execute 'reset role';
 perform pg_temp.guest_assert(not exists(select 1 from public.membership_applications where user_id in(guest_id,other_id)),'no membership application submitted');
 perform pg_temp.guest_assert(not exists(select 1 from public.user_roles where user_id in(guest_id,other_id)),'no member or admin role assigned');
 perform pg_temp.guest_assert(not exists(select 1 from public.community_memberships where user_id in(guest_id,other_id)),'no automatic Community join');
 perform pg_temp.guest_assert(not exists(select 1 from public.entitlements where user_id=guest_id and entitlement_type<>'event_access'),'event entitlements only');
 insert into public.communities(id,slug,name,description,community_type,status,public_preview_enabled,created_by) values(community_id,'test-event-first-community','[TEST] Optional Community','Rollback-only test Community.','private','draft',false,host_id);
 insert into public.community_memberships(community_id,user_id,role,status) values(community_id,host_id,'owner','active'),(community_id,'f1104000-0000-4000-8000-000000000003','moderator','active');
 -- Satisfy the existing Community gate within this rollback-only fixture.
 update public.community_release_checks checks set status='passed',owner_label='[TEST] Fixture',evidence_note='Rollback-only synthetic fixture; not persisted acceptance evidence.',verified_by=host_id,verified_at=now() where checks.community_id=guest_booking.community_id;
 update public.communities set status='published' where id=community_id;
 insert into public.community_event_links(community_id,event_id) values(community_id,event_id);
 perform set_config('request.jwt.claim.sub',guest_id::text,true);
 execute 'set local role authenticated';
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-1')->'community'='null'::jsonb,'private Community identity not disclosed');
 execute 'reset role';
 update public.communities set public_preview_enabled=true where id=community_id;
 execute 'set local role authenticated';
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-1')->'community'->>'slug'='test-event-first-community','public-preview Community can be offered optionally');
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.set_feature_flag('event_guest_access',false);
 perform set_config('request.jwt.claim.sub',other_id::text,true);
 perform pg_temp.guest_assert(pg_temp.guest_error($q$select public.save_my_event_guest_details('f1104200-0000-4000-8000-000000000002','Guest',true)$q$,'Guest booking is not open'),'rollback switch blocks new guest entry');
 perform set_config('request.jwt.claim.sub',guest_id::text,true);
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-1') is not null,'existing confirmed ticket survives guest-entry pause');
 perform public.cancel_my_event_place(booking,'[TEST] Cancel free place');
 perform pg_temp.guest_assert(public.get_my_event_ticket('test-event-first-1') is null,'cancelled ticket revoked');
 execute 'reset role';
end;$$;
select current_setting('hat.guest_assertions')::integer as passed_database_assertions, 'ROLLBACK ONLY: no live launch evidence or provider email' as scope;
rollback;
