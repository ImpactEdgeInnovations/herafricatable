-- Rollback-only database rehearsal. Does not upload or delete Storage files.
begin;
create temporary table photo_deletion_results(result text);
do $$
declare cid uuid := '9acb54bc-6d61-45af-b7ca-86249d87de28';
  member_id uuid := '9b4cde5d-578e-442f-b9ee-2e304e88ae46';
  host_id uuid := '86829233-6deb-4335-8370-468d61dce51e';
  aid uuid := gen_random_uuid(); bid uuid := gen_random_uuid();
  first_photo uuid := gen_random_uuid(); second_photo uuid := gen_random_uuid(); normal_photo uuid := gen_random_uuid();
  jobs jsonb; token uuid; replacement uuid; denied boolean := false;
begin
  insert into public.community_photo_albums(id,community_id,title) values(aid,cid,'Deletion rehearsal');
  insert into public.community_photo_batches(id,album_id,uploader_id,photo_count) values(bid,aid,member_id,2);
  insert into public.community_album_photos(id,album_id,community_id,batch_id,uploader_id,status)
    values(first_photo,aid,cid,bid,member_id,'published'),(second_photo,aid,cid,bid,host_id,'published');
  delete from public.community_photo_albums where id=aid;
  if exists(select 1 from public.community_album_photos where id in(first_photo,second_photo)) then raise exception 'Album cascade did not delete photos'; end if;
  if (select count(*) from public.community_photo_deletion_queue where photo_id in(first_photo,second_photo))<>2 then raise exception 'Cascade lost deletion manifests'; end if;
  if has_table_privilege('authenticated','public.community_photo_deletion_queue','SELECT')
    or has_function_privilege('anon','public.claim_community_photo_deletions(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.finish_community_photo_deletion(uuid,uuid)','EXECUTE') then raise exception 'Browser received cleanup privileges'; end if;
  execute 'set local role authenticated';
  begin perform public.claim_community_photo_deletions(); exception when insufficient_privilege then denied:=true; end;
  execute 'reset role';
  if not denied then raise exception 'Member claimed deletion work'; end if;
  execute 'set local role service_role';
  jobs:=public.claim_community_photo_deletions(member_id);
  if jsonb_array_length(jobs)<>1 or (jobs->0->>'id')::uuid<>first_photo then raise exception 'Account cleanup scope failed'; end if;
  if jobs->0->>'path'<>cid::text||'/'||first_photo::text then raise exception 'Incorrect Storage path'; end if;
  token:=(jobs->0->>'token')::uuid;
  if jsonb_array_length(public.claim_community_photo_deletions(member_id))<>0 then raise exception 'Active lease claimed twice'; end if;
  if public.finish_community_photo_deletion(first_photo,gen_random_uuid()) then raise exception 'Wrong token cleared manifest'; end if;
  execute 'reset role';
  update public.community_photo_deletion_queue set leased_until=now()-interval '1 second' where photo_id=first_photo;
  execute 'set local role service_role';
  jobs:=public.claim_community_photo_deletions(member_id); replacement:=(jobs->0->>'token')::uuid;
  if replacement is null or replacement=token then raise exception 'Expired work was not reclaimed'; end if;
  if public.finish_community_photo_deletion(first_photo,token) then raise exception 'Stale worker cleared renewed lease'; end if;
  if not public.finish_community_photo_deletion(first_photo,replacement) then raise exception 'Valid completion did not clear manifest'; end if;
  if public.finish_community_photo_deletion(first_photo,replacement) then raise exception 'Duplicate completion succeeded'; end if;
  execute 'reset role';
  if not exists(select 1 from public.community_photo_deletion_queue where photo_id=second_photo) then raise exception 'Another account lost its manifest'; end if;
  insert into public.community_photo_albums(id,community_id,title) values(aid,cid,'Normal cleanup rehearsal');
  insert into public.community_photo_batches(id,album_id,uploader_id,photo_count) values(bid,aid,member_id,1);
  insert into public.community_album_photos(id,album_id,community_id,batch_id,uploader_id,status) values(normal_photo,aid,cid,bid,member_id,'cleaning');
  execute 'set local role service_role'; perform public.finish_community_photo_cleanup(normal_photo); execute 'reset role';
  if exists(select 1 from public.community_album_photos where id=normal_photo)
    or exists(select 1 from public.community_photo_deletion_queue where photo_id=normal_photo) then raise exception 'Normal cleanup left duplicate work'; end if;
  insert into photo_deletion_results values('PASS: cascade survival, account scope, private grants, lease/retry/stale-token protection and ordinary cleanup compatibility');
end;
$$;
select * from photo_deletion_results;
rollback;
