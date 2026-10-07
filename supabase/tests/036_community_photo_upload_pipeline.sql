-- Rollback only; NOT a migration. Storage binaries are tested separately.
begin;
create temporary table photo_pipeline_results(result text);
do $$
declare cid uuid:='9acb54bc-6d61-45af-b7ca-86249d87de28'; aid uuid:=gen_random_uuid(); member_id uuid:='9b4cde5d-578e-442f-b9ee-2e304e88ae46';
 host_id uuid:='86829233-6deb-4335-8370-468d61dce51e'; photo uuid; upload jsonb; token uuid; result jsonb; denied boolean;
begin
 perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
 update public.community_release_checks set status='passed' where community_id=cid;
 update public.communities set status='published' where id=cid;
 insert into public.community_cohorts(community_id,eligibility_scope,status,welcome_message,introduction_prompt,created_by,follow_up_until)
  values(cid,'active_members','active','A transaction-only photo test.','Share a question in this rollback-only fixture.',host_id,now()+interval '1 day')
  on conflict(community_id) do update set status='active',follow_up_until=now()+interval '1 day';
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.create_community_photo_album(cid,aid,'Photo upload test','A transaction-only photo album.');
 perform public.save_community_photo_album_settings(aid,'review',false);
 update public.community_photo_settings set uploads_enabled=true where community_id=cid;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 photo:=(public.reserve_community_album_photos(aid,gen_random_uuid(),1,true)->0->>'id')::uuid;
 execute 'set local role service_role';
 upload:=public.claim_community_photo_upload(photo,member_id); token:=(upload->>'token')::uuid;
 denied:=false;
 begin perform public.claim_community_photo_upload(photo,member_id); exception when others then
  if sqlerrm='This photo upload is busy or has expired. Start a new upload' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Concurrent claim accepted'; end if;
 denied:=false;
 begin perform public.finish_community_photo_upload(photo,member_id,gen_random_uuid(),1000,120,80,'Caption'); exception when others then
  if sqlerrm='This photo can no longer be saved' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Incorrect claim token accepted'; end if;
 if public.finish_community_photo_upload(photo,member_id,token,1000,120,80,'Caption')<>'pending' then raise exception 'Review-first bypass'; end if;
 execute 'reset role';
 if public.get_community_photo_file(photo) is null then raise exception 'Uploader cannot preview pending photo'; end if;
 perform set_config('request.jwt.claim.sub','2d39f7e1-1a3f-40b6-bb43-f90f34ac91c1',true);
 result:=public.get_community_photo_album(aid);
 if jsonb_array_length(result->'photos')<>0 then raise exception 'Other member saw pending photo'; end if;
 denied:=false;
 begin perform public.get_community_photo_file(photo); exception when others then if sqlerrm='This photo is unavailable' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Pending binary metadata leaked'; end if;
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.review_community_album_photo(photo,'approve');
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 if jsonb_array_length(public.get_community_photo_album(aid)->'photos')<>1 then raise exception 'Published photo missing'; end if;
 denied:=false;
 begin perform public.review_community_album_photo(photo,'hide'); exception when others then if sqlerrm='This photo cannot be changed that way' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Member moderated photo'; end if;
 perform public.review_community_album_photo(photo,'remove');
 denied:=false;
 begin perform public.get_community_photo_file(photo); exception when others then if sqlerrm='This photo is unavailable' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Removed photo remained readable'; end if;
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.review_community_album_photo(photo,'restore');
 perform public.review_community_album_photo(photo,'hide');
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 denied:=false;
 begin perform public.get_community_photo_file(photo); exception when others then if sqlerrm='This photo is unavailable' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Uploader saw Host-hidden photo'; end if;
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.review_community_album_photo(photo,'remove');
 update public.community_album_photos set removed_at=now()-interval '8 days' where id=photo;
 execute 'set local role service_role';
 result:=public.claim_community_photo_cleanup();
 if jsonb_array_length(result)<>1 then raise exception 'Expired removed photo not claimed'; end if;
 perform public.finish_community_photo_cleanup(photo);
 execute 'reset role';
 if exists(select 1 from public.community_album_photos where id=photo) then raise exception 'Cleanup did not free allowance'; end if;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 photo:=(public.reserve_community_album_photos(aid,gen_random_uuid(),1,true)->0->>'id')::uuid;
 execute 'set local role service_role';
 upload:=public.claim_community_photo_upload(photo,member_id); token:=(upload->>'token')::uuid;
 execute 'reset role';
 update public.community_memberships set status='removed' where community_id=cid and user_id=member_id;
 execute 'set local role service_role';
 denied:=false;
 begin perform public.finish_community_photo_upload(photo,member_id,token,1000,120,80,'Caption'); exception when others then
  if sqlerrm='This photo can no longer be saved' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Removed member finalised upload'; end if;
 execute 'reset role';
 if has_function_privilege('authenticated','public.claim_community_photo_upload(uuid,uuid)','execute')
  or has_function_privilege('authenticated','public.finish_community_photo_upload(uuid,uuid,uuid,integer,integer,integer,text)','execute')
  or has_function_privilege('anon','public.get_community_photo_file(uuid)','execute') then raise exception 'Private API execution grants leaked'; end if;
 if (select public from storage.buckets where id='community-photos') then raise exception 'Public photo bucket'; end if;
 insert into photo_pipeline_results values('PASS: service-role claim/finalise; duplicate claim/wrong token denied; pending visibility; Host approve/hide/restore; own removal; retention cleanup; membership removed during upload; browser/anonymous grants denied; private bucket');
end;
$$;
select * from photo_pipeline_results;
rollback;
