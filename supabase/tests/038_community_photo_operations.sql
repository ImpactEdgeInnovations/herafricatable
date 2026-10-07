-- Rollback-only synthetic operations test. NOT real photo launch certification.
begin;
create temporary table photo_operations_results(result text);
do $$
declare cid uuid:='9acb54bc-6d61-45af-b7ca-86249d87de28'; aid uuid:=gen_random_uuid(); denied boolean; key text; result jsonb;
begin
 perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
 -- This test exercises wider release gates, not the separate pilot exception.
 update public.community_pilot_settings set enabled=false where id=true;
 update public.community_release_checks set status='passed' where community_id=cid;
 update public.communities set status='published' where id=cid;
 perform public.save_admin_community_photo_settings(cid,500,false,'Synthetic rollback fixture only.');
 denied:=false; begin perform public.save_admin_community_photo_settings(cid,500,true,'Synthetic opening attempt.'); exception when others then if sqlerrm='Complete the four real photo checks and a successful cleanup run before opening uploads' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Unverified photo opening accepted'; end if;
 for key in select c.key from public.community_photo_release_checks c loop
  perform public.save_community_photo_release_check(key,true,'Synthetic fixture, rolled back; not live acceptance.');
 end loop;
 execute 'set local role service_role'; perform public.record_community_photo_cleanup_health(0,0); execute 'reset role';
 perform public.save_admin_community_photo_settings(cid,500,true,'Synthetic fixture with temporary evidence only.');
 if not (select uploads_enabled from public.community_photo_settings where community_id=cid) then raise exception 'Verified synthetic opening failed'; end if;
 perform set_config('request.jwt.claim.sub','9b4cde5d-578e-442f-b9ee-2e304e88ae46',true);
 denied:=false; begin perform public.save_admin_community_photo_settings(cid,500,false,'Member must not change this.'); exception when others then if sqlerrm='Super admin required' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Member changed photo settings'; end if;
 denied:=false; begin perform public.get_admin_community_photo_operations(); exception when others then if sqlerrm='Super admin required' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Member read operational records'; end if;
 perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
 perform public.save_community_photo_release_check('access_control',false,'Synthetic revoked check must pause uploads.');
 if exists(select 1 from public.community_photo_settings where uploads_enabled) then raise exception 'Revocation did not pause all uploads'; end if;
 perform public.save_community_photo_release_check('access_control',true,'Synthetic fixture, rolled back; not live acceptance.');
 update public.community_photo_cleanup_health set finished_at=now()-interval '3 days';
 denied:=false; begin perform public.save_admin_community_photo_settings(cid,500,true,'Synthetic stale health opening.'); exception when others then if sqlerrm='Complete the four real photo checks and a successful cleanup run before opening uploads' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Stale cleanup allowed opening'; end if;
 execute 'set local role service_role'; perform public.record_community_photo_cleanup_health(0,0); execute 'reset role';
 perform public.save_admin_community_photo_settings(cid,500,true,'Synthetic open after fresh health.');
 execute 'set local role service_role'; perform public.record_community_photo_cleanup_health(0,1); execute 'reset role';
 if exists(select 1 from public.community_photo_settings where uploads_enabled) then raise exception 'Cleanup failure did not pause uploads'; end if;
 result:=public.get_admin_community_photo_operations();
 if (result->'health'->>'failed')::integer<>1 or jsonb_array_length(result->'checks')<>4 then raise exception 'Operations health/checks missing'; end if;
 execute 'set local role service_role'; perform public.record_community_photo_cleanup_health(0,0); execute 'reset role';
 perform public.save_admin_community_photo_settings(cid,500,true,'Synthetic quota rehearsal only.');
 insert into public.community_cohorts(community_id,eligibility_scope,status,welcome_message,introduction_prompt,created_by,follow_up_until)
 values(cid,'active_members','active','Transaction-only quota test.','Share a question in this rollback-only fixture.','86829233-6deb-4335-8370-468d61dce51e',now()+interval '1 day')
 on conflict(community_id) do update set status='active',follow_up_until=now()+interval '1 day';
 perform set_config('request.jwt.claim.sub','86829233-6deb-4335-8370-468d61dce51e',true);
 perform public.create_community_photo_album(cid,aid,'Quota settings test','Rollback-only album.');
 perform public.reserve_community_album_photos(aid,gen_random_uuid(),2,true);
 perform set_config('request.jwt.claim.sub','e667b8d9-b74d-47e7-b9b6-b91823b01128',true);
 denied:=false; begin perform public.save_admin_community_photo_settings(cid,2,false,'Must not shrink below two reserved photos.'); exception when others then if sqlerrm='The allowance cannot be smaller than the photos and pending uploads already stored' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Allowance shrank below committed quota'; end if;
 perform public.save_admin_community_photo_settings(cid,500,false,'Pause remains available with existing reservations.');
 if has_function_privilege('authenticated','public.record_community_photo_cleanup_health(integer,integer)','execute') or has_table_privilege('authenticated','public.community_photo_release_checks','update') or has_function_privilege('anon','public.get_admin_community_photo_operations()','execute') then raise exception 'Health or gate grants leaked'; end if;
 insert into photo_operations_results values('PASS: opening gate, Super Admin-only controls, stale health rejection, check revocation and cleanup failure pause, committed quota protection, service-only health');
end;
$$;
select * from photo_operations_results;
rollback;
