begin;

create table public.community_gathering_videos (
  room_id uuid primary key references public.community_gathering_rooms(id) on delete cascade,
  video_id text check (video_id is null or video_id ~ '^[A-Za-z0-9_-]{11}$'),
  is_visible boolean not null default true,
  keep_replay boolean not null default true,
  admin_paused boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.community_gathering_videos enable row level security;
revoke all on public.community_gathering_videos from public, anon, authenticated;

create function public.can_access_community_video(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists(select 1 from public.profiles where id = auth.uid() and access_status = 'active')
    and exists (
      select 1 from public.community_gathering_rooms r
      join public.communities c on c.id = r.community_id
      where r.id = p_room_id and c.status = 'published'
        and public.can_access_community_gathering(r.id)
    );
$$;
revoke all on function public.can_access_community_video(uuid) from public, anon;
grant execute on function public.can_access_community_video(uuid) to authenticated;

create function public.get_community_gathering_video(p_room_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item public.community_gathering_videos; target public.community_gathering_rooms; host boolean;
begin
  if not public.can_access_community_video(p_room_id) then
    raise exception 'Active Community membership required';
  end if;
  select * into target from public.community_gathering_rooms where id = p_room_id;
  host := public.can_manage_community(target.community_id);
  select * into item from public.community_gathering_videos where room_id = p_room_id;
  if not found then return null; end if;
  if not host and (item.video_id is null or not item.is_visible or item.admin_paused
    or (not item.keep_replay and now() > (select ends_at from public.events where id = target.event_id))) then
    return null;
  end if;
  return jsonb_build_object('video_id',item.video_id,'is_visible',item.is_visible,
    'keep_replay',item.keep_replay,'admin_paused',item.admin_paused,'updated_at',item.updated_at);
end;
$$;

create function public.save_community_gathering_video(
  p_room_id uuid, p_video_id text, p_is_visible boolean, p_keep_replay boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.community_gathering_rooms; clean_id text := nullif(btrim(p_video_id),'');
begin
  select * into target from public.community_gathering_rooms where id = p_room_id for update;
  if not found or not public.can_access_community_video(p_room_id)
    or not public.can_manage_community(target.community_id) then
    raise exception 'Active Community Host access required';
  end if;
  if clean_id is not null and clean_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Add a valid YouTube video link';
  end if;
  if p_is_visible is null or p_keep_replay is null then raise exception 'Choose video visibility'; end if;
  insert into public.community_gathering_videos(room_id,video_id,is_visible,keep_replay,updated_by)
    values(p_room_id,clean_id,p_is_visible,p_keep_replay,auth.uid())
    on conflict(room_id) do update set video_id=excluded.video_id,is_visible=excluded.is_visible,
      keep_replay=excluded.keep_replay,updated_by=auth.uid(),updated_at=now();
  -- Do not overwrite admin_paused: Hosts cannot undo an Admin pause.
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'community.gathering_video_saved','community_gathering_room',p_room_id,
      jsonb_build_object('has_video',clean_id is not null,'is_visible',p_is_visible,'keep_replay',p_keep_replay));
  return public.get_community_gathering_video(p_room_id);
end;
$$;

create function public.list_community_gathering_video_controls()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('room_id',v.room_id,'title',e.title,
    'community_name',c.name,'admin_paused',v.admin_paused,'is_visible',v.is_visible)
    order by v.updated_at desc)
    from public.community_gathering_videos v
    join public.community_gathering_rooms r on r.id=v.room_id
    join public.events e on e.id=r.event_id join public.communities c on c.id=r.community_id
    where v.video_id is not null),'[]'::jsonb);
end;
$$;

create function public.pause_community_gathering_video(p_room_id uuid,p_paused boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;
  if p_paused is null then raise exception 'Choose pause or resume'; end if;
  update public.community_gathering_videos set admin_paused=p_paused,updated_at=now() where room_id=p_room_id;
  if not found then raise exception 'Video not found'; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'community.gathering_video_paused','community_gathering_room',p_room_id,
      jsonb_build_object('paused',p_paused));
end;
$$;

revoke all on function public.get_community_gathering_video(uuid) from public, anon;
revoke all on function public.save_community_gathering_video(uuid,text,boolean,boolean) from public, anon;
revoke all on function public.list_community_gathering_video_controls() from public, anon;
revoke all on function public.pause_community_gathering_video(uuid,boolean) from public, anon;
grant execute on function public.get_community_gathering_video(uuid),
  public.save_community_gathering_video(uuid,text,boolean,boolean),
  public.list_community_gathering_video_controls(),
  public.pause_community_gathering_video(uuid,boolean) to authenticated;

commit;
