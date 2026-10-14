-- TEST ONLY. Isolated fixtures, permissions and notifications are rolled back.
begin;
create temporary table link_authority_results(result text);
do $$
declare
  host_id uuid; other_id uuid; admin_id uuid;
  cid uuid:=gen_random_uuid(); other_cid uuid:=gen_random_uuid();
  own_id uuid:=gen_random_uuid(); unrelated_id uuid:=gen_random_uuid();
  private_id uuid:=gen_random_uuid(); denied boolean;
begin
  select id into strict host_id from auth.users where email='community.host@hat-test.invalid';
  select id into strict other_id from auth.users where email='community.member.one@hat-test.invalid';
  select u.id into strict admin_id from auth.users u join public.user_roles r on r.user_id=u.id
    where u.email='impactedgeinnovations@gmail.com' and r.role='super_admin';
  insert into public.communities(id,slug,name,description,community_type,status,created_by)
    values(cid,'link-owner-'||cid,'[TEST] Linking owner','Rollback-only Community permission acceptance.','private','draft',host_id),
      (other_cid,'link-owner-'||other_cid,'[TEST] Other room','Rollback-only Community permission acceptance.','private','draft',host_id);
  insert into public.community_memberships(community_id,user_id,role,status)
    values(cid,host_id,'owner','active'),(other_cid,host_id,'owner','active');
  insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,created_by)
    values(own_id,'link-owner-'||own_id,'[TEST] Assigned Host','virtual','public','published',now()+interval '7 days',now()+interval '7 days 1 hour','closed',other_id),
      (unrelated_id,'link-owner-'||unrelated_id,'[TEST] Not current Host','virtual','public','published',now()+interval '7 days',now()+interval '7 days 1 hour','closed',host_id),
      (private_id,'link-owner-'||private_id,'[TEST] Private gathering','virtual','community','published',now()+interval '7 days',now()+interval '7 days 1 hour','closed',host_id);
  insert into public.event_hosts(event_id,user_id,assigned_by)
    values(own_id,host_id,admin_id),(unrelated_id,other_id,admin_id);
  insert into public.community_event_proposals(community_id,proposed_by,title,summary,format,starts_at,ends_at,capacity,safety_contact_name,safety_contact_phone,status,canonical_event_id,online_url)
    values(cid,host_id,'[TEST] Private gathering','Rollback-only gathering owned by this Community, without a public Host assignment.','virtual',now()+interval '7 days',now()+interval '7 days 1 hour',20,'Test Host','+254700000000','approved',private_id,'https://meet.google.com/abc-defg-hij');
  perform set_config('request.jwt.claim.sub',host_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',host_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if not exists(select 1 from public.list_community_programming_options(cid) where item_id=own_id)
    or exists(select 1 from public.list_community_programming_options(cid) where item_id=unrelated_id) then
    raise exception 'Chooser does not enforce current Host assignment';end if;
  denied:=false;
  begin perform public.set_community_event_link(cid,unrelated_id,true,false);
  exception when others then if sqlerrm like 'Choose an event you currently host%' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Original creator without current Host access linked an event';end if;
  perform public.set_community_event_link(cid,own_id,true,false);
  perform public.set_community_event_link(cid,private_id,true,false);
  denied:=false;
  begin perform public.set_community_event_link(other_cid,private_id,true,false);
  exception when others then if sqlerrm like 'Choose an event you currently host%' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Private gathering crossed Community boundaries';end if;
  denied:=false;
  begin perform public.set_community_event_link(other_cid,own_id,true,false);
  exception when others then if sqlerrm like 'Choose an event you currently host%' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Second Community link bypassed existing relationship';end if;
  execute 'reset role';
  update public.event_hosts set status='paused' where event_id=own_id;
  execute 'set local role authenticated';
  if not exists(select 1 from public.list_community_programming_options(cid) where item_id=own_id and is_linked) then
    raise exception 'Host pause hid an existing linked gathering';end if;
  denied:=false;
  begin perform public.set_community_event_link(cid,own_id,true,true);
  exception when others then if sqlerrm like 'Choose an event you currently host%' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Paused Host changed a link';end if;
  perform public.set_community_event_link(cid,own_id,false,false);
  if exists(select 1 from public.list_community_programming_options(cid) where item_id=own_id) then
    raise exception 'Unlinked paused event remains available';end if;
  execute 'reset role';
  -- Preserve pre-existing cross-Host links for visibility/cleanup, not new authority.
  insert into public.community_event_links(community_id,event_id,linked_by) values(cid,unrelated_id,admin_id);
  execute 'set local role authenticated';
  if not exists(select 1 from public.list_community_programming_options(cid) where item_id=unrelated_id and is_linked) then
    raise exception 'Existing link was silently hidden';end if;
  perform public.set_community_event_link(cid,unrelated_id,false,false);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  perform public.set_community_event_link(cid,unrelated_id,true,false);
  if not exists(select 1 from public.list_community_programming_options(cid) where item_id=unrelated_id and is_linked) then
    raise exception 'Super Admin oversight failed';end if;
  execute 'reset role';
  if has_function_privilege('authenticated','public.can_link_community_event(uuid,uuid)','EXECUTE')
    or has_function_privilege('anon','public.can_link_community_event(uuid,uuid)','EXECUTE') then
    raise exception 'Internal policy helper exposed';end if;
  insert into link_authority_results values('PASS: current Host (not creator), unrelated/paused Host denial, scoped private gathering, one Community relationship, legacy-link preservation/empty cleanup, Super Admin oversight and private helper grants.');
end;
$$;
select * from link_authority_results;
rollback;
