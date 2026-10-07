-- Rollback-only permission rehearsal. Never a migration or real file test.
begin;
create temporary table photo_pilot_results(result text);
do $$
declare cid uuid:='9acb54bc-6d61-45af-b7ca-86249d87de28';
 host_id uuid:='86829233-6deb-4335-8370-468d61dce51e';
 member_id uuid:='9b4cde5d-578e-442f-b9ee-2e304e88ae46';
 aid uuid:=gen_random_uuid(); pid uuid; denied boolean; result jsonb;
begin
 perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
 update public.community_release_checks set status='passed' where community_id=cid;
 update public.communities set status='published' where id=cid;
 update public.membership_intake_settings set mode='trusted_auto',trusted_auto_expires_at=now()+interval '1 day';
 update public.community_pilot_settings set enabled=true where id=true;
 insert into public.community_pilot_access(user_id,source) values(host_id,'existing_tester') on conflict do nothing;
 delete from public.community_pilot_access where user_id=member_id;
 insert into public.community_cohorts(community_id,eligibility_scope,status,welcome_message,introduction_prompt,created_by,follow_up_until)
 values(cid,'active_members','active','Welcome to this rollback-only pilot photo test.','Share a question in this rollback-only test.',host_id,now()+interval '1 day')
 on conflict(community_id) do update set status='active',follow_up_until=now()+interval '1 day';
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.create_community_photo_album(cid,aid,'Pilot shared album','Rollback-only album.');
 perform public.save_pilot_community_photo_uploads(cid,true);
 perform public.save_community_photo_album_settings(aid,'members',false);
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 if not (public.get_community_photo_album(aid)->>'can_upload')::boolean then raise exception 'Ordinary member outside creator cohort cannot contribute'; end if;
 result:=public.reserve_community_album_photos(aid,gen_random_uuid(),1,true);
 if result is null then raise exception 'Member reservation failed'; end if;
 select id into pid from public.community_album_photos where album_id=aid limit 1;
 execute 'set local role service_role';
 if not public.community_photo_actor_can_upload(pid,member_id) then raise exception 'Server upload guard denied non-creator member'; end if;
 execute 'reset role';
 denied:=false;
 begin perform public.save_pilot_community_photo_uploads(cid,false); exception when others then denied:=true; end;
 if not denied then raise exception 'Ordinary member changed Host setting'; end if;
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.save_community_photo_album_settings(aid,'hosts_only',false);
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 if (public.get_community_photo_album(aid)->>'can_upload')::boolean then raise exception 'Host-only album ignored'; end if;
 perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
 perform public.save_admin_community_photo_settings(cid,500,false,'Rollback-only Admin pause.');
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 denied:=false;
 begin perform public.save_pilot_community_photo_uploads(cid,true); exception when others then
  if sqlerrm='Photo sharing has been paused by Admin. Ask Admin to reopen it' then denied:=true; else raise; end if;
 end;
 if not denied then raise exception 'Host bypassed Admin pause'; end if;
 perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
 perform public.save_admin_community_photo_settings(cid,500,true,'Rollback-only Admin reopening pilot sharing.');
 update public.community_pilot_settings set enabled=false where id=true;
 if public.community_photo_uploads_open(cid) then raise exception 'Global pilot pause ignored'; end if;
 update public.community_pilot_settings set enabled=true where id=true;
 execute 'set local role service_role';
 perform public.record_community_photo_cleanup_health(0,1);
 execute 'reset role';
 if public.community_photo_uploads_open(cid) then raise exception 'Failed cleanup stayed open'; end if;
 execute 'set local role service_role'; perform public.record_community_photo_cleanup_health(0,0); execute 'reset role';
 perform public.save_admin_community_photo_settings(cid,500,true,'Rollback-only pilot reopen after cleanup.');
 update public.membership_intake_settings set trusted_auto_expires_at=now()-interval '1 minute';
 if public.community_photo_uploads_open(cid) then raise exception 'Expired pilot stayed open'; end if;
 if has_function_privilege('authenticated','public.reserve_community_album_photos_internal(uuid,uuid,integer,boolean)','execute')
  or has_function_privilege('authenticated','public.get_community_photo_album_internal(uuid)','execute')
  or has_function_privilege('anon','public.save_pilot_community_photo_uploads(uuid,boolean)','execute') then raise exception 'Internal or anonymous grants leaked'; end if;
 insert into photo_pilot_results values('PASS: Host opens pilot photos; non-creator member participates; Host-only album, Admin pause and expiry enforced; internal endpoints protected');
end;
$$;
select * from photo_pilot_results;
rollback;
