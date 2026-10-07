-- Acceptance only. Do not run this file as a migration. All writes roll back.
begin;
create temporary table gathering_reply_results(result text);
do $$
declare cid uuid; owner_id uuid; room_id uuid; live_room uuid; parent_id uuid; first_reply uuid; second_reply uuid; first_message uuid; second_message uuid; payload jsonb; denied boolean;
begin
  select c.id,m.user_id into strict cid,owner_id from public.communities c
    join public.community_memberships m on m.community_id=c.id and m.role='owner' and m.status='active'
    where c.slug='lavington-women' and c.status='published';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  select d.room_id,d.post_id into strict room_id,parent_id from public.community_gathering_discussions d
    join public.community_gathering_rooms r on r.id=d.room_id where r.community_id=cid limit 1;
  if exists(select 1 from public.list_community_posts(cid) p where p.post_id=parent_id)
    or exists(select 1 from public.list_community_conversations(cid) p where p.post_id=parent_id)
    or exists(select 1 from public.list_community_conversation_page(cid) p where p.post_id=parent_id)
    or exists(select 1 from public.search_community_conversation_page(cid) p where p.post_id=parent_id) then
    raise exception 'Gathering discussion still duplicates an ordinary topic'; end if;
  if (public.get_community_host_identity(cid)->>'user_id')::uuid<>owner_id then raise exception 'Incorrect Community Host'; end if;
  first_reply:=public.reply_to_community_gathering(room_id,'Rollback acceptance original reply');
  second_reply:=public.reply_to_community_gathering_reply(room_id,'Rollback acceptance directed reply',first_reply);
  payload:=public.get_community_gathering_discussion(room_id);
  if not exists(select 1 from jsonb_array_elements(payload->'comments') c where c->>'comment_id'=second_reply::text
    and c->'reply_to'->>'body'='Rollback acceptance original reply') then raise exception 'Directed reply context missing'; end if;
  perform public.delete_community_comment(first_reply);
  payload:=public.get_community_gathering_discussion(room_id);
  if exists(select 1 from jsonb_array_elements(payload->'comments') c where c->>'comment_id'=second_reply::text and c->'reply_to'<>'null'::jsonb) then raise exception 'Removed quoted reply exposed'; end if;
  denied:=false; begin perform public.reply_to_community_gathering_reply(room_id,'Cannot reply to removed content',first_reply); exception when others then denied:=sqlerrm like '%no longer available%'; end;
  if not denied then raise exception 'Removed reply accepted'; end if;
  select r.id into strict live_room from public.community_gathering_rooms r where r.community_id=cid and r.id<>room_id limit 1;
  update public.community_gathering_rooms set chat_enabled=true,chat_mode='open',questions_open_at=now()-interval '2 hours',chat_opens_at=now()-interval '1 hour',chat_closes_at=now()+interval '1 hour' where id=live_room;
  first_message:=public.send_community_gathering_message(live_room,'Rollback acceptance original live message');
  second_message:=public.reply_to_community_gathering_message(live_room,'Rollback acceptance directed live message',first_message);
  payload:=public.list_community_gathering_chat(live_room);
  if not exists(select 1 from jsonb_array_elements(payload) c where c->>'message_id'=second_message::text and c->'reply_to'->>'body'='Rollback acceptance original live message') then raise exception 'Live reply context missing'; end if;
  denied:=false; begin perform public.reply_to_community_gathering_message(room_id,'Wrong room must not work',first_message); exception when others then denied:=sqlerrm like '%no longer available%'; end;
  if not denied then raise exception 'Cross-room live reply accepted'; end if;
  update public.community_gathering_messages set status='removed' where id=first_message;
  payload:=public.list_community_gathering_chat(live_room);
  if exists(select 1 from jsonb_array_elements(payload) c where c->>'message_id'=second_message::text and c->'reply_to'<>'null'::jsonb) then raise exception 'Removed live quote exposed'; end if;
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  denied:=false; begin perform public.list_community_gathering_chat(live_room); exception when others then denied:=true; end;
  if not denied or has_function_privilege('anon','public.list_community_gathering_chat(uuid)','execute') or has_function_privilege('anon','public.reply_to_community_gathering_reply(uuid,text,uuid)','execute') then raise exception 'Unauthorised gathering reply access'; end if;
  insert into gathering_reply_results values('PASS: gathering-only placement, correct Host, directed replies, retained reply context, removed quote privacy, same-room live replies and anonymous denial');
end; $$;
select * from gathering_reply_results;
rollback;
