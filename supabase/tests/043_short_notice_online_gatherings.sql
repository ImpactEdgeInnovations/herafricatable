-- Acceptance rehearsal only. Every event, album and queued notification is rolled back.
begin;
create temporary table short_notice_results(result text);
do $$
declare cid uuid; owner_id uuid; draft_id uuid; v_event_id uuid; v_room_id uuid; album_id uuid; repeated uuid; rejected boolean;
begin
  select c.id, m.user_id into strict cid, owner_id
  from public.communities c join public.community_memberships m on m.community_id=c.id and m.role='owner' and m.status='active'
  where c.slug='lavington-women' and c.status='published';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  draft_id := public.save_community_event_proposal(
    p_proposal_id=>null,p_community_id=>cid,p_title=>'Online acceptance rehearsal',
    p_summary=>'A rollback-only private discussion to verify short-notice online gathering publication.',
    p_format=>'virtual',p_starts_at=>now()+interval '1 hour',p_ends_at=>now()+interval '2 hours',p_timezone=>'Africa/Nairobi',
    p_venue_name=>null,p_city=>null,p_country=>'Kenya',p_address_line=>null,p_map_url=>null,p_online_url=>null,p_capacity=>20,
    p_safety_contact_name=>'Test Host',p_safety_contact_phone=>'+254700000000',p_accessibility_notes=>null,p_host_note=>null,p_submit=>false);
  v_event_id := public.publish_community_gathering(draft_id);
  repeated := public.publish_community_gathering(draft_id);
  if repeated<>v_event_id then raise exception 'Publication is not idempotent'; end if;
  if not exists(select 1 from public.events e where e.id=v_event_id and e.audience='community' and e.status='published') then raise exception 'Gathering leaked to public or was not published'; end if;
  select r.id into strict v_room_id from public.community_gathering_rooms r where r.community_id=cid and r.event_id=v_event_id;
  if not public.can_access_community_gathering(v_room_id) then raise exception 'Host cannot enter published room'; end if;
  perform public.set_community_event_link(cid,v_event_id,true,false);
  if not exists(select 1 from public.list_community_programming_options(cid) option where option.item_id=v_event_id and option.is_linked) then raise exception 'Event link action did not persist'; end if;
  perform public.save_community_gathering_video_experience(v_room_id,'dQw4w9WgXcQ',true,true,'watch_together');
  album_id := public.create_community_photo_album(cid,gen_random_uuid(),'Gathering acceptance album','Rollback-only linked album',v_room_id);
  if not exists(select 1 from public.community_photo_albums a where a.id=album_id and a.room_id=v_room_id) then raise exception 'Album did not retain gathering context'; end if;

  draft_id := public.save_community_event_proposal(
    p_proposal_id=>null,p_community_id=>cid,p_title=>'Online link acceptance rehearsal',
    p_summary=>'A rollback-only private discussion to verify that a meeting link reaches its gathering room.',
    p_format=>'virtual',p_starts_at=>now()+interval '1 hour',p_ends_at=>now()+interval '2 hours',p_timezone=>'Africa/Nairobi',
    p_venue_name=>null,p_city=>null,p_country=>'Kenya',p_address_line=>null,p_map_url=>null,p_online_url=>'https://meet.google.com/abc-defg-hij',p_capacity=>20,
    p_safety_contact_name=>'Test Host',p_safety_contact_phone=>'+254700000000',p_accessibility_notes=>null,p_host_note=>null,p_submit=>false);
  v_event_id := public.publish_community_gathering(draft_id);
  if not exists(select 1 from public.community_gathering_rooms r where r.event_id=v_event_id and r.meeting_provider='google_meet' and r.meeting_url='https://meet.google.com/abc-defg-hij') then raise exception 'Meeting link lost during publication'; end if;
  update public.community_event_proposals set status='draft',canonical_event_id=null,starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour' where id=draft_id;
  rejected:=false;
  begin perform public.publish_community_gathering(draft_id); exception when others then if sqlerrm like '%future start time%' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'Past online gathering accepted'; end if;
  update public.community_event_proposals set format='in_person',venue_name='Test venue',city='Nairobi',starts_at=now()+interval '1 hour',ends_at=now()+interval '2 hours' where id=draft_id;
  rejected:=false;
  begin perform public.publish_community_gathering(draft_id); exception when others then if sqlerrm like '%in-person gathering at least 24 hours%' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'In-person notice rule removed'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  rejected:=false;
  begin perform public.publish_community_gathering(draft_id); exception when others then if sqlerrm like '%owner or moderator required%' then rejected:=true; else raise; end if; end;
  if not rejected or has_function_privilege('anon','public.publish_community_gathering(uuid)','EXECUTE') then raise exception 'Unauthorised publication permitted'; end if;
  insert into short_notice_results values('PASS: one-hour text gathering, idempotency, private audience, Host room access, embedded video, linked album, meeting-link handoff, past-time denial, in-person notice and unauthorised denial');
end;
$$;
select * from short_notice_results;
rollback;
