begin;

alter table public.community_gathering_videos add column viewing_mode text not null default 'watch_together'
  check (viewing_mode in ('watch_together','watch_anytime'));
create table public.community_gathering_discussions (
  room_id uuid primary key references public.community_gathering_rooms(id) on delete cascade,
  post_id uuid not null unique references public.community_posts(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.community_gathering_discussions enable row level security;
revoke all on public.community_gathering_discussions from public, anon, authenticated;
create index community_gathering_reply_cursor_idx on public.community_posts(parent_post_id,created_at desc,id desc)
  where parent_post_id is not null;

create or replace function public.get_community_gathering_video(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item public.community_gathering_videos; target public.community_gathering_rooms; host boolean;
begin
  if not public.can_access_community_video(p_room_id) then raise exception 'Active Community membership required'; end if;
  select * into target from public.community_gathering_rooms where id=p_room_id;
  host := public.can_manage_community(target.community_id);
  select * into item from public.community_gathering_videos where room_id=p_room_id;
  if not found then return null; end if;
  if not host and (item.video_id is null or not item.is_visible or item.admin_paused
    or (not item.keep_replay and now() > (select ends_at from public.events where id=target.event_id))) then return null; end if;
  return jsonb_build_object('video_id',item.video_id,'is_visible',item.is_visible,'keep_replay',item.keep_replay,
    'admin_paused',item.admin_paused,'updated_at',item.updated_at,'viewing_mode',item.viewing_mode);
end;
$$;

create function public.save_community_gathering_video_experience(
  p_room_id uuid,p_video_id text,p_is_visible boolean,p_keep_replay boolean,p_viewing_mode text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.community_gathering_rooms; saved uuid; event_title text;
begin
  if p_viewing_mode is null or p_viewing_mode not in ('watch_together','watch_anytime') then raise exception 'Choose how members will watch'; end if;
  -- The existing save locks the room and checks active Host access. Keep its Admin pause behaviour.
  perform public.save_community_gathering_video(p_room_id,p_video_id,p_is_visible,p_keep_replay);
  select * into target from public.community_gathering_rooms where id=p_room_id;
  update public.community_gathering_videos set viewing_mode=p_viewing_mode where room_id=p_room_id;
  if p_viewing_mode='watch_anytime' and nullif(btrim(p_video_id),'') is not null
    and not exists(select 1 from public.community_gathering_discussions where room_id=p_room_id) then
    select title into event_title from public.events where id=target.event_id;
    saved := public.create_community_post(target.community_id,
      left(event_title,500)||E'\n\nWatch the video in this gathering and share your questions or thoughts here.');
    insert into public.community_gathering_discussions(room_id,post_id) values(p_room_id,saved);
    insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
      values(auth.uid(),'community.gathering_discussion_created','community_gathering_room',p_room_id,jsonb_build_object('post_id',saved));
  end if;
  return public.get_community_gathering_video(p_room_id);
end;
$$;

create function public.get_community_gathering_discussion(p_room_id uuid,p_before uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare parent public.community_posts; target public.community_gathering_rooms; cursor_time timestamptz;
  replies jsonb; more boolean; locked boolean;
begin
  if not public.can_access_community_video(p_room_id) then raise exception 'Active Community membership required'; end if;
  select * into target from public.community_gathering_rooms where id=p_room_id;
  select post.* into parent from public.community_gathering_discussions d join public.community_posts post on post.id=d.post_id where d.room_id=p_room_id;
  if not found then return null; end if;
  if parent.status <> 'published' or public.is_blocked_pair(auth.uid(),parent.author_id)
    or not public.is_active_member(parent.author_id) then return jsonb_build_object('unavailable',true); end if;
  if p_before is not null then
    select created_at into cursor_time from public.community_posts where id=p_before and parent_post_id=parent.id;
    if not found then raise exception 'Reply cursor not found'; end if;
  end if;
  with page as (
    select reply.id,reply.author_id,profile.display_name author_name,reply.body,reply.created_at
    from public.community_posts reply join public.profiles profile on profile.id=reply.author_id
    where reply.parent_post_id=parent.id and reply.status='published' and profile.access_status='active'
      and not public.is_blocked_pair(auth.uid(),reply.author_id)
      and (p_before is null or (reply.created_at,reply.id)<(cursor_time,p_before))
    order by reply.created_at desc,reply.id desc limit 51
  ), numbered as (select *,row_number() over(order by created_at desc,id desc) n from page)
  select coalesce(jsonb_agg(jsonb_build_object('comment_id',id,'author_id',author_id,'author_name',author_name,
    'body',body,'created_at',created_at) order by created_at,id) filter(where n<=50),'[]'::jsonb),count(*)>50
    into replies,more from numbered;
  locked := exists(select 1 from public.community_cohorts where community_id=target.community_id
    and (status<>'active' or (follow_up_until is not null and follow_up_until<=now())));
  return jsonb_build_object('post_id',parent.id,'body',parent.body,'comments',replies,'has_more',more,'read_only',locked);
end;
$$;

create function public.reply_to_community_gathering(p_room_id uuid,p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare discussion jsonb;
begin
  discussion := public.get_community_gathering_discussion(p_room_id);
  if discussion is null or coalesce((discussion->>'unavailable')::boolean,false) then raise exception 'This conversation is no longer available'; end if;
  if (discussion->>'read_only')::boolean then raise exception 'This Community is read only'; end if;
  -- Reuse rate limits, blocked-pair checks, notifications and moderation records.
  return public.create_community_comment((discussion->>'post_id')::uuid,p_body);
end;
$$;

revoke all on function public.save_community_gathering_video_experience(uuid,text,boolean,boolean,text),
  public.get_community_gathering_discussion(uuid,uuid),public.reply_to_community_gathering(uuid,text) from public,anon;
grant execute on function public.save_community_gathering_video_experience(uuid,text,boolean,boolean,text),
  public.get_community_gathering_discussion(uuid,uuid),public.reply_to_community_gathering(uuid,text) to authenticated;
commit;
