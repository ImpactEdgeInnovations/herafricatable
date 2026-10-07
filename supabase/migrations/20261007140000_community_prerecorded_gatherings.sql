begin;
alter table public.community_gathering_videos add column content_kind text not null default 'scheduled'
  check(content_kind in ('scheduled','prerecorded'));

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
    'admin_paused',item.admin_paused,'updated_at',item.updated_at,'viewing_mode',item.viewing_mode,'content_kind',item.content_kind);
end;
$$;

create function public.get_community_gathering_content_kind(p_room_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_access_community_video(p_room_id) then raise exception 'Active Community membership required'; end if;
  return coalesce((select content_kind from public.community_gathering_videos where room_id=p_room_id),'scheduled');
end;
$$;

create or replace function public.save_community_gathering_video_experience(
  p_room_id uuid,p_video_id text,p_is_visible boolean,p_keep_replay boolean,p_viewing_mode text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.community_gathering_rooms; saved uuid; event_title text;
begin
  if p_viewing_mode is null or p_viewing_mode not in ('watch_together','watch_anytime') then raise exception 'Choose how members will watch'; end if;
  perform public.save_community_gathering_video(p_room_id,p_video_id,p_is_visible,p_keep_replay);
  if p_viewing_mode<>'watch_anytime' and exists(select 1 from public.community_gathering_videos where room_id=p_room_id and content_kind='prerecorded') then
    raise exception 'Prerecorded videos use a lasting conversation'; end if;
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

create function public.create_community_video_discussion(
  p_community_id uuid,p_request_id uuid,p_title text,p_summary text,p_video_id text,p_permission_confirmed boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare community public.communities; saved_slug text; rid uuid; event_id uuid; owner_id uuid; recipient uuid;
begin
  if auth.uid() is null or not public.is_active_member(auth.uid()) or not public.communities_enabled()
    or not public.can_manage_community(p_community_id) then raise exception 'Active Community Host access required'; end if;
  select * into community from public.communities where id=p_community_id for update;
  if not found or community.status<>'published' then raise exception 'Your Community must be open first'; end if;
  -- Pilot-created Communities retain the existing first-cohort and global pause controls.
  select publication.owner_id into owner_id from public.community_pilot_publications publication where publication.community_id=p_community_id;
  if found and (not public.community_pilot_member_ready(auth.uid()) or not public.get_pilot_free_event_setting()) then
    raise exception 'Automatic pilot gatherings are paused or your pilot access has ended'; end if;
  if p_request_id is null then raise exception 'Start a new video discussion'; end if;
  select event.id,event.slug,room.id into event_id,saved_slug,rid
    from public.events event join public.community_gathering_rooms room on room.event_id=event.id
    join public.community_gathering_videos video on video.room_id=room.id
    where event.id=p_request_id and event.created_by=auth.uid() and room.community_id=p_community_id
      and video.content_kind='prerecorded';
  if found then return jsonb_build_object('event_slug',saved_slug,'event_id',event_id,'room_id',rid,'community_slug',community.slug); end if;
  if char_length(btrim(coalesce(p_title,''))) not between 4 and 140 then raise exception 'Add a name between 4 and 140 characters'; end if;
  if char_length(btrim(coalesce(p_summary,''))) not between 20 and 2000 then raise exception 'Add a short description of at least 20 characters'; end if;
  if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'Add an individual YouTube video link'; end if;
  if p_permission_confirmed is distinct from true then raise exception 'Confirm you have permission to share this video'; end if;
  saved_slug := 'community-video-'||p_request_id::text;
  -- A recording is available now, not a future public event or a ticketed session.
  insert into public.events(id,slug,title,summary,format,status,starts_at,ends_at,timezone,registration_mode,audience,is_featured,created_by,updated_by)
    values(p_request_id,saved_slug,btrim(p_title),btrim(p_summary),'virtual','completed',now()-interval '1 second',now(),
      'Africa/Nairobi','closed','community',false,auth.uid(),auth.uid());
  insert into public.community_event_links(community_id,event_id,linked_by) values(p_community_id,p_request_id,auth.uid());
  select room.id into rid from public.community_gathering_rooms room where room.community_id=p_community_id and room.event_id=p_request_id;
  perform public.save_community_gathering_video_experience(rid,p_video_id,true,true,'watch_anytime');
  update public.community_gathering_videos set content_kind='prerecorded' where room_id=rid;
  update public.community_gathering_rooms set chat_mode='closed',chat_enabled=false where id=rid;
  for recipient in select user_id from public.community_memberships where community_id=p_community_id
    and status='active' and user_id<>auth.uid() and not public.is_blocked_pair(auth.uid(),user_id)
  loop
    perform public.enqueue_notification(recipient,'event','A new Community video',btrim(p_title),
      '/communities/'||community.slug||'?view=gatherings&gatheringArea=videos&gathering='||saved_slug,
      'community-video:'||p_request_id::text||':'||recipient::text);
  end loop;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'community.video_discussion_created','community_gathering_room',rid,
      jsonb_build_object('community_id',p_community_id,'event_id',p_request_id,'permission_confirmed',true));
  return jsonb_build_object('event_slug',saved_slug,'event_id',p_request_id,'room_id',rid,'community_slug',community.slug);
end;
$$;
revoke all on function public.get_community_gathering_content_kind(uuid),
  public.create_community_video_discussion(uuid,uuid,text,text,text,boolean) from public,anon;
grant execute on function public.get_community_gathering_content_kind(uuid),
  public.create_community_video_discussion(uuid,uuid,text,text,text,boolean) to authenticated;
commit;
