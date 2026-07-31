begin;

alter table public.communities
  add column if not exists tagline text
    check (tagline is null or char_length(tagline) between 3 and 140);

alter table public.communities
  add column if not exists accent_key text not null default 'wine'
    check (accent_key in ('wine', 'gold', 'forest', 'ocean', 'terracotta'));

create table if not exists public.community_media_assets (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null
    references public.communities(id) on delete cascade,
  post_id uuid references public.community_posts(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  asset_kind text not null
    check (asset_kind in (
      'icon',
      'cover',
      'post_image',
      'post_document',
      'post_link'
    )),
  storage_path text unique,
  external_url text,
  original_name text check (
    original_name is null or char_length(original_name) between 1 and 180
  ),
  mime_type text,
  size_bytes bigint check (
    size_bytes is null or size_bytes between 1 and 10485760
  ),
  width integer check (width is null or width between 1 and 10000),
  height integer check (height is null or height between 1 and 10000),
  alt_text text check (
    alt_text is null or char_length(alt_text) between 3 and 240
  ),
  status text not null default 'active'
    check (status in ('active', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_media_source_check check (
    (
      asset_kind = 'post_link'
      and storage_path is null
      and external_url is not null
      and mime_type is null
    )
    or (
      asset_kind <> 'post_link'
      and storage_path is not null
      and external_url is null
      and mime_type is not null
    )
  ),
  constraint community_media_post_check check (
    (
      asset_kind in ('post_image', 'post_document', 'post_link')
      and post_id is not null
    )
    or (
      asset_kind in ('icon', 'cover')
      and post_id is null
    )
  ),
  constraint community_media_image_alt_check check (
    asset_kind not in ('icon', 'cover', 'post_image')
    or nullif(trim(alt_text), '') is not null
  )
);

create unique index if not exists community_one_active_post_attachment_idx
  on public.community_media_assets(post_id)
  where status = 'active' and post_id is not null;

create index if not exists community_media_assets_room_idx
  on public.community_media_assets(community_id, status, created_at desc);

alter table public.communities
  add column if not exists icon_asset_id uuid
    references public.community_media_assets(id) on delete set null;

alter table public.communities
  add column if not exists cover_asset_id uuid
    references public.community_media_assets(id) on delete set null;

alter table public.community_media_assets enable row level security;

drop policy if exists "Members read permitted community media metadata"
  on public.community_media_assets;
create policy "Members read permitted community media metadata"
  on public.community_media_assets for select
  to authenticated
  using (
    status = 'active'
    and (
      public.can_manage_community(community_id)
      or exists (
        select 1
        from public.community_memberships membership
        where membership.community_id = community_media_assets.community_id
          and membership.user_id = auth.uid()
          and membership.status = 'active'
      )
      or (
        asset_kind in ('icon', 'cover')
        and public.communities_enabled()
        and public.is_active_member(auth.uid())
        and exists (
          select 1
          from public.communities community
          where community.id = community_media_assets.community_id
            and community.status = 'published'
        )
      )
    )
  );

insert into storage.buckets(
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values(
  'community-media',
  'community-media',
  false,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
)
on conflict(id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Members read authorised community media"
  on storage.objects;
create policy "Members read authorised community media"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'community-media'
    and exists (
      select 1
      from public.community_media_assets asset
      join public.communities community on community.id = asset.community_id
      where asset.storage_path = storage.objects.name
        and asset.status = 'active'
        and (
          public.can_manage_community(asset.community_id)
          or exists (
            select 1
            from public.community_memberships membership
            where membership.community_id = asset.community_id
              and membership.user_id = auth.uid()
              and membership.status = 'active'
          )
          or (
            asset.asset_kind in ('icon', 'cover')
            and public.communities_enabled()
            and public.is_active_member(auth.uid())
            and community.status = 'published'
          )
        )
    )
  );

drop policy if exists "Owners upload draft community branding"
  on storage.objects;
create policy "Owners upload draft community branding"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[2] = 'branding'
    and (storage.foldername(name))[3] = auth.uid()::text
    and exists (
      select 1
      from public.community_memberships membership
      where membership.community_id::text = (storage.foldername(name))[1]
        and membership.user_id = auth.uid()
        and membership.status = 'active'
        and membership.role = 'owner'
    )
  );

drop policy if exists "Members upload media for their own community posts"
  on storage.objects;
create policy "Members upload media for their own community posts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[2] = 'posts'
    and (storage.foldername(name))[4] = auth.uid()::text
    and exists (
      select 1
      from public.community_posts post
      join public.community_memberships membership
        on membership.community_id = post.community_id
      where post.id::text = (storage.foldername(name))[3]
        and post.community_id::text = (storage.foldername(name))[1]
        and post.author_id = auth.uid()
        and post.parent_post_id is null
        and post.status = 'published'
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

create or replace function public.list_community_brand_identities(
  p_community_id uuid default null
)
returns table(
  community_id uuid,
  tagline text,
  accent_key text,
  icon_asset_id uuid,
  icon_storage_path text,
  icon_alt_text text,
  icon_width integer,
  icon_height integer,
  cover_asset_id uuid,
  cover_storage_path text,
  cover_alt_text text,
  cover_width integer,
  cover_height integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_active_member(auth.uid()) then
    raise exception 'Active membership required';
  end if;

  return query
  select
    community.id,
    community.tagline,
    community.accent_key,
    icon.id,
    icon.storage_path,
    icon.alt_text,
    icon.width,
    icon.height,
    cover.id,
    cover.storage_path,
    cover.alt_text,
    cover.width,
    cover.height
  from public.communities community
  left join public.community_media_assets icon
    on icon.id = community.icon_asset_id
    and icon.status = 'active'
  left join public.community_media_assets cover
    on cover.id = community.cover_asset_id
    and cover.status = 'active'
  left join public.community_memberships membership
    on membership.community_id = community.id
    and membership.user_id = auth.uid()
  where (p_community_id is null or community.id = p_community_id)
    and (
      (
        public.communities_enabled()
        and community.status = 'published'
      )
      or membership.user_id is not null
      or public.is_admin(array['super_admin']::public.app_role[])
    )
  order by community.name;
end;
$$;

create or replace function public.save_community_brand_identity(
  p_community_id uuid,
  p_tagline text,
  p_accent_key text,
  p_icon_storage_path text default null,
  p_icon_mime_type text default null,
  p_icon_original_name text default null,
  p_icon_alt_text text default null,
  p_icon_width integer default null,
  p_icon_height integer default null,
  p_icon_size_bytes bigint default null,
  p_remove_icon boolean default false,
  p_cover_storage_path text default null,
  p_cover_mime_type text default null,
  p_cover_original_name text default null,
  p_cover_alt_text text default null,
  p_cover_width integer default null,
  p_cover_height integer default null,
  p_cover_size_bytes bigint default null,
  p_remove_cover boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.communities%rowtype;
  next_icon uuid;
  next_cover uuid;
  object_mime text;
  object_size bigint;
begin
  select *
  into target
  from public.communities
  where id = p_community_id
  for update;

  if not found
    or not (
      public.is_admin(array['super_admin']::public.app_role[])
      or exists (
        select 1
        from public.community_memberships membership
        where membership.community_id = p_community_id
          and membership.user_id = actor
          and membership.status = 'active'
          and membership.role = 'owner'
      )
    ) then
    raise exception 'Community owner required';
  end if;

  if nullif(trim(coalesce(p_tagline, '')), '') is not null
    and char_length(trim(p_tagline)) not between 3 and 140 then
    raise exception 'Tagline must be between 3 and 140 characters';
  end if;
  if p_accent_key not in ('wine', 'gold', 'forest', 'ocean', 'terracotta') then
    raise exception 'Choose an approved community accent';
  end if;
  if p_remove_icon and p_icon_storage_path is not null then
    raise exception 'Choose either a replacement icon or removal';
  end if;
  if p_remove_cover and p_cover_storage_path is not null then
    raise exception 'Choose either a replacement cover or removal';
  end if;

  next_icon := target.icon_asset_id;
  next_cover := target.cover_asset_id;

  if p_remove_icon and target.icon_asset_id is not null then
    update public.community_media_assets
    set status = 'deleted', updated_at = now()
    where id = target.icon_asset_id;
    next_icon := null;
  elsif p_icon_storage_path is not null then
    select
      coalesce(object.metadata ->> 'mimetype', p_icon_mime_type),
      coalesce((object.metadata ->> 'size')::bigint, p_icon_size_bytes)
    into object_mime, object_size
    from storage.objects object
    where object.bucket_id = 'community-media'
      and object.name = p_icon_storage_path;

    if p_icon_storage_path not like (
      p_community_id::text || '/branding/' || actor::text || '/icon-%'
    )
      or object_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or object_size is null
      or object_size > 3145728
      or p_icon_width is null
      or p_icon_height is null
      or p_icon_width < 256
      or p_icon_height < 256
      or p_icon_width::numeric / nullif(p_icon_height, 0)::numeric
        not between 0.75 and 1.34
      or char_length(trim(coalesce(p_icon_alt_text, ''))) not between 3 and 240
      or object_mime is null then
      raise exception 'Community icon does not meet the upload requirements';
    end if;

    if target.icon_asset_id is not null then
      update public.community_media_assets
      set status = 'deleted', updated_at = now()
      where id = target.icon_asset_id;
    end if;

    insert into public.community_media_assets(
      community_id,
      uploaded_by,
      asset_kind,
      storage_path,
      original_name,
      mime_type,
      size_bytes,
      width,
      height,
      alt_text
    )
    values(
      p_community_id,
      actor,
      'icon',
      p_icon_storage_path,
      left(nullif(trim(p_icon_original_name), ''), 180),
      object_mime,
      object_size,
      p_icon_width,
      p_icon_height,
      trim(p_icon_alt_text)
    )
    returning id into next_icon;
  end if;

  if p_remove_cover and target.cover_asset_id is not null then
    update public.community_media_assets
    set status = 'deleted', updated_at = now()
    where id = target.cover_asset_id;
    next_cover := null;
  elsif p_cover_storage_path is not null then
    select
      coalesce(object.metadata ->> 'mimetype', p_cover_mime_type),
      coalesce((object.metadata ->> 'size')::bigint, p_cover_size_bytes)
    into object_mime, object_size
    from storage.objects object
    where object.bucket_id = 'community-media'
      and object.name = p_cover_storage_path;

    if p_cover_storage_path not like (
      p_community_id::text || '/branding/' || actor::text || '/cover-%'
    )
      or object_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or object_size is null
      or object_size > 8388608
      or p_cover_width is null
      or p_cover_height is null
      or p_cover_width < 1200
      or p_cover_height < 400
      or p_cover_width::numeric / nullif(p_cover_height, 0)::numeric
        not between 2 and 4.5
      or char_length(trim(coalesce(p_cover_alt_text, ''))) not between 3 and 240
      or object_mime is null then
      raise exception 'Community cover does not meet the upload requirements';
    end if;

    if target.cover_asset_id is not null then
      update public.community_media_assets
      set status = 'deleted', updated_at = now()
      where id = target.cover_asset_id;
    end if;

    insert into public.community_media_assets(
      community_id,
      uploaded_by,
      asset_kind,
      storage_path,
      original_name,
      mime_type,
      size_bytes,
      width,
      height,
      alt_text
    )
    values(
      p_community_id,
      actor,
      'cover',
      p_cover_storage_path,
      left(nullif(trim(p_cover_original_name), ''), 180),
      object_mime,
      object_size,
      p_cover_width,
      p_cover_height,
      trim(p_cover_alt_text)
    )
    returning id into next_cover;
  end if;

  update public.communities
  set
    tagline = nullif(trim(p_tagline), ''),
    accent_key = p_accent_key,
    icon_asset_id = next_icon,
    cover_asset_id = next_cover,
    updated_at = now()
  where id = p_community_id;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    actor,
    'community.brand_identity_saved',
    'community',
    p_community_id,
    jsonb_build_object(
      'accent_key', p_accent_key,
      'has_tagline', nullif(trim(coalesce(p_tagline, '')), '') is not null,
      'icon_changed', p_icon_storage_path is not null or p_remove_icon,
      'cover_changed', p_cover_storage_path is not null or p_remove_cover
    )
  );
end;
$$;

create or replace function public.attach_community_post_media(
  p_post_id uuid,
  p_attachment_type text,
  p_storage_path text default null,
  p_external_url text default null,
  p_mime_type text default null,
  p_original_name text default null,
  p_alt_text text default null,
  p_width integer default null,
  p_height integer default null,
  p_size_bytes bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_posts%rowtype;
  kind text;
  saved uuid;
  object_mime text;
  object_size bigint;
begin
  select *
  into target
  from public.community_posts
  where id = p_post_id
    and parent_post_id is null
    and status = 'published'
  for update;

  if not found
    or target.author_id <> actor
    or not public.communities_enabled()
    or not public.is_active_member(actor)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = actor
        and membership.status = 'active'
    ) then
    raise exception 'Published community post required';
  end if;

  if p_attachment_type = 'link' then
    if p_external_url is null
      or lower(trim(p_external_url)) not like 'https://%'
      or char_length(trim(p_external_url)) > 2048 then
      raise exception 'Use a valid secure link';
    end if;
    kind := 'post_link';
  elsif p_attachment_type = 'image' then
    select
      coalesce(object.metadata ->> 'mimetype', p_mime_type),
      coalesce((object.metadata ->> 'size')::bigint, p_size_bytes)
    into object_mime, object_size
    from storage.objects object
    where object.bucket_id = 'community-media'
      and object.name = p_storage_path;

    if p_storage_path not like (
      target.community_id::text || '/posts/' || p_post_id::text || '/'
      || actor::text || '/%'
    )
      or object_mime not in ('image/jpeg', 'image/png', 'image/webp')
      or object_size is null
      or object_size > 8388608
      or p_width is null
      or p_height is null
      or p_width < 320
      or p_height < 180
      or char_length(trim(coalesce(p_alt_text, ''))) not between 3 and 240
      or object_mime is null then
      raise exception 'Community image does not meet the upload requirements';
    end if;
    kind := 'post_image';
  elsif p_attachment_type = 'document' then
    select
      coalesce(object.metadata ->> 'mimetype', p_mime_type),
      coalesce((object.metadata ->> 'size')::bigint, p_size_bytes)
    into object_mime, object_size
    from storage.objects object
    where object.bucket_id = 'community-media'
      and object.name = p_storage_path;

    if p_storage_path not like (
      target.community_id::text || '/posts/' || p_post_id::text || '/'
      || actor::text || '/%'
    )
      or object_mime <> 'application/pdf'
      or object_size is null
      or object_size > 10485760
      or char_length(trim(coalesce(p_original_name, ''))) not between 1 and 180
      or object_mime is null then
      raise exception 'Community document does not meet the upload requirements';
    end if;
    kind := 'post_document';
  else
    raise exception 'Unsupported community attachment';
  end if;

  insert into public.community_media_assets(
    community_id,
    post_id,
    uploaded_by,
    asset_kind,
    storage_path,
    external_url,
    original_name,
    mime_type,
    size_bytes,
    width,
    height,
    alt_text
  )
  values(
    target.community_id,
    p_post_id,
    actor,
    kind,
    case when kind = 'post_link' then null else p_storage_path end,
    case when kind = 'post_link' then trim(p_external_url) else null end,
    case
      when kind = 'post_link' then left(trim(p_external_url), 180)
      else left(nullif(trim(p_original_name), ''), 180)
    end,
    case when kind = 'post_link' then null else object_mime end,
    case when kind = 'post_link' then null else object_size end,
    case when kind = 'post_image' then p_width else null end,
    case when kind = 'post_image' then p_height else null end,
    case when kind = 'post_image' then trim(p_alt_text) else null end
  )
  returning id into saved;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    actor,
    'community.post_media_attached',
    'community_media_asset',
    saved,
    jsonb_build_object(
      'community_id', target.community_id,
      'post_id', p_post_id,
      'asset_kind', kind
    )
  );

  return saved;
exception
  when unique_violation then
    raise exception 'This post already has an attachment';
end;
$$;

create or replace function public.list_community_post_media(
  p_community_id uuid,
  p_limit integer default 100
)
returns table(
  asset_id uuid,
  post_id uuid,
  attachment_type text,
  storage_path text,
  external_url text,
  original_name text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  alt_text text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled()
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;

  return query
  select
    asset.id,
    asset.post_id,
    case asset.asset_kind
      when 'post_image' then 'image'
      when 'post_document' then 'document'
      else 'link'
    end,
    asset.storage_path,
    asset.external_url,
    asset.original_name,
    asset.mime_type,
    asset.size_bytes,
    asset.width,
    asset.height,
    asset.alt_text
  from public.community_media_assets asset
  join public.community_posts post on post.id = asset.post_id
  join public.profiles author on author.id = post.author_id
  where asset.community_id = p_community_id
    and asset.status = 'active'
    and post.status = 'published'
    and post.parent_post_id is null
    and author.access_status = 'active'
    and not public.is_blocked_pair(auth.uid(), post.author_id)
  order by asset.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 300);
end;
$$;

create or replace function public.delete_community_post(
  p_post_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.community_posts%rowtype;
begin
  select *
  into target
  from public.community_posts
  where id = p_post_id
    and parent_post_id is null
    and status = 'published'
  for update;

  if not found
    or (
      not public.communities_enabled()
      and not public.can_manage_community(target.community_id)
    )
    or (
      target.author_id <> auth.uid()
      and not public.can_manage_community(target.community_id)
    ) then
    raise exception 'Post not found';
  end if;

  update public.community_posts
  set
    status = 'deleted',
    body = '[Removed by author]',
    updated_at = now()
  where id = p_post_id;

  update public.community_media_assets
  set status = 'deleted', updated_at = now()
  where post_id = p_post_id and status = 'active';

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    auth.uid(),
    'community.post_deleted',
    'community_post',
    p_post_id,
    jsonb_build_object(
      'community_id', target.community_id,
      'media_revoked', exists (
        select 1
        from public.community_media_assets asset
        where asset.post_id = p_post_id
      )
    )
  );
end;
$$;

create or replace function public.report_community_post(
  p_post_id uuid,
  p_category text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.community_posts%rowtype;
  saved uuid;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor) then
    raise exception 'Communities are unavailable';
  end if;

  select *
  into target
  from public.community_posts
  where id = p_post_id
    and status = 'published'
    and author_id <> actor;

  if not found
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = actor
        and membership.status = 'active'
    ) then
    raise exception 'Community content unavailable';
  end if;

  if p_category not in (
    'harassment',
    'privacy',
    'spam',
    'misinformation',
    'safety',
    'other'
  )
    or char_length(trim(coalesce(p_details, ''))) not between 10 and 2000 then
    raise exception 'Valid report details are required';
  end if;

  insert into public.community_post_reports(
    post_id,
    reporter_id,
    category,
    details,
    evidence_snapshot
  )
  values(
    p_post_id,
    actor,
    p_category,
    trim(p_details),
    jsonb_build_object(
      'post_id', target.id,
      'parent_post_id', target.parent_post_id,
      'content_kind', case
        when target.parent_post_id is null then 'post'
        else 'comment'
      end,
      'community_id', target.community_id,
      'author_id', target.author_id,
      'body', target.body,
      'attachment', (
        select jsonb_build_object(
          'asset_id', asset.id,
          'asset_kind', asset.asset_kind,
          'storage_path', asset.storage_path,
          'external_url', asset.external_url,
          'original_name', asset.original_name,
          'mime_type', asset.mime_type,
          'size_bytes', asset.size_bytes,
          'alt_text', asset.alt_text
        )
        from public.community_media_assets asset
        where asset.post_id = target.id
          and asset.status = 'active'
        limit 1
      ),
      'captured_at', now()
    )
  )
  returning id into saved;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values(
    actor,
    'community.content_reported',
    'community_post_report',
    saved,
    jsonb_build_object(
      'post_id', p_post_id,
      'content_kind', case
        when target.parent_post_id is null then 'post'
        else 'comment'
      end
    )
  );

  return saved;
exception
  when unique_violation then
    raise exception 'You already have an active report for this content';
end;
$$;

revoke all on function public.list_community_brand_identities(uuid)
  from public;
grant execute on function public.list_community_brand_identities(uuid)
  to authenticated;

revoke all on function public.save_community_brand_identity(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  bigint,
  boolean,
  text,
  text,
  text,
  text,
  integer,
  integer,
  bigint,
  boolean
) from public;
grant execute on function public.save_community_brand_identity(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  bigint,
  boolean,
  text,
  text,
  text,
  text,
  integer,
  integer,
  bigint,
  boolean
) to authenticated;

revoke all on function public.attach_community_post_media(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  bigint
) from public;
grant execute on function public.attach_community_post_media(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  bigint
) to authenticated;

revoke all on function public.list_community_post_media(uuid, integer)
  from public;
grant execute on function public.list_community_post_media(uuid, integer)
  to authenticated;

revoke all on function public.delete_community_post(uuid) from public;
grant execute on function public.delete_community_post(uuid)
  to authenticated;

revoke all on function public.report_community_post(uuid, text, text)
  from public;
grant execute on function public.report_community_post(uuid, text, text)
  to authenticated;

comment on table public.community_media_assets is
  'Immutable, private community branding and one-per-post attachments with membership-aware delivery and audit evidence.';
comment on function public.save_community_brand_identity is
  'Owner-only private-draft branding. Approved palette and accessible media rules protect the platform identity.';
comment on function public.attach_community_post_media is
  'Registers one immutable image, PDF or secure link against the author''s published community post.';

commit;
