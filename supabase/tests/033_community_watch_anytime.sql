-- Rollback test only. This is NOT a migration.
begin;
create temporary table watch_anytime_test_results(result text);
do $$
declare eid uuid:=gen_random_uuid(); rid uuid; thread uuid; reply uuid; item jsonb; denied boolean; cursor_id uuid;
begin
  perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
  update public.community_release_checks set status='passed' where community_id='9acb54bc-6d61-45af-b7ca-86249d87de28';
  update public.communities set status='published' where id='9acb54bc-6d61-45af-b7ca-86249d87de28';
  insert into public.community_cohorts(community_id,eligibility_scope,status,welcome_message,introduction_prompt,created_by,follow_up_until)
    values('9acb54bc-6d61-45af-b7ca-86249d87de28','active_members','active','Welcome to the rollback-only discussion fixture.','Share a question in this rollback-only fixture.','86829233-6deb-4335-8370-468d61dce51e',now()+interval '1 day')
    on conflict(community_id) do update set status='active',follow_up_until=now()+interval '1 day';
  insert into public.events(id,slug,title,starts_at,ends_at,status,format)
    values(eid,'anytime-rollback-'||eid,'Watch anytime rollback',now()-interval '2 days',now()-interval '1 day','completed','virtual');
  insert into public.community_event_links(community_id,event_id) values('9acb54bc-6d61-45af-b7ca-86249d87de28',eid);
  select id into rid from public.community_gathering_rooms where event_id=eid;
  update public.community_gathering_rooms set chat_opens_at=now()-interval '3 days',chat_closes_at=now()-interval '1 hour' where id=rid;
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  perform public.save_community_gathering_video_experience(rid,'M7lc1UVf-VE',true,true,'watch_anytime');
  thread := (public.get_community_gathering_discussion(rid)->>'post_id')::uuid;
  if thread is null then raise exception 'Permanent thread not created'; end if;
  perform public.save_community_gathering_video_experience(rid,'abcdefghijk',true,true,'watch_anytime');
  if (public.get_community_gathering_discussion(rid)->>'post_id')::uuid <> thread then raise exception 'Duplicate thread created'; end if;
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  reply := public.reply_to_community_gathering(rid,'My lasting reply after this gathering ended.');
  denied:=false;
  begin perform public.send_community_gathering_message(rid,'Scheduled chat must remain closed.');
  exception when others then if sqlerrm='Live conversation is not open' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Lasting discussion reopened live chat'; end if;
  update public.community_cohorts set follow_up_until=now()-interval '1 day' where community_id='9acb54bc-6d61-45af-b7ca-86249d87de28';
  if not (public.get_community_gathering_discussion(rid)->>'read_only')::boolean then raise exception 'Read-only state ignored'; end if;
  denied:=false;
  begin perform public.reply_to_community_gathering(rid,'Read-only reply must be rejected.');
  exception when others then if sqlerrm='This Community is read only' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Read-only reply accepted'; end if;
  update public.community_cohorts set follow_up_until=now()+interval '1 day' where community_id='9acb54bc-6d61-45af-b7ca-86249d87de28';
  if jsonb_array_length(public.get_community_gathering_discussion(rid)->'comments')<>1 then raise exception 'Reply not shown'; end if;
  denied:=false;
  begin perform public.save_community_gathering_video_experience(rid,'M7lc1UVf-VE',true,true,'watch_anytime');
  exception when others then if sqlerrm='Active Community Host access required' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Member changed Host settings'; end if;
  perform public.delete_community_comment(reply);
  if jsonb_array_length(public.get_community_gathering_discussion(rid)->'comments')<>0 then raise exception 'Removed reply leaked'; end if;
  -- Seed more than one page inside the transaction, without bypassing real API rate limits for production.
  insert into public.community_posts(community_id,author_id,parent_post_id,body,created_at)
    select '9acb54bc-6d61-45af-b7ca-86249d87de28','9b4cde5d-578e-442f-b9ee-2e304e88ae46',thread,'Pagination fixture '||n,now()-n*interval '1 minute' from generate_series(1,65) n;
  item:=public.get_community_gathering_discussion(rid);
  if jsonb_array_length(item->'comments')<>50 or not (item->>'has_more')::boolean then raise exception 'First reply page failed'; end if;
  cursor_id:=(item->'comments'->0->>'comment_id')::uuid;
  item:=public.get_community_gathering_discussion(rid,cursor_id);
  if jsonb_array_length(item->'comments')<>15 or (item->>'has_more')::boolean then raise exception 'Older reply page failed'; end if;
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  perform public.save_community_gathering_video_experience(rid,null,true,true,'watch_together');
  if public.get_community_gathering_discussion(rid)->>'post_id' <> thread::text then raise exception 'Video removal deleted discussion'; end if;
  update public.community_posts set status='hidden' where id=thread;
  if not (public.get_community_gathering_discussion(rid)->>'unavailable')::boolean then raise exception 'Moderation ignored'; end if;
  perform public.save_community_gathering_video_experience(rid,'M7lc1UVf-VE',true,true,'watch_anytime');
  if not (public.get_community_gathering_discussion(rid)->>'unavailable')::boolean then raise exception 'Save restored removed thread'; end if;
  perform set_config('request.jwt.claim.sub','8beb9661-20b6-407e-b5e8-66d2bfb266b3',true);
  denied:=false;
  begin perform public.get_community_gathering_discussion(rid);
  exception when others then if sqlerrm='Active Community membership required' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Outsider accessed discussion'; end if;
  -- Actual privacy cleanup, unlike moderation's soft delete, must not be blocked by this link.
  delete from public.community_posts where id=thread;
  if exists(select 1 from public.community_gathering_discussions where room_id=rid) then raise exception 'Privacy cleanup left a dangling discussion link'; end if;
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  update public.community_memberships set status='removed' where community_id='9acb54bc-6d61-45af-b7ca-86249d87de28' and user_id=auth.uid();
  if public.can_access_community_video(rid) then raise exception 'Removed member retained access'; end if;
  if has_function_privilege('anon','public.get_community_gathering_discussion(uuid,uuid)','execute')
    or has_table_privilege('authenticated','public.community_gathering_discussions','select') then raise exception 'Anonymous/direct access leaked'; end if;
  insert into watch_anytime_test_results values('PASS: Host creation; no duplicate thread; lasting member reply; member settings denied; own removal; 65-reply pagination; video removal preserves discussion; moderation and no resurrection; outsider/removed-member denial; anonymous/direct denial');
end;
$$;
select * from watch_anytime_test_results;
rollback;
