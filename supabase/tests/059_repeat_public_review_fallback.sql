-- TEST ONLY. Requires the open pilot; all synthetic records/notifications roll back.
begin;
create temporary table repeat_review_results(result text);
do $$
declare actor uuid;eid uuid:=gen_random_uuid();ids uuid[];first_start timestamptz:=now()+interval '30 days';
begin
 select id into strict actor from auth.users where email='community.host@hat-test.invalid';
 insert into public.community_pilot_access(user_id,source) values(actor,'existing_tester') on conflict(user_id)do nothing;
 insert into public.events(id,slug,title,summary,format,audience,status,starts_at,ends_at,registration_mode,created_by)
 values(eid,'repeat-review-test-'||eid,'[TEST] Public repeat fallback','Rollback-only repeat dates should still reach Admin review after the automatic limit.','virtual','public','published',now()+interval '14 days',now()+interval '14 days 1 hour','closed',actor);
 insert into public.event_hosts(event_id,user_id,assigned_by) values(eid,actor,actor);
 insert into public.member_event_proposals(proposed_by,title,summary,format,starts_at,ends_at,capacity,safety_contact_name,safety_contact_phone,host_experience,online_url,status,canonical_event_id,pilot_auto_draft)
 values(actor,'[TEST] Public repeat fallback','Rollback-only repeat dates should still reach Admin review after the automatic limit.','virtual',now()+interval '14 days',now()+interval '14 days 1 hour',20,'Test Host','+254700000000','I will welcome guests and help with introductions.','https://meet.google.com/abc-defg-hij','approved',eid,true),
 (actor,'[TEST] Existing automatic allowance','Rollback-only second previously approved automatic event fixture.','virtual',now()+interval '14 days',now()+interval '14 days 1 hour',20,'Test Host','+254700000000','I will welcome guests and help with introductions.','https://meet.google.com/abc-defg-hij','approved',null,true);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if not public.get_pilot_free_event_setting() then raise exception 'This rehearsal needs the active automatic pilot';end if;
 if public.get_repeat_event_auto_publish_setting() then raise exception 'Automatic limit ignored';end if;
 ids:=public.plan_repeat_events(eid,null,'weekly',2,first_start,gen_random_uuid());
 perform public.save_member_event_proposal(
  p_proposal_id=>ids[1],p_title=>'[TEST] Public repeat fallback',p_summary=>'Rollback-only repeat dates should still reach Admin review after the automatic limit.',
  p_format=>'virtual',p_starts_at=>first_start,p_ends_at=>first_start+interval '1 hour',p_timezone=>'Africa/Nairobi',
  p_venue_name=>null,p_city=>null,p_country=>'Kenya',p_address_line=>null,p_map_url=>null,p_online_url=>'https://meet.google.com/abc-defg-hij',
  p_capacity=>20,p_safety_contact_name=>'Test Host',p_safety_contact_phone=>'+254700000000',p_accessibility_notes=>null,
  p_host_experience=>'I will welcome guests and help with introductions.',p_host_note=>null,p_community_after_event=>false,p_community_idea=>null,p_submit=>true);
 execute 'reset role';
 if not exists(select 1 from public.member_event_proposals where id=ids[1] and status='submitted' and canonical_event_id is null and not pilot_auto_draft) then raise exception 'Extra repeat date did not reach review safely';end if;
 if exists(select 1 from public.events where slug='repeat-review-test-'||ids[1]) then raise exception 'Extra date published unexpectedly';end if;
 insert into repeat_review_results values('PASS: eligible Host at two-event limit sees manual-review mode; later weekly repeat submits to the existing Admin queue with optional notes blank and without automatic publication.');
end;$$;
select * from repeat_review_results;
rollback;
