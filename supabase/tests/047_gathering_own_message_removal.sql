-- Rollback-only acceptance. This is NOT a migration.
begin;
create temporary table own_message_results(result text);
do $$
declare cid uuid; owner_id uuid; member_id uuid; rid uuid; own_id uuid; other_id uuid; reply_id uuid; denied boolean; payload jsonb; audit_count bigint;
begin
  select c.id,m.user_id into strict cid,owner_id from public.communities c
    join public.community_memberships m on m.community_id=c.id and m.role='owner' and m.status='active'
    where c.slug='lavington-women' and c.status='published';
  select p.id into strict member_id from public.profiles p where p.id<>owner_id and public.is_active_member(p.id) limit 1;
  insert into public.community_memberships(community_id,user_id,role,status) values(cid,member_id,'member','active')
    on conflict(community_id,user_id) do update set role='member',status='active';
  select id into strict rid from public.community_gathering_rooms where community_id=cid limit 1;
  update public.community_gathering_rooms set chat_enabled=true,chat_mode='open',chat_opens_at=now()-interval '1 hour',chat_closes_at=now()+interval '1 hour' where id=rid;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_id,'role','authenticated')::text,true);
  other_id:=public.send_community_gathering_message(rid,'Rollback Host message');
  perform set_config('request.jwt.claim.sub',member_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',member_id,'role','authenticated')::text,true);
  own_id:=public.send_community_gathering_message(rid,'Rollback ordinary member message');
  reply_id:=public.reply_to_community_gathering_message(rid,'Rollback directed reply',own_id);
  denied:=false; begin perform public.remove_my_community_gathering_message(other_id); exception when others then denied:=true; end;
  if not denied then raise exception 'Another author message was removable'; end if;
  update public.profiles set access_status='suspended' where id=member_id;
  denied:=false; begin perform public.remove_my_community_gathering_message(own_id); exception when others then denied:=true; end;
  if not denied then raise exception 'Suspended member bypassed current access'; end if;
  update public.profiles set access_status='active' where id=member_id;
  update public.community_gathering_messages set is_pinned=true,pinned_by=owner_id,pinned_at=now() where id=own_id;
  perform public.remove_my_community_gathering_message(own_id);
  if not exists(select 1 from public.community_gathering_messages where id=own_id and status='removed' and not is_pinned and pinned_by is null and body='[Removed by its author]') then raise exception 'Removal or pin cleanup failed'; end if;
  payload:=public.list_community_gathering_chat(rid);
  if exists(select 1 from jsonb_array_elements(payload) x where x->>'message_id'=own_id::text or (x->>'message_id'=reply_id::text and x->'reply_to'<>'null'::jsonb)) then raise exception 'Removed message or quote remained visible'; end if;
  select count(*) into audit_count from public.audit_events where target_id=own_id and action='community.gathering_message_author_removed';
  perform public.remove_my_community_gathering_message(own_id);
  if (select count(*) from public.audit_events where target_id=own_id and action='community.gathering_message_author_removed')<>audit_count then raise exception 'Retry duplicated audit'; end if;
  if has_function_privilege('anon','public.remove_my_community_gathering_message(uuid)','execute') then raise exception 'Anonymous function privilege'; end if;
  insert into own_message_results values('PASS: ordinary member own removal, other-author denial, suspended access denial, pin cleanup, hidden quotes and retry-safe audit');
end; $$;
select * from own_message_results;
rollback;
