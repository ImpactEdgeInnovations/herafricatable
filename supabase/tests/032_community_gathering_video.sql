-- Transaction-only fixture. Do not save this as a migration.
begin;
create temporary table video_test_results(result text);
do $$
declare eid uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); item jsonb; denied boolean;
begin
  perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
  -- Simulate acceptance for the existing tagged rehearsal Community inside this transaction only.
  update public.community_release_checks set status='passed' where community_id='9acb54bc-6d61-45af-b7ca-86249d87de28';
  update public.communities set status='published' where id='9acb54bc-6d61-45af-b7ca-86249d87de28';
  insert into public.events(id,slug,title,starts_at,ends_at,status,format)
    values(eid,'video-rollback-'||eid,'Video rollback fixture',now()-interval '2 days',now()-interval '1 day','completed','virtual');
  insert into public.community_event_links(community_id,event_id)
    values('9acb54bc-6d61-45af-b7ca-86249d87de28',eid);
  -- Linking creates its room through the existing trigger.
  select id into rid from public.community_gathering_rooms
    where community_id='9acb54bc-6d61-45af-b7ca-86249d87de28' and event_id=eid;
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  item := public.save_community_gathering_video(rid,'M7lc1UVf-VE',true,true);
  if item->>'video_id' <> 'M7lc1UVf-VE' then raise exception 'Host save failed'; end if;
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  if public.get_community_gathering_video(rid) is null then raise exception 'Member read failed'; end if;
  denied := false;
  begin perform public.save_community_gathering_video(rid,'M7lc1UVf-VE',true,true);
  exception when others then if sqlerrm='Active Community Host access required' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Member edited Host video'; end if;
  perform set_config('request.jwt.claim.sub','8beb9661-20b6-407e-b5e8-66d2bfb266b3',true);
  denied := false;
  begin perform public.get_community_gathering_video(rid);
  exception when others then if sqlerrm='Active Community membership required' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Outsider saw video'; end if;
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  perform public.save_community_gathering_video(rid,'M7lc1UVf-VE',true,false);
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  if public.get_community_gathering_video(rid) is not null then raise exception 'Replay opt-out failed'; end if;
  perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
  perform public.pause_community_gathering_video(rid,true);
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  item := public.save_community_gathering_video(rid,'M7lc1UVf-VE',true,true);
  if not (item->>'admin_paused')::boolean then raise exception 'Host undid Admin pause'; end if;
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  if public.get_community_gathering_video(rid) is not null then raise exception 'Paused video leaked'; end if;
  perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
  perform public.pause_community_gathering_video(rid,false);
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  perform public.save_community_gathering_video(rid,'abcdefghijk',false,true);
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  if public.get_community_gathering_video(rid) is not null then raise exception 'Host hide failed'; end if;
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  perform public.save_community_gathering_video(rid,'abcdefghijk',true,true);
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  if public.get_community_gathering_video(rid)->>'video_id' <> 'abcdefghijk' then raise exception 'Link replacement failed'; end if;
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  perform public.save_community_gathering_video(rid,null,true,true);
  if public.get_community_gathering_video(rid)->>'video_id' is not null or not exists(select 1 from public.community_gathering_rooms where id=rid) then raise exception 'Remove video damaged gathering'; end if;
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  update public.community_memberships set status='removed' where community_id='9acb54bc-6d61-45af-b7ca-86249d87de28' and user_id='9b4cde5d-578e-442f-b9ee-2e304e88ae46';
  if public.can_access_community_video(rid) then raise exception 'Removed member kept access'; end if;
  if has_function_privilege('anon','public.get_community_gathering_video(uuid)','execute') or has_table_privilege('authenticated','public.community_gathering_videos','select') then raise exception 'Direct/anonymous access leaked'; end if;
  insert into video_test_results values('PASS: Host save; member read; member edit denied; outsider denied; replay opt-out; Admin pause/resume; Host cannot unpause; hide/replace/remove; gathering preserved; removed-member denial; direct/anonymous denial');
end;
$$;
select * from video_test_results;
rollback;
