create table public.gallery_albums (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  introduction text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 0 check (sort_order >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, title)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.gallery_albums(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  alt_text text not null,
  caption text,
  credit text,
  captured_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gallery_albums_event_sort_idx on public.gallery_albums(event_id, sort_order);
create index media_assets_album_sort_idx on public.media_assets(album_id, sort_order);
create unique index media_assets_one_featured_per_album_idx on public.media_assets(album_id) where is_featured and status <> 'archived';

alter table public.gallery_albums enable row level security;
alter table public.media_assets enable row level security;

create policy "Anyone can read published gallery albums"
  on public.gallery_albums for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.events where events.id = gallery_albums.event_id and events.status = 'published'
  ));
create policy "Event admins manage gallery albums"
  on public.gallery_albums for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "Anyone can read published media metadata"
  on public.media_assets for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.gallery_albums join public.events on events.id = gallery_albums.event_id
    where gallery_albums.id = media_assets.album_id and gallery_albums.status = 'published' and events.status = 'published'
  ));
create policy "Event admins manage media metadata"
  on public.media_assets for all to authenticated
  using (exists (
    select 1 from public.gallery_albums where gallery_albums.id = media_assets.album_id
      and public.can_manage_event(gallery_albums.event_id)
  )) with check (exists (
    select 1 from public.gallery_albums where gallery_albums.id = media_assets.album_id
      and public.can_manage_event(gallery_albums.event_id)
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.event_media_event_id(object_name text)
returns uuid language plpgsql immutable security definer set search_path = '' as $$
declare first_segment text := split_part(object_name, '/', 1);
begin
  if first_segment !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return null; end if;
  return first_segment::uuid;
end; $$;

create or replace function public.can_read_event_media(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_manage_event(public.event_media_event_id(object_name)) or exists (
    select 1 from public.media_assets
    join public.gallery_albums on gallery_albums.id = media_assets.album_id
    join public.events on events.id = gallery_albums.event_id
    where media_assets.storage_path = object_name and media_assets.status = 'published'
      and gallery_albums.status = 'published' and events.status = 'published'
  );
$$;

create policy "Authorized viewers can read event media objects"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'event-media' and public.can_read_event_media(name));
create policy "Event admins upload event media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'event-media' and public.can_manage_event(public.event_media_event_id(name)));
create policy "Event admins replace event media"
  on storage.objects for update to authenticated
  using (bucket_id = 'event-media' and public.can_manage_event(public.event_media_event_id(name)))
  with check (bucket_id = 'event-media' and public.can_manage_event(public.event_media_event_id(name)));
create policy "Event admins delete event media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'event-media' and public.can_manage_event(public.event_media_event_id(name)));

create or replace function public.save_gallery_album(
  p_album_id uuid, p_event_id uuid, p_title text, p_introduction text, p_status text, p_sort_order integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); saved_id uuid := p_album_id;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'You are not authorized to manage this event'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'Album title is required'; end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'Unsupported album status'; end if;
  if p_album_id is not null and not exists (select 1 from public.gallery_albums where id = p_album_id and event_id = p_event_id) then
    raise exception 'Album does not belong to this event';
  end if;
  if p_album_id is null then
    insert into public.gallery_albums (event_id, title, introduction, status, sort_order, published_at)
    values (p_event_id, trim(p_title), nullif(trim(p_introduction), ''), p_status, greatest(coalesce(p_sort_order, 0), 0),
      case when p_status = 'published' then now() else null end) returning id into saved_id;
  else
    update public.gallery_albums set title = trim(p_title), introduction = nullif(trim(p_introduction), ''), status = p_status,
      sort_order = greatest(coalesce(p_sort_order, 0), 0),
      published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end,
      updated_at = now() where id = p_album_id;
  end if;
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (actor_id, case when p_album_id is null then 'event.gallery_album_created' else 'event.gallery_album_updated' end,
    'gallery_album', saved_id, jsonb_build_object('event_id', p_event_id, 'status', p_status));
  return saved_id;
end; $$;

create or replace function public.save_media_asset(
  p_asset_id uuid, p_album_id uuid, p_storage_path text, p_mime_type text, p_width integer, p_height integer,
  p_alt_text text, p_caption text, p_credit text, p_captured_at timestamptz, p_status text, p_is_featured boolean, p_sort_order integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); saved_id uuid := p_asset_id; managed_event_id uuid;
begin
  select event_id into managed_event_id from public.gallery_albums where id = p_album_id;
  if actor_id is null then raise exception 'Authentication required'; end if;
  if managed_event_id is null or not public.can_manage_event(managed_event_id) then raise exception 'Not authorized to manage this album'; end if;
  if nullif(trim(p_alt_text), '') is null then raise exception 'Accessible image description is required'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'Unsupported image type'; end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'Unsupported media status'; end if;
  if public.event_media_event_id(p_storage_path) is distinct from managed_event_id then raise exception 'Media path is outside this event'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'event-media' and name = p_storage_path) then raise exception 'Uploaded media object was not found'; end if;
  if p_asset_id is not null and not exists (select 1 from public.media_assets where id = p_asset_id and album_id = p_album_id) then
    raise exception 'Media asset does not belong to this album';
  end if;
  if coalesce(p_is_featured, false) then update public.media_assets set is_featured = false, updated_at = now() where album_id = p_album_id and is_featured; end if;
  if p_asset_id is null then
    insert into public.media_assets (album_id, storage_path, mime_type, width, height, alt_text, caption, credit, captured_at, status, is_featured, sort_order, uploaded_by)
    values (p_album_id, p_storage_path, p_mime_type, p_width, p_height, trim(p_alt_text), nullif(trim(p_caption), ''),
      nullif(trim(p_credit), ''), p_captured_at, p_status, coalesce(p_is_featured, false), greatest(coalesce(p_sort_order, 0), 0), actor_id)
    returning id into saved_id;
  else
    update public.media_assets set alt_text = trim(p_alt_text), caption = nullif(trim(p_caption), ''), credit = nullif(trim(p_credit), ''),
      captured_at = p_captured_at, status = p_status, is_featured = coalesce(p_is_featured, false),
      sort_order = greatest(coalesce(p_sort_order, 0), 0), updated_at = now() where id = p_asset_id;
  end if;
  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (actor_id, case when p_asset_id is null then 'event.media_uploaded' else 'event.media_updated' end,
    'media_asset', saved_id, jsonb_build_object('event_id', managed_event_id, 'album_id', p_album_id, 'status', p_status, 'featured', p_is_featured));
  return saved_id;
end; $$;

revoke all on function public.event_media_event_id(text) from public;
grant execute on function public.event_media_event_id(text) to anon, authenticated;
revoke all on function public.can_read_event_media(text) from public;
grant execute on function public.can_read_event_media(text) to anon, authenticated;
revoke all on function public.save_gallery_album(uuid, uuid, text, text, text, integer) from public;
grant execute on function public.save_gallery_album(uuid, uuid, text, text, text, integer) to authenticated;
revoke all on function public.save_media_asset(uuid, uuid, text, text, integer, integer, text, text, text, timestamptz, text, boolean, integer) from public;
grant execute on function public.save_media_asset(uuid, uuid, text, text, integer, integer, text, text, text, timestamptz, text, boolean, integer) to authenticated;

comment on table public.gallery_albums is 'Event-scoped gallery collections with explicit publication state.';
comment on table public.media_assets is 'Private Storage metadata; only published assets receive public signed delivery URLs.';
