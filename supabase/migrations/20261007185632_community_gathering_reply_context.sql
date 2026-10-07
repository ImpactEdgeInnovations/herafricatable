begin;

alter table public.community_posts add column if not exists in_reply_to_id uuid references public.community_posts(id) on delete set null;
alter table public.community_gathering_messages add column if not exists in_reply_to_id uuid references public.community_gathering_messages(id) on delete set null;

-- Reuse the original write paths for membership, limits, moderation and notifications.
create or replace function public.reply_to_community_gathering_reply(p_room_id uuid,p_body text,p_reply_to_comment_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare discussion jsonb; target public.community_posts; saved uuid;
begin
  discussion:=public.get_community_gathering_discussion(p_room_id);
  select * into target from public.community_posts where id=p_reply_to_comment_id
    and parent_post_id=(discussion->>'post_id')::uuid and status='published';
  if not found or not public.is_active_member(target.author_id) or public.is_blocked_pair(auth.uid(),target.author_id) then
    raise exception 'That reply is no longer available'; end if;
  saved:=public.reply_to_community_gathering(p_room_id,p_body);
  update public.community_posts set in_reply_to_id=p_reply_to_comment_id where id=saved;
  return saved;
end; $$;

create or replace function public.reply_to_community_gathering_message(p_room_id uuid,p_body text,p_reply_to_message_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare target public.community_gathering_messages; saved uuid;
begin
  if not public.is_active_member(auth.uid()) or not public.can_access_community_gathering(p_room_id) then raise exception 'Gathering unavailable'; end if;
  select * into target from public.community_gathering_messages where id=p_reply_to_message_id and room_id=p_room_id and status='published';
  if not found or not public.is_active_member(target.author_id) or public.is_blocked_pair(auth.uid(),target.author_id) then
    raise exception 'That message is no longer available'; end if;
  saved:=public.send_community_gathering_message(p_room_id,p_body);
  update public.community_gathering_messages set in_reply_to_id=p_reply_to_message_id where id=saved;
  return saved;
end; $$;

create or replace function public.list_community_gathering_chat(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_active_member(auth.uid()) or not public.can_access_community_gathering(p_room_id) then raise exception 'Gathering unavailable'; end if;
  with latest as (
    select m.* from public.community_gathering_messages m
    where m.room_id=p_room_id and m.status='published' and public.is_active_member(m.author_id)
      and not public.is_blocked_pair(auth.uid(),m.author_id)
    order by m.created_at desc,m.id desc limit 200
  ) select coalesce(jsonb_agg(jsonb_build_object(
    'message_id',m.id,'author_id',m.author_id,'author_name',p.display_name,'author_avatar_url',p.avatar_url,
    'body',m.body,'is_pinned',m.is_pinned,'created_at',m.created_at,
    'reply_to',case when quoted.id is not null then jsonb_build_object('author_name',qp.display_name,'body',left(quoted.body,160)) end
  ) order by m.is_pinned desc,m.created_at,m.id),'[]'::jsonb) into result
  from latest m join public.profiles p on p.id=m.author_id
  left join public.community_gathering_messages quoted on quoted.id=m.in_reply_to_id and quoted.room_id=m.room_id
    and quoted.status='published' and public.is_active_member(quoted.author_id) and not public.is_blocked_pair(auth.uid(),quoted.author_id)
  left join public.profiles qp on qp.id=quoted.author_id;
  return result;
end; $$;

create or replace function public.get_community_host_identity(p_community_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.communities_enabled() or not public.is_active_member(auth.uid())
    or not exists(select 1 from public.community_memberships m where m.community_id=p_community_id and m.user_id=auth.uid() and m.status='active') then
    raise exception 'Active Community membership required'; end if;
  return (select jsonb_build_object('user_id',p.id,'display_name',p.display_name)
    from public.community_memberships m join public.profiles p on p.id=m.user_id
    where m.community_id=p_community_id and m.role='owner' and m.status='active' and p.access_status='active' limit 1);
end; $$;

-- Keep gathering discussions out of ordinary topic feeds; their records/replies are retained.
do $$
declare signature regprocedure; definition text; updated text;
begin
  foreach signature in array array[
    'public.list_community_posts(uuid,integer,integer)'::regprocedure,
    'public.list_community_conversations(uuid,text,integer,integer)'::regprocedure,
    'public.list_community_conversation_page(uuid,boolean,timestamptz,uuid,integer)'::regprocedure,
    'public.search_community_conversation_page(uuid,boolean,timestamptz,uuid,integer,text,text,text)'::regprocedure
  ] loop
    definition:=pg_get_functiondef(signature);
    if definition not like '%post.parent_post_id is null%' then raise exception 'Unexpected feed definition: %',signature; end if;
    updated:=replace(definition,'post.parent_post_id is null',
      'post.parent_post_id is null and not exists (select 1 from public.community_gathering_discussions gathering_thread where gathering_thread.post_id=post.id)');
    execute updated;
  end loop;
  definition:=pg_get_functiondef('public.get_community_gathering_discussion(uuid,uuid)'::regprocedure);
  if definition not like '%''body'',body,''created_at'',created_at)%' then raise exception 'Unexpected discussion definition'; end if;
  updated:=replace(definition,'''body'',body,''created_at'',created_at)',
    '''body'',body,''created_at'',created_at,''reply_to'',(select jsonb_build_object(''author_name'',qp.display_name,''body'',left(q.body,160)) from public.community_posts own_reply join public.community_posts q on q.id=own_reply.in_reply_to_id join public.profiles qp on qp.id=q.author_id where own_reply.id=numbered.id and q.parent_post_id=parent.id and q.status=''published'' and qp.access_status=''active'' and not public.is_blocked_pair(auth.uid(),q.author_id)))');
  execute updated;
end; $$;

revoke all on function public.reply_to_community_gathering_reply(uuid,text,uuid) from public,anon;
revoke all on function public.reply_to_community_gathering_message(uuid,text,uuid) from public,anon;
revoke all on function public.list_community_gathering_chat(uuid) from public,anon;
revoke all on function public.get_community_host_identity(uuid) from public,anon;
grant execute on function public.reply_to_community_gathering_reply(uuid,text,uuid),public.reply_to_community_gathering_message(uuid,text,uuid),public.list_community_gathering_chat(uuid),public.get_community_host_identity(uuid) to authenticated;
commit;
