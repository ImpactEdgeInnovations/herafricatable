begin;
-- RPC-only foundation. Uploads remain closed until validated upload/cleanup routes ship.
create table public.community_photo_settings (
  community_id uuid primary key references public.communities(id) on delete cascade,
  allowance_bytes bigint not null default 524288000 check(allowance_bytes between 1114112 and 10737418240),
  uploads_enabled boolean not null default false
);
create table public.community_photo_albums (
  id uuid primary key,
  community_id uuid not null references public.communities(id) on delete cascade,
  title text not null check(char_length(title) between 3 and 140),
  description text not null default '' check(char_length(description)<=2000),
  room_id uuid references public.community_gathering_rooms(id) on delete set null,
  post_id uuid references public.community_posts(id) on delete set null,
  contribution_mode text not null default 'hosts_only' check(contribution_mode in ('hosts_only','members','review')),
  is_closed boolean not null default false,
  status text not null default 'active' check(status in ('active','hidden','removed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(id,community_id)
);
create index community_photo_albums_community_idx on public.community_photo_albums(community_id,created_at desc,id);
create index community_photo_albums_room_idx on public.community_photo_albums(room_id);
create index community_photo_albums_post_idx on public.community_photo_albums(post_id);
create index community_photo_albums_creator_idx on public.community_photo_albums(created_by);
create table public.community_photo_batches (
  id uuid primary key,
  album_id uuid not null references public.community_photo_albums(id) on delete cascade,
  uploader_id uuid references public.profiles(id) on delete set null,
  photo_count integer not null check(photo_count between 1 and 10),
  permission_confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index community_photo_batches_daily_idx on public.community_photo_batches(uploader_id,created_at,album_id);
create index community_photo_batches_album_idx on public.community_photo_batches(album_id);
create table public.community_album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null,
  community_id uuid not null,
  batch_id uuid not null references public.community_photo_batches(id) on delete cascade,
  uploader_id uuid references public.profiles(id) on delete set null,
  status text not null default 'reserved' check(status in ('reserved','pending','published','hidden','rejected','removed')),
  -- Includes 1 MiB original plus 64 KiB thumbnail; metadata alone never proves a file is safe.
  reserved_bytes integer not null default 1114112 check(reserved_bytes=1114112),
  stored_bytes integer check(stored_bytes between 1 and 1114112),
  caption text not null default '' check(char_length(caption)<=500),
  created_at timestamptz not null default now(),
  reservation_expires_at timestamptz not null default now()+interval '30 minutes',
  removed_at timestamptz,
  foreign key(album_id,community_id) references public.community_photo_albums(id,community_id) on delete cascade
);
create index community_album_photos_quota_idx on public.community_album_photos(community_id,album_id,status);
create index community_album_photos_batch_idx on public.community_album_photos(batch_id);
create index community_album_photos_uploader_idx on public.community_album_photos(uploader_id);
alter table public.community_photo_settings enable row level security;
alter table public.community_photo_albums enable row level security;
alter table public.community_photo_batches enable row level security;
alter table public.community_album_photos enable row level security;
revoke all on public.community_photo_settings,public.community_photo_albums,public.community_photo_batches,public.community_album_photos from public,anon,authenticated;
grant all on public.community_photo_settings,public.community_photo_albums,public.community_photo_batches,public.community_album_photos to service_role;

create function public.can_access_community_photos(p_community_id uuid,p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_active_member(auth.uid()) and public.communities_enabled()
    and exists(select 1 from public.communities c where c.id=p_community_id and c.status='published')
    and (public.can_manage_community(p_community_id) or exists(select 1 from public.community_memberships m
      where m.community_id=p_community_id and m.user_id=auth.uid() and m.status='active'))
    and (not p_write or not exists(select 1 from public.community_cohorts cohort where cohort.community_id=p_community_id
      and (cohort.status<>'active' or cohort.follow_up_until<=now())));
$$;

create function public.create_community_photo_album(p_community_id uuid,p_request_id uuid,p_title text,p_description text,p_room_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare saved public.community_photo_albums; discussion uuid;
begin
  if not public.can_access_community_photos(p_community_id,true) or not public.can_manage_community(p_community_id) then
    raise exception 'Active Community Host access required'; end if;
  if p_request_id is null then raise exception 'Start a new album'; end if;
  perform 1 from public.communities where id=p_community_id for update;
  if not public.can_access_community_photos(p_community_id,true) then raise exception 'Your Community is not open for changes'; end if;
  select * into saved from public.community_photo_albums where id=p_request_id;
  if found then
    if saved.community_id<>p_community_id or saved.created_by is distinct from auth.uid() then raise exception 'Start a new album'; end if;
    return saved.id;
  end if;
  if char_length(btrim(coalesce(p_title,''))) not between 3 and 140 or char_length(coalesce(p_description,''))>2000 then raise exception 'Add an album name and a short description'; end if;
  if (select count(*) from public.community_photo_albums where community_id=p_community_id and status<>'removed')>=25 then raise exception 'Your Community has reached its 25 album limit'; end if;
  if p_room_id is not null then
    if not exists(select 1 from public.community_gathering_rooms where id=p_room_id and community_id=p_community_id)
      or not public.can_access_community_video(p_room_id) then raise exception 'Choose a gathering in this Community'; end if;
    perform 1 from public.community_gathering_rooms where id=p_room_id for update;
    select post_id into discussion from public.community_gathering_discussions where room_id=p_room_id;
  end if;
  if discussion is null then
    discussion:=public.create_community_post(p_community_id,btrim(p_title)||E'\n\n'||coalesce(nullif(btrim(p_description),''),'Share your memories and questions about these photos.'));
    if p_room_id is not null then insert into public.community_gathering_discussions(room_id,post_id) values(p_room_id,discussion); end if;
  end if;
  insert into public.community_photo_settings(community_id) values(p_community_id) on conflict do nothing;
  insert into public.community_photo_albums(id,community_id,title,description,room_id,post_id,created_by)
    values(p_request_id,p_community_id,btrim(p_title),btrim(coalesce(p_description,'')),p_room_id,discussion,auth.uid());
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'community.photo_album_created','community_photo_album',p_request_id,jsonb_build_object('community_id',p_community_id,'room_id',p_room_id));
  return p_request_id;
end;
$$;

create function public.save_community_photo_album_settings(p_album_id uuid,p_contribution_mode text,p_is_closed boolean)
returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  select community_id into cid from public.community_photo_albums where id=p_album_id;
  if cid is null or not public.can_access_community_photos(cid,true) or not public.can_manage_community(cid) then raise exception 'Active Community Host access required'; end if;
  if p_contribution_mode is null or p_contribution_mode not in ('hosts_only','members','review') or p_is_closed is null then raise exception 'Choose who can add photos'; end if;
  perform 1 from public.communities where id=cid for update;
  if not public.can_access_community_photos(cid,true) then raise exception 'Your Community is not open for changes'; end if;
  update public.community_photo_albums set contribution_mode=p_contribution_mode,is_closed=p_is_closed where id=p_album_id and status='active';
  if not found then raise exception 'This album is unavailable'; end if;
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
    values(auth.uid(),'community.photo_album_settings_saved','community_photo_album',p_album_id,jsonb_build_object('contribution_mode',p_contribution_mode,'is_closed',p_is_closed));
end;
$$;

create function public.reserve_community_album_photos(p_album_id uuid,p_request_id uuid,p_count integer,p_permission_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare album public.community_photo_albums; existing public.community_photo_batches; cid uuid; host boolean; budget bigint; daily integer;
begin
  select community_id into cid from public.community_photo_albums where id=p_album_id;
  if cid is null or not public.can_access_community_photos(cid,true) then raise exception 'Active Community membership required'; end if;
  -- One lock order for settings, reservations and later upload finalisation.
  perform 1 from public.communities where id=cid for update;
  if not public.can_access_community_photos(cid,true) then raise exception 'Your Community is not open for changes'; end if;
  select * into album from public.community_photo_albums where id=p_album_id for update;
  host:=public.can_manage_community(cid);
  if album.status<>'active' or album.is_closed or (not host and album.contribution_mode='hosts_only') then raise exception 'This album is not accepting your photos'; end if;
  if p_request_id is null or p_count is null or p_count not between 1 and 10 then raise exception 'Choose between 1 and 10 photos'; end if;
  if p_permission_confirmed is distinct from true then raise exception 'Confirm you have permission from the people pictured'; end if;
  select * into existing from public.community_photo_batches where id=p_request_id;
  if found then
    if existing.album_id<>p_album_id or existing.uploader_id is distinct from auth.uid() or existing.photo_count<>p_count then raise exception 'Start a new photo upload'; end if;
    return (select jsonb_agg(jsonb_build_object('id',id,'status',status,'expires_at',reservation_expires_at) order by id) from public.community_album_photos where batch_id=p_request_id);
  end if;
  select allowance_bytes into budget from public.community_photo_settings where community_id=cid and uploads_enabled;
  if budget is null then raise exception 'Photo uploads are not open yet'; end if;
  select coalesce(sum(b.photo_count),0) into daily from public.community_photo_batches b
    join public.community_photo_albums a on a.id=b.album_id
    where a.community_id=cid and b.uploader_id=auth.uid() and b.created_at>=date_trunc('day',now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  if not host and daily+p_count>20 then raise exception 'You can add up to 20 photos a day in this Community'; end if;
  if (select count(*) from public.community_album_photos where album_id=p_album_id)+p_count>100 then raise exception 'This album has reached its 100 photo limit'; end if;
  -- Expired, pending and soft-removed rows count until the trusted cleanup worker
  -- proves their files are gone. Never free bytes merely because a timer expired.
  if (select coalesce(sum(coalesce(stored_bytes,reserved_bytes)),0) from public.community_album_photos where community_id=cid)+p_count::bigint*1114112>budget then raise exception 'Your Community photo allowance is full'; end if;
  insert into public.community_photo_batches(id,album_id,uploader_id,photo_count) values(p_request_id,p_album_id,auth.uid(),p_count);
  insert into public.community_album_photos(album_id,community_id,batch_id,uploader_id)
    select p_album_id,cid,p_request_id,auth.uid() from generate_series(1,p_count);
  return (select jsonb_agg(jsonb_build_object('id',id,'status',status,'expires_at',reservation_expires_at) order by id) from public.community_album_photos where batch_id=p_request_id);
end;
$$;

revoke all on function public.can_access_community_photos(uuid,boolean),public.create_community_photo_album(uuid,uuid,text,text,uuid),
 public.save_community_photo_album_settings(uuid,text,boolean),public.reserve_community_album_photos(uuid,uuid,integer,boolean) from public,anon;
grant execute on function public.can_access_community_photos(uuid,boolean),public.create_community_photo_album(uuid,uuid,text,text,uuid),
 public.save_community_photo_album_settings(uuid,text,boolean),public.reserve_community_album_photos(uuid,uuid,integer,boolean) to authenticated;
commit;
