-- Rollback-only queue verification; does not send real email.
begin;
create temporary table photo_notification_results(result text);
do $$
declare cid uuid:='9acb54bc-6d61-45af-b7ca-86249d87de28'; aid uuid:=gen_random_uuid();
 member_id uuid:='9b4cde5d-578e-442f-b9ee-2e304e88ae46'; host_id uuid:='86829233-6deb-4335-8370-468d61dce51e';
 admin_id uuid:='e667b8d9-b74d-47e7-b9b6-b91823b01128';
 photo uuid; upload jsonb; report uuid; expected integer; key_prefix text;
begin
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 update public.community_release_checks set status='passed' where community_id=cid;
 update public.communities set status='published' where id=cid;
 insert into public.community_cohorts(community_id,eligibility_scope,status,welcome_message,introduction_prompt,created_by,follow_up_until)
 values(cid,'active_members','active','Transaction-only notification test.','Share a question in this rollback-only fixture.',host_id,now()+interval '1 day')
 on conflict(community_id) do update set status='active',follow_up_until=now()+interval '1 day';
 insert into public.notification_preferences(user_id,in_app_enabled)
 select distinct r.user_id,true from public.user_roles r join public.profiles p on p.id=r.user_id
 where r.role in ('super_admin','moderator') and (r.expires_at is null or r.expires_at>now()) and p.access_status='active'
 on conflict(user_id) do update set in_app_enabled=true;
 select count(distinct r.user_id) into expected from public.user_roles r join public.profiles p on p.id=r.user_id
 where r.role in ('super_admin','moderator') and (r.expires_at is null or r.expires_at>now()) and p.access_status='active';
 if expected=0 then raise exception 'No safety recipient fixture'; end if;
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform public.create_community_photo_album(cid,aid,'Safety queue album','Rollback-only album.');
 perform public.save_community_photo_album_settings(aid,'members',false);
 update public.community_photo_settings set uploads_enabled=true where community_id=cid;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 photo:=(public.reserve_community_album_photos(aid,gen_random_uuid(),1,true)->0->>'id')::uuid;
 execute 'set local role service_role';
 upload:=public.claim_community_photo_upload(photo,member_id);
 perform public.finish_community_photo_upload(photo,member_id,(upload->>'token')::uuid,1000,120,80,'PRIVATE CAPTION SENTINEL');
 execute 'reset role';
 report:=public.report_community_photo(photo,'privacy','PRIVATE COMPLAINT SENTINEL do not include this in email.');
 key_prefix:='community-photo-report:'||report::text||':%';
 if public.report_community_photo(photo,'privacy','Retry should reuse this same private report.')<>report then raise exception 'Retry duplicated report'; end if;
 if (select count(*) from public.notifications where dedupe_key like key_prefix)<>expected
  or (select count(*) from public.notification_jobs where dedupe_key like key_prefix)<>expected then raise exception 'Missing or duplicate safety alerts'; end if;
 if exists(select 1 from public.notification_jobs where dedupe_key like key_prefix
  and (payload::text like '%SENTINEL%' or template_key<>'system' or payload->>'href'<>'/admin/operations?area=safety-work#community-moderation')) then raise exception 'Private evidence leaked or incorrect queue route'; end if;
 if exists(select 1 from public.notification_jobs j where j.dedupe_key like key_prefix and not exists(
  select 1 from public.user_roles r join public.profiles p on p.id=r.user_id where r.user_id=j.user_id
  and r.role in ('super_admin','moderator') and (r.expires_at is null or r.expires_at>now()) and p.access_status='active')) then raise exception 'Unauthorised recipient'; end if;
 if has_function_privilege('authenticated','public.notify_admins_of_community_photo_report()','execute')
  or has_function_privilege('anon','public.notify_admins_of_community_photo_report()','execute') then raise exception 'Trigger exposed as callable endpoint'; end if;
 insert into photo_notification_results values('PASS: private in-app/email jobs, active safety recipients, duplicate-report reuse, no complaint/caption payload, trigger-only grants');
end;
$$;
select * from photo_notification_results;
rollback;
