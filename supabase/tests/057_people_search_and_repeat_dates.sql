-- TEST ONLY. Synthetic event/draft records and role context are rolled back.
begin;
create temporary table repeat_results(result text);
do $$
declare host_id uuid; member_id uuid; cid uuid:=gen_random_uuid();eid uuid:=gen_random_uuid();proposal uuid;
 ids uuid[];again uuid[];request_id uuid:=gen_random_uuid();first_start timestamptz;
 result jsonb;denied boolean;live_cid uuid;owner_id uuid;community_eid uuid:=gen_random_uuid();source_id uuid;community_ids uuid[];
begin
 select id into strict host_id from auth.users where email='community.host@hat-test.invalid';
 select id into strict member_id from auth.users where email='community.member.one@hat-test.invalid';
 insert into public.communities(id,slug,name,description,community_type,status,created_by)
 values(cid,'repeat-search-test-'||cid,'[TEST] People filters','Rollback-only Community member search fixture.','private','draft',host_id);
 insert into public.community_memberships(community_id,user_id,role,status) values(cid,host_id,'owner','active'),(cid,member_id,'member','active');
 insert into public.events(id,slug,title,summary,format,audience,status,starts_at,ends_at,registration_mode,created_by)
 values(eid,'repeat-search-test-'||eid,'[TEST] Repeat public event','Rollback-only public event repeat schedule acceptance.','virtual','public','published',now()+interval '14 days',now()+interval '14 days 2 hours','closed',host_id);
 insert into public.event_hosts(event_id,user_id,status,assigned_by) values(eid,host_id,'active',host_id);
 insert into public.member_event_proposals(proposed_by,title,summary,format,starts_at,ends_at,capacity,safety_contact_name,safety_contact_phone,host_experience,online_url,status,canonical_event_id)
 values(host_id,'[TEST] Repeat public event','Rollback-only public event repeat schedule acceptance.','virtual',now()+interval '14 days',now()+interval '14 days 2 hours',20,'Test Host','+254700000000','I will welcome guests and support the discussion.','https://meet.google.com/abc-defg-hij','approved',eid) returning id into proposal;
 first_start:=make_timestamptz(extract(year from now())::integer+1,1,31,18,0,0,'Africa/Nairobi');
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',host_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 result:=public.search_community_people(cid);
 if jsonb_array_length(result->'members')<>2 then raise exception 'Search did not return fixture members';end if;
 if exists(select 1 from jsonb_array_elements(result->'members')x where x ? 'email' or x ? 'phone') then raise exception 'Private contacts exposed';end if;
 if jsonb_array_length(public.search_community_people(cid,p_industry=>'[TEST] Missing industry')->'members')<>0 then raise exception 'Industry filter ignored';end if;
 if jsonb_array_length(public.search_community_people(cid,p_city=>'[TEST] Missing city')->'members')<>0 then raise exception 'Location filter ignored';end if;
 if jsonb_array_length(public.search_community_people(cid,p_query=>'%')->'members')<>0 then raise exception 'Search treated wildcard as a command';end if;
 ids:=public.plan_repeat_events(eid,null,'monthly',3,first_start,request_id);
 again:=public.plan_repeat_events(eid,null,'monthly',3,first_start,request_id);
 if ids<>again or cardinality(ids)<>3 then raise exception 'Repeat request duplicated drafts';end if;
 execute 'reset role';
 if (select count(*) from public.member_event_proposals where id=any(ids) and status='draft' and canonical_event_id is null)<>3 then raise exception 'Repeat dates bypassed draft approval';end if;
 if not exists(select 1 from public.member_event_proposals where id=ids[2] and extract(month from starts_at at time zone 'Africa/Nairobi')=2
  and extract(day from starts_at at time zone 'Africa/Nairobi')=extract(day from (date_trunc('month',first_start at time zone 'Africa/Nairobi')+interval '2 months -1 day')))
  or not exists(select 1 from public.member_event_proposals where id=ids[3] and extract(day from starts_at at time zone 'Africa/Nairobi')=31) then raise exception 'Monthly dates drifted at month end';end if;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',member_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 denied:=false;begin perform public.plan_repeat_events(eid,null,'weekly',2,first_start,gen_random_uuid());exception when others then if sqlerrm='Current Event Host access required' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Unrelated member repeated an event';end if;
 execute 'reset role';
 select c.id,m.user_id into strict live_cid,owner_id from public.communities c join public.community_memberships m on m.community_id=c.id and m.role='owner' and m.status='active' where c.slug='lavington-women' and c.status='published';
 insert into public.events(id,slug,title,summary,format,audience,status,starts_at,ends_at,registration_mode,created_by)
 values(community_eid,'repeat-search-test-'||community_eid,'[TEST] Repeat gathering','Rollback-only Community gathering repeat acceptance.','virtual','community','published',now()+interval '14 days',now()+interval '14 days 1 hour','closed',owner_id);
 insert into public.community_event_proposals(community_id,proposed_by,title,summary,format,starts_at,ends_at,capacity,safety_contact_name,safety_contact_phone,online_url,status,canonical_event_id)
 values(live_cid,owner_id,'[TEST] Repeat gathering','Rollback-only Community gathering repeat acceptance.','virtual',now()+interval '14 days',now()+interval '14 days 1 hour',20,'Test Host','+254700000000','https://meet.google.com/abc-defg-hij','approved',community_eid) returning id into source_id;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 community_ids:=public.plan_repeat_events(community_eid,live_cid,'daily',2,first_start,gen_random_uuid());
 execute 'reset role';
 if (select count(*) from public.community_event_proposals where id=any(community_ids) and status='draft' and canonical_event_id is null and community_id=live_cid)<>2 then raise exception 'Community repeats were not private drafts';end if;
 if has_function_privilege('anon','public.plan_repeat_events(uuid,uuid,text,integer,timestamptz,uuid)','execute') or has_function_privilege('anon','public.search_community_people(uuid,text,text,text,integer)','execute') then raise exception 'Anonymous API execution granted';end if;
 insert into repeat_results values('PASS: Community People filters/private-contact projection, literal search, actual authenticated Host repeat drafts, monthly month-end anchoring, idempotency, unrelated-member denial, Community-only daily repeats and anonymous grant denial.');
end;$$;
select * from repeat_results;
rollback;
