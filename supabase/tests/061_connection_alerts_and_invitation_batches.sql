-- TEST ONLY. Tagged accounts, isolated records and queued jobs all roll back.
begin;
create temporary table invitation_rehearsal_results(result text);
do $$
declare host_id uuid;one_id uuid;two_id uuid;cid uuid:=gen_random_uuid();aid uuid:=gen_random_uuid();connection_id uuid;row record;first_id uuid;denied boolean;request_emails bigint;
begin
  select u.id into strict host_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.host@hat-test.invalid' and p.is_test_account and p.access_status='active';
  select u.id into strict one_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.member.one@hat-test.invalid' and p.is_test_account and p.access_status='active';
  select u.id into strict two_id from auth.users u join public.profiles p on p.id=u.id where u.email='community.member.two@hat-test.invalid' and p.is_test_account and p.access_status='active';
  if exists(select 1 from public.user_roles where user_id in(host_id,one_id,two_id) and role='super_admin') then raise exception 'Ordinary tagged accounts required';end if;
  insert into public.communities(id,slug,name,description,community_type,status,created_by,join_policy) values(cid,'invite-batch-test-'||cid,'[TEST] Invitation batches','Synthetic rollback-only rehearsal of private invitation batches.','private','draft',host_id,'open');
  insert into public.community_memberships(community_id,user_id,role,status) values(cid,host_id,'owner','active');
  insert into public.community_host_applications(id,applicant_id,community_name,proposed_slug,category,purpose,intended_members,expected_members,admission_model,host_experience,safety_plan,guidelines_accepted_at,status,created_community_id,pilot_auto_draft)
  values(aid,host_id,'[TEST] Invitation batches','invite-batch-test-'||cid,'other','Synthetic rollback-only rehearsal of invitation batch delivery.','Tagged rehearsal members only.',20,'open_request','This is an isolated rollback-only rehearsal.','Synthetic records only. No real users or external emails are changed.',now(),'approved',cid,true);
  insert into public.community_pilot_publications(community_id,owner_id,application_id) values(cid,host_id,aid);
  update public.communities set status='published',join_policy='open' where id=cid;
  perform set_config('request.jwt.claim.sub',host_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',host_id,'role','authenticated')::text,true);execute 'set local role authenticated';
  for row in select * from public.create_table_invitation_batch('community',cid,array['community.member.one@hat-test.invalid','COMMUNITY.MEMBER.TWO@hat-test.invalid','community.member.one@hat-test.invalid'],'Please join this isolated rehearsal Community.') loop
    if row.invitation_id is null or not row.created or row.invitation_status<>'sent' then raise exception 'Valid batch invitation failed: %',row.error_message;end if;first_id:=row.invitation_id;
  end loop;
  if (select count(*) from public.list_my_table_invitation_delivery('community',cid))<>2 then raise exception 'Duplicates were not removed';end if;
  if exists(select 1 from public.create_table_invitation_batch('community',cid,array['community.member.one@hat-test.invalid'],null) where created) then raise exception 'Retry duplicated an invitation';end if;
  denied:=false;begin perform public.create_table_invitation_batch('community',cid,array['bad address'],null);exception when others then if sqlerrm='Check every email address before sending' then denied:=true;else raise;end if;end;if not denied then raise exception 'Invalid email accepted';end if;
  if not exists(select 1 from public.create_table_invitation_batch('community',cid,array['community.host@hat-test.invalid'],null) where invitation_id is null and error_message='This is your own email address.') then raise exception 'Self invitation was accepted';end if;
  perform set_config('request.jwt.claim.sub',one_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',one_id,'role','authenticated')::text,true);
  denied:=false;begin perform public.list_my_table_invitation_delivery('community',cid);exception when others then if sqlerrm='Community Host access required' then denied:=true;else raise;end if;end;if not denied then raise exception 'Ordinary member read Host delivery';end if;
  denied:=false;begin perform public.create_table_invitation_batch('community',cid,array['community.member.two@hat-test.invalid'],null);exception when others then if sqlerrm='Community Host access required' then denied:=true;else raise;end if;end;if not denied then raise exception 'Ordinary member invited as Host';end if;
  execute 'reset role';
  if (select count(*) from public.notification_jobs j join public.table_invitations i on j.dedupe_key='table-invitation:'||i.id where i.community_id=cid)<>2 then raise exception 'Separate recipient email jobs not queued';end if;
  if exists(select 1 from public.notification_jobs j join public.table_invitations i on j.dedupe_key='table-invitation:'||i.id where i.community_id=cid and j.to_email<>i.invitee_email) then raise exception 'Recipient email mismatch';end if;
  update public.notification_jobs set status='sent',provider_message_id='test:accepted' where dedupe_key='table-invitation:'||first_id;
  perform set_config('request.jwt.claim.sub',host_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',host_id,'role','authenticated')::text,true);execute 'set local role authenticated';
  if not exists(select 1 from public.list_my_table_invitation_delivery('community',cid) where invitation_id=first_id and delivery_status='sent') then raise exception 'Delivery projection not wired';end if;
  perform public.create_table_invitation_batch('community',cid,(select array_agg('rehearsal-'||n||'@hat-test.invalid') from generate_series(1,20)n),null);
  execute 'reset role';
  if (select count(*) from public.table_invitations where inviter_id=host_id and created_at>=now()-interval '24 hours' and status not in ('rejected','revoked','expired'))<>20 then raise exception 'Daily invitation limit was exceeded or not enforced';end if;
  -- Isolate the tagged pair without changing real accounts. All deletions roll back.
  delete from public.connections where user_low=least(one_id,two_id) and user_high=greatest(one_id,two_id);
  update public.profiles set visibility_paused=false where id in(one_id,two_id);
  insert into public.member_connection_preferences(user_id,request_mode) values(two_id,'open') on conflict(user_id) do update set request_mode='open';
  perform set_config('request.jwt.claim.sub',one_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',one_id,'role','authenticated')::text,true);execute 'set local role authenticated';
  connection_id:=public.request_connection_with_context(two_id,null,'We met during this isolated test rehearsal.');
  execute 'reset role';
  if not exists(select 1 from public.notification_jobs where user_id=two_id and dedupe_key like 'connection-request:'||connection_id||':%' and payload->>'href'='/members/'||one_id||'#connection-request' and payload->>'body' not like '%isolated test rehearsal%') then raise exception 'Named profile-link notification missing or private note copied into email';end if;
  perform set_config('request.jwt.claim.sub',two_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',two_id,'role','authenticated')::text,true);execute 'set local role authenticated';
  if not exists(select 1 from public.get_member_profile(one_id) where connection_status='pending' and phone is null and whatsapp_number is null) then raise exception 'Pending requester profile or private-contact boundary failed';end if;
  if public.get_connection_introduction(one_id)<>'We met during this isolated test rehearsal.' then raise exception 'Recipient could not read private introduction';end if;
  perform public.respond_to_connection(connection_id,'ignore');execute 'reset role';
  update public.connections set updated_at=now()-interval '31 days' where id=connection_id;
  perform set_config('request.jwt.claim.sub',one_id::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',one_id,'role','authenticated')::text,true);execute 'set local role authenticated';
  perform public.request_connection_with_context(two_id,null,'A later request after the normal waiting period.');execute 'reset role';
  -- The transaction clock is constant, so set a distinct generation for this test retry.
  update public.connections set status='cancelled',updated_at=now()-interval '8 days' where id=connection_id;
  update public.connections set status='pending',updated_at=now()+interval '1 millisecond' where id=connection_id;
  if (select count(*) from public.notification_jobs where user_id=two_id and dedupe_key like 'connection-request:'||connection_id||':%')<2 then raise exception 'Repeat request did not queue a fresh alert';end if;
  select count(*) into request_emails from public.notification_jobs where user_id=two_id and dedupe_key like 'connection-request:'||connection_id||':%';
  update public.notification_preferences set email_network=false where user_id=two_id;
  update public.connections set status='cancelled',updated_at=now()-interval '8 days' where id=connection_id;
  update public.connections set status='pending',updated_at=now()+interval '2 milliseconds' where id=connection_id;
  if (select count(*) from public.notification_jobs where user_id=two_id and dedupe_key like 'connection-request:'||connection_id||':%')<>request_emails then raise exception 'Connection email preference was ignored';end if;
  perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{"role":"anon"}',true);execute 'set local role anon';
  denied:=false;begin perform public.create_table_invitation_batch('community',cid,array['test@hat-test.invalid'],null);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Anonymous batch allowed';end if;
  execute 'reset role';
  insert into invitation_rehearsal_results values('PASS: private multi-email jobs, normalization, duplicate retries, self/invalid/ordinary/anonymous denial, real delivery projection, requester profile before acceptance, hidden private contacts, private note access and fresh repeat-request alerts. Everything rolls back; no external emails.');
end $$;
select * from invitation_rehearsal_results;
rollback;
