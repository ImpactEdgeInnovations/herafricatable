-- TEST ONLY, NOT A MIGRATION. Metadata-only fixtures; all changes roll back.
begin;
create temporary table gathering_protection_results(result text);
do $$
declare host_id uuid; cid uuid; eid uuid;
 v_room_id uuid; v_child_id uuid; kind text; denied boolean;
begin
 select u.id into strict host_id from auth.users u join public.profiles p on p.id=u.id
  where u.email='community.host@hat-test.invalid' and p.access_status='active';
 foreach kind in array array['message','question','video','discussion','album','meeting','recap','chat'] loop
 cid:=gen_random_uuid();eid:=gen_random_uuid();
 insert into public.communities(id,slug,name,description,community_type,status,created_by)
  values(cid,'content-rehearsal-'||cid,'[TEST] Content protection','Rollback-only gathering content protection.','private','draft',host_id);
 insert into public.community_memberships(community_id,user_id,role,status) values(cid,host_id,'owner','active');
 insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,created_by)
  values(eid,'content-rehearsal-'||eid,'[TEST] Content protection','virtual','public','published',now()+interval '7 days',now()+interval '7 days 1 hour','closed',host_id);
 perform set_config('request.jwt.claim.sub',host_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',host_id,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 perform public.set_community_event_link(cid,eid,true,false);
 execute 'reset role';
 select id into strict v_room_id from public.community_gathering_rooms where community_id=cid and event_id=eid;
  v_child_id:=gen_random_uuid();
  case kind
   when 'message' then insert into public.community_gathering_messages(id,room_id,community_id,event_id,author_id,body)
    values(v_child_id,v_room_id,cid,eid,host_id,'Rollback-only test message');
   when 'question' then insert into public.community_gathering_questions(id,room_id,author_id,body)
    values(v_child_id,v_room_id,host_id,'Rollback-only test question');
   when 'video' then insert into public.community_gathering_videos(room_id,video_id) values(v_room_id,'dQw4w9WgXcQ');
   when 'discussion' then
    insert into public.community_posts(id,community_id,author_id,body) values(v_child_id,cid,host_id,'Rollback-only discussion');
    insert into public.community_gathering_discussions(room_id,post_id) values(v_room_id,v_child_id);
   when 'album' then insert into public.community_photo_albums(id,community_id,room_id,title,created_by)
    values(v_child_id,cid,v_room_id,'Rollback-only album',host_id);
   when 'meeting' then update public.community_gathering_rooms set meeting_url='https://meet.google.com/abc-defg-hij' where id=v_room_id;
   when 'recap' then update public.community_gathering_rooms set recap_body='Rollback-only recap content.' where id=v_room_id;
   when 'chat' then update public.community_gathering_rooms set chat_enabled=false where id=v_room_id;
  end case;
  execute 'set local role authenticated';
  denied:=false;
  begin perform public.set_community_event_link(cid,eid,false,false);
  exception when others then if sqlerrm like 'This gathering already has member activity%' then denied:=true;else raise;end if;end;
  if not denied then raise exception 'Unlink removed gathering with % content',kind;end if;
  execute 'reset role';
  if not exists(select 1 from public.community_gathering_rooms where id=v_room_id) then raise exception 'Original room was lost';end if;
 end loop;
 insert into gathering_protection_results values('PASS: unlink independently protects messages, questions, video, discussions, albums, meeting links, recap and closed-chat settings. No file delivered or email sent.');
end;
$$;
select * from gathering_protection_results;
rollback;
