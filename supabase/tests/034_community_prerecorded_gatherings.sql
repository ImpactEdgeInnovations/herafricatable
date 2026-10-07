-- Transaction-only test. Do NOT run this as a migration.
begin;
create temporary table recording_test_results(result text);
do $$
declare request uuid:=gen_random_uuid(); saved jsonb; again jsonb; rid uuid; denied boolean; application uuid; visible integer;
begin
  perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
  update public.community_release_checks set status='passed' where community_id='9acb54bc-6d61-45af-b7ca-86249d87de28';
  update public.communities set status='published' where id='9acb54bc-6d61-45af-b7ca-86249d87de28';
  insert into public.community_cohorts(community_id,eligibility_scope,status,welcome_message,introduction_prompt,created_by,follow_up_until)
    values('9acb54bc-6d61-45af-b7ca-86249d87de28','active_members','active','Welcome to this rollback-only video discussion.','Share a question in this rollback-only fixture.','86829233-6deb-4335-8370-468d61dce51e',now()+interval '1 day')
    on conflict(community_id) do update set status='active',follow_up_until=now()+interval '1 day';
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  denied:=false;
  begin perform public.create_community_video_discussion('9acb54bc-6d61-45af-b7ca-86249d87de28',request,'World Today','A private video discussion about our world.','M7lc1UVf-VE',false);
  exception when others then if sqlerrm='Confirm you have permission to share this video' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Missing sharing permission accepted'; end if;
  saved:=public.create_community_video_discussion('9acb54bc-6d61-45af-b7ca-86249d87de28',request,'World Today','A private video discussion about our world.','M7lc1UVf-VE',true);
  rid:=(saved->>'room_id')::uuid;
  again:=public.create_community_video_discussion('9acb54bc-6d61-45af-b7ca-86249d87de28',request,'World Today','A private video discussion about our world.','M7lc1UVf-VE',true);
  if saved<>again then raise exception 'Retry created duplicate session'; end if;
  if not exists(select 1 from public.events where id=request and status='completed' and audience='community' and registration_mode='closed') then raise exception 'Recording became public/bookable'; end if;
  if exists(select 1 from public.ticket_types where event_id=request) then raise exception 'Recording created tickets'; end if;
  if public.get_community_gathering_content_kind(rid)<>'prerecorded' or public.get_community_gathering_video(rid)->>'viewing_mode'<>'watch_anytime' then raise exception 'Wrong recording experience'; end if;
  if not exists(select 1 from public.community_gathering_rooms where id=rid and not chat_enabled and chat_mode='closed') then raise exception 'Recording live chat remained open'; end if;
  denied:=false;
  begin perform public.save_community_gathering_video_experience(rid,'M7lc1UVf-VE',true,true,'watch_together');
  exception when others then if sqlerrm='Prerecorded videos use a lasting conversation' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Recording switched into timed-only mode'; end if;
  perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
  perform public.reply_to_community_gathering(rid,'A member can watch and discuss without an RSVP.');
  if public.get_community_gathering_video(rid)->>'content_kind'<>'prerecorded' then raise exception 'Member could not watch'; end if;
  denied:=false;
  begin perform public.create_community_video_discussion('9acb54bc-6d61-45af-b7ca-86249d87de28',gen_random_uuid(),'Member attempt','Members should not create Host video discussions.','M7lc1UVf-VE',true);
  exception when others then if sqlerrm='Active Community Host access required' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Ordinary member created video'; end if;
  perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
  perform public.save_community_gathering_video_experience(rid,null,true,true,'watch_anytime');
  if public.get_community_gathering_content_kind(rid)<>'prerecorded' or public.get_community_gathering_discussion(rid) is null then raise exception 'Removing video lost recording type/discussion'; end if;
  insert into public.community_host_applications(applicant_id,community_name,proposed_slug,category,purpose,intended_members,expected_members,admission_model,host_experience,safety_plan,guidelines_accepted_at,status,created_community_id)
    values(auth.uid(),'Recording rollback','recording-rollback-'||request,'other','This is a transaction-only Community video fixture.','Members of the rollback-only test Community.',20,'application_review','Experienced test Community Host.','Host will monitor and report any safety concerns.',now(),'approved','9acb54bc-6d61-45af-b7ca-86249d87de28') returning id into application;
  insert into public.community_pilot_publications(community_id,owner_id,application_id) values('9acb54bc-6d61-45af-b7ca-86249d87de28',auth.uid(),application);
  update public.community_pilot_settings set enabled=false where id=true;
  denied:=false;
  begin perform public.create_community_video_discussion('9acb54bc-6d61-45af-b7ca-86249d87de28',gen_random_uuid(),'Paused pilot','Paused pilot Hosts should not open new video discussions.','M7lc1UVf-VE',true);
  exception when others then if sqlerrm='Automatic pilot gatherings are paused or your pilot access has ended' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Pilot pause bypassed'; end if;
  perform set_config('request.jwt.claim.sub','8beb9661-20b6-407e-b5e8-66d2bfb266b3',true);
  denied:=false;
  begin perform public.get_community_gathering_content_kind(rid);
  exception when others then if sqlerrm='Active Community membership required' then denied:=true; else raise; end if; end;
  if not denied then raise exception 'Outsider saw private recording metadata'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  select count(*) into visible from public.events where id=request;
  execute 'reset role';
  if visible<>0 then raise exception 'Anonymous event discovery exposed recording'; end if;
  if has_function_privilege('anon','public.create_community_video_discussion(uuid,uuid,text,text,text,boolean)','execute') then raise exception 'Anonymous creation allowed'; end if;
  insert into recording_test_results values('PASS: consent; Host creation; retry deduplication; private/closed/no tickets; prerecorded mode; live chat closed; member reply without RSVP; member creation denied; removal continuity; pilot pause; outsider metadata denial; anonymous event/creation denial');
end;
$$;
select * from recording_test_results;
rollback;
