-- TEST ONLY: synthetic metadata, tagged identities, no uploaded files or emails;
-- all fixtures and changes are rolled back. This is NOT a migration.
begin;
create temporary table poster_results(result text);
do $$
declare hid uuid; mid uuid; aid uuid; cid uuid; eid uuid:=gen_random_uuid(); pid uuid:=gen_random_uuid();
  path text; cover_path text; draft_path text; allowed boolean;
begin
  select u.id into strict hid from auth.users u join public.profiles p on p.id=u.id where u.email='community.host@hat-test.invalid' and p.is_test_account;
  select u.id into strict mid from auth.users u join public.profiles p on p.id=u.id where u.email='community.member.one@hat-test.invalid' and p.is_test_account;
  select user_id into strict aid from public.user_roles where role='super_admin' and (expires_at is null or expires_at>now()) limit 1;
  select id into strict cid from public.communities where slug='hat-community-event-acceptance';
  insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,created_by)
  values(eid,'poster-visibility-test-'||eid,'[TEST] Poster visibility','virtual','public','published',now()+interval '10 days',now()+interval '11 days','closed',aid);
  insert into public.member_event_proposals(id,proposed_by,title,summary,format,starts_at,ends_at,online_url,capacity,safety_contact_name,safety_contact_phone,host_experience,status,canonical_event_id)
  values(pid,hid,'[TEST] Poster visibility',repeat('Test private summary. ',3),'virtual',now()+interval '10 days',now()+interval '11 days','https://meet.google.com/test',20,'Test Host','0000000000',repeat('Test experience. ',3),'approved',eid);
  path:='member_event_proposal/'||pid||'/'||hid||'/test.jpg';
  cover_path:=eid||'/'||hid||'/published.jpg';draft_path:=eid||'/'||hid||'/draft.jpg';
  insert into public.application_proposal_media(owner_id,context_type,context_id,storage_path,mime_type,width,height,alt_text,status)
  values(hid,'member_event_proposal',pid,path,'image/jpeg',1200,800,'Test poster for access checks','approved');
  insert into public.event_hosts(event_id,user_id,assigned_by) values(eid,hid,aid);
  insert into public.event_host_workspaces(event_id) values(eid);
  insert into public.event_host_covers(event_id,draft_storage_path,draft_alt_text,published_storage_path,published_alt_text)
  values(eid,draft_path,'Private replacement poster',cover_path,'Published test poster');
  insert into storage.objects(bucket_id,name) values('proposal-media',path),('event-host-covers',cover_path),('event-host-covers',draft_path);

  perform set_config('request.jwt.claim.sub','',true);execute 'set local role anon';
  if (select count(*) from storage.objects where name in(path,cover_path))<>2 then raise exception 'Public visitor cannot read published images';end if;
  if exists(select 1 from storage.objects where name=draft_path) then raise exception 'Public visitor read draft cover';end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',mid::text,true);execute 'set local role authenticated';
  if (select count(*) from storage.objects where name in(path,cover_path))<>2 then raise exception 'Ordinary member cannot read published images';end if;
  if exists(select 1 from public.application_proposal_media where context_id=pid) then raise exception 'Private application metadata exposed';end if;
  if exists(select 1 from storage.objects where name=draft_path) then raise exception 'Member read draft cover';end if;
  execute 'reset role';
  update public.application_proposal_media set status='submitted' where context_id=pid;
  execute 'set local role authenticated';
  if exists(select 1 from storage.objects where name=path) then raise exception 'Unapproved poster exposed';end if;
  execute 'reset role';update public.application_proposal_media set status='approved',is_current=false where context_id=pid;
  execute 'set local role authenticated';
  if exists(select 1 from storage.objects where name=path) then raise exception 'Replaced poster exposed';end if;
  execute 'reset role';update public.application_proposal_media set is_current=true where context_id=pid;
  update public.events set audience='community' where id=eid;
  insert into public.community_event_links(community_id,event_id) values(cid,eid);
  update public.community_memberships set status='removed' where community_id=cid and user_id=mid;
  execute 'set local role authenticated';
  if exists(select 1 from storage.objects where name in(path,cover_path)) then raise exception 'Unrelated member read Community-only poster';end if;
  if exists(select 1 from public.list_public_event_proposal_posters(array[eid])) or exists(select 1 from public.list_public_event_host_covers(array[eid])) then raise exception 'Unrelated member read private poster metadata';end if;
  execute 'reset role';
  insert into public.community_memberships(community_id,user_id,role,status) values(cid,mid,'member','active') on conflict(community_id,user_id) do update set status='active';
  execute 'set local role authenticated';
  if (select count(*) from storage.objects where name in(path,cover_path))<>2 then raise exception 'Authorised Community member cannot read posters';end if;
  execute 'reset role';perform set_config('request.jwt.claim.sub','',true);execute 'set local role anon';
  if exists(select 1 from storage.objects where name in(path,cover_path)) then raise exception 'Anonymous private poster access';end if;
  execute 'reset role';
  update public.events set status='draft' where id=eid;
  perform set_config('request.jwt.claim.sub',mid::text,true);execute 'set local role authenticated';
  if exists(select 1 from storage.objects where name in(path,cover_path,draft_path)) then raise exception 'Draft event poster exposed';end if;
  execute 'reset role';
  if exists(select 1 from storage.buckets where id in('proposal-media','event-host-covers') and public) then raise exception 'Private bucket made public';end if;
  insert into poster_results values('PASS: public visitor/member poster access; private metadata, draft, unapproved, replaced and Community-audience boundaries; both buckets private. Rollback only.');
end; $$;
select * from poster_results;
rollback;
