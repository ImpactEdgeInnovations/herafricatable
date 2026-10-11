-- TEST ONLY, NOT A MIGRATION. Synthetic records and audit entries are rolled back.
-- Uses tagged accounts; never publishes or edits an existing Community or event.
begin;
create temporary table event_linking_results(result text);
do $$
declare
  host_id uuid; member_id uuid; cid uuid:=gen_random_uuid(); eid uuid:=gen_random_uuid();
  draft_eid uuid:=gen_random_uuid(); v_room_id uuid; denied boolean;
begin
  select u.id into strict host_id from auth.users u join public.profiles p on p.id=u.id
    where u.email='community.host@hat-test.invalid' and p.access_status='active';
  select u.id into strict member_id from auth.users u join public.profiles p on p.id=u.id
    where u.email='community.member.one@hat-test.invalid' and p.access_status='active';
  if exists(select 1 from public.user_roles where user_id in(host_id,member_id)
    and role='super_admin') then raise exception 'Rehearsal requires non-admin test accounts';end if;
  insert into public.communities(id,slug,name,description,community_type,status,created_by)
    values(cid,'link-rehearsal-'||cid,'[TEST] Event linking','Rollback-only Community event linking acceptance.','private','draft',host_id);
  insert into public.community_memberships(community_id,user_id,role,status)
    values(cid,host_id,'owner','active'),(cid,member_id,'member','active');
  insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,created_by)
    values(eid,'link-rehearsal-'||eid,'[TEST] Linking acceptance','virtual','public','published',now()+interval '7 days',now()+interval '7 days 1 hour','closed',host_id),
      (draft_eid,'link-rehearsal-'||draft_eid,'[TEST] Draft denial','virtual','public','draft',now()+interval '7 days',now()+interval '7 days 1 hour','closed',host_id);
  perform set_config('request.jwt.claim.sub',host_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',host_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform public.set_community_event_link(cid,eid,true,true);
  perform public.set_community_event_link(cid,eid,true,true);
  if (select count(*) from public.list_community_programming_options(cid)
    where item_type='event' and item_id=eid and is_linked and is_featured)<>1 then
    raise exception 'Link not confirmed or duplicated';end if;
  perform public.set_community_event_link(cid,eid,false,false);
  if not exists(select 1 from public.list_community_programming_options(cid)
    where item_type='event' and item_id=eid and not is_linked) then
    raise exception 'Unlink not confirmed';end if;
  perform public.set_community_event_link(cid,eid,true,false);
  if not exists(select 1 from public.list_community_programming_options(cid)
    where item_type='event' and item_id=eid and is_linked and not is_featured) then
    raise exception 'Relink did not preserve selected featured state';end if;
  execute 'reset role';
  select id into strict v_room_id from public.community_gathering_rooms where community_id=cid and event_id=eid;
  insert into public.community_gathering_rsvps(room_id,user_id,status) values(v_room_id,member_id,'going');
  execute 'set local role authenticated';
  denied:=false;
  begin perform public.set_community_event_link(cid,eid,false,false);
  exception when others then if sqlerrm like 'This gathering already has member activity%' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Unlink deleted a gathering with member activity';end if;
  if not exists(select 1 from public.list_community_programming_options(cid) where item_id=eid and is_linked) then
    raise exception 'Protected gathering link was lost';end if;
  denied:=false;
  begin perform public.set_community_event_link(cid,draft_eid,true,false);
  exception when others then if sqlerrm='Only a published event can be added' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Draft event was linked';end if;
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
  denied:=false;
  begin perform public.list_community_programming_options(cid);
  exception when others then if sqlerrm='Community host or moderator required' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Ordinary member read Host options';end if;
  denied:=false;
  begin perform public.set_community_event_link(cid,eid,false,false);
  exception when others then if sqlerrm='Community host or moderator required' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Ordinary member changed a link';end if;
  execute 'reset role';
  if not exists(select 1 from public.events where id=eid and status='published' and registration_mode='closed')
    or (select count(*) from public.community_gathering_rooms where community_id=cid and event_id=eid)<>1
    or not exists(select 1 from public.community_gathering_rooms where id=v_room_id and community_id=cid and event_id=eid) then
    raise exception 'Link/unlink altered the event or duplicated its discussion room';end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  denied:=false;
  begin perform public.set_community_event_link(cid,eid,false,false);
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Anonymous event-link execution granted';end if;
  denied:=false;
  begin perform public.list_community_programming_options(cid);
  exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Anonymous Host-options execution granted';end if;
  execute 'reset role';
  if not exists(select 1 from public.community_gathering_rsvps r where r.room_id=v_room_id and r.user_id=member_id and r.status='going') then
    raise exception 'Member RSVP was lost';end if;
  insert into event_linking_results values('PASS: authenticated Host link/upsert/empty unlink/relink, guarded read-back, featured state, populated-room/RSVP preservation, draft denial, ordinary-member read/write denial and anonymous grant denial.');
end;
$$;
select * from event_linking_results;
rollback;
