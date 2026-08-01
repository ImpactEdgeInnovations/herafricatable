begin;

create or replace function public.list_community_conversation_page(
  p_community_id uuid,
  p_before_pinned boolean default null,
  p_before_activity_at timestamptz default null,
  p_before_post_id uuid default null,
  p_limit integer default 21
)
returns table(
  post_id uuid,
  author_id uuid,
  author_name text,
  author_role text,
  author_company text,
  body text,
  category text,
  is_pinned boolean,
  comment_count bigint,
  appreciation_count bigint,
  appreciated_by_me boolean,
  saved_by_me boolean,
  followed_by_me boolean,
  created_at timestamptz,
  edited_at timestamptz,
  can_edit boolean,
  edit_expires_at timestamptz,
  is_new boolean,
  new_reply_count bigint,
  last_activity_at timestamptz,
  cursor_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  reference_at timestamptz;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor) then
    raise exception 'Communities are unavailable';
  end if;

  select coalesce(
    read_state.last_caught_up_at,
    membership.joined_at,
    membership.created_at
  )
  into reference_at
  from public.community_memberships membership
  left join public.community_member_read_states read_state
    on read_state.community_id = membership.community_id
   and read_state.user_id = membership.user_id
  where membership.community_id = p_community_id
    and membership.user_id = actor
    and membership.status = 'active';

  if reference_at is null then
    raise exception 'Active community membership required';
  end if;

  if num_nulls(
    p_before_pinned,
    p_before_activity_at,
    p_before_post_id
  ) not in (0, 3) then
    raise exception 'A complete conversation cursor is required';
  end if;

  return query
  select
    post.id,
    post.author_id,
    author.display_name,
    author.job_title,
    author.company,
    post.body,
    post.category,
    post.is_pinned,
    (
      select count(*)
      from public.community_posts reply
      join public.profiles reply_author on reply_author.id = reply.author_id
      where reply.parent_post_id = post.id
        and reply.status = 'published'
        and reply_author.access_status = 'active'
        and not public.is_blocked_pair(actor, reply.author_id)
    ),
    (
      select count(*)
      from public.community_post_appreciations appreciation
      where appreciation.post_id = post.id
    ),
    exists (
      select 1
      from public.community_post_appreciations appreciation
      where appreciation.post_id = post.id
        and appreciation.user_id = actor
    ),
    exists (
      select 1
      from public.community_saved_posts saved
      where saved.post_id = post.id
        and saved.user_id = actor
    ),
    exists (
      select 1
      from public.community_followed_posts followed
      where followed.post_id = post.id
        and followed.user_id = actor
    ),
    post.created_at,
    post.edited_at,
    post.author_id = actor
      and post.created_at > now() - interval '30 minutes'
      and not post.is_pinned
      and (
        select count(*)
        from public.community_post_revisions revision
        where revision.post_id = post.id
      ) < 5,
    post.created_at + interval '30 minutes',
    post.author_id <> actor and post.created_at > reference_at,
    (
      select count(*)
      from public.community_posts reply
      join public.profiles reply_author on reply_author.id = reply.author_id
      where reply.parent_post_id = post.id
        and reply.status = 'published'
        and reply.author_id <> actor
        and reply.created_at > reference_at
        and reply_author.access_status = 'active'
        and not public.is_blocked_pair(actor, reply.author_id)
    ),
    greatest(
      post.created_at,
      coalesce((
        select max(reply.created_at)
        from public.community_posts reply
        join public.profiles reply_author on reply_author.id = reply.author_id
        where reply.parent_post_id = post.id
          and reply.status = 'published'
          and reply_author.access_status = 'active'
          and not public.is_blocked_pair(actor, reply.author_id)
      ), post.created_at)
    ),
    case
      when post.is_pinned then coalesce(post.pinned_at, post.created_at)
      else post.created_at
    end
  from public.community_posts post
  join public.profiles author on author.id = post.author_id
  where post.community_id = p_community_id
    and post.parent_post_id is null
    and post.status = 'published'
    and author.access_status = 'active'
    and not public.is_blocked_pair(actor, post.author_id)
    and (
      p_before_post_id is null
      or (
        post.is_pinned::integer,
        case
          when post.is_pinned then coalesce(post.pinned_at, post.created_at)
          else post.created_at
        end,
        post.id
      ) < (
        p_before_pinned::integer,
        p_before_activity_at,
        p_before_post_id
      )
    )
  order by
    post.is_pinned desc,
    case
      when post.is_pinned then coalesce(post.pinned_at, post.created_at)
      else post.created_at
    end desc,
    post.id desc
  limit least(greatest(coalesce(p_limit, 21), 1), 25);
end;
$$;

create or replace function public.list_community_comments_for_posts(
  p_community_id uuid,
  p_post_ids uuid[],
  p_limit integer default 500
)
returns table(
  comment_id uuid,
  post_id uuid,
  author_id uuid,
  author_name text,
  author_role text,
  author_company text,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled()
    or not public.is_active_member(auth.uid())
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;

  if coalesce(cardinality(p_post_ids), 0) not between 1 and 25 then
    raise exception 'Choose between 1 and 25 conversations';
  end if;

  return query
  select
    reply.id,
    reply.parent_post_id,
    reply.author_id,
    author.display_name,
    author.job_title,
    author.company,
    reply.body,
    reply.created_at
  from public.community_posts reply
  join public.community_posts parent on parent.id = reply.parent_post_id
  join public.profiles author on author.id = reply.author_id
  where reply.community_id = p_community_id
    and reply.parent_post_id = any(p_post_ids)
    and reply.status = 'published'
    and parent.status = 'published'
    and author.access_status = 'active'
    and not public.is_blocked_pair(auth.uid(), reply.author_id)
  order by reply.created_at
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

create or replace function public.list_community_post_media_for_posts(
  p_community_id uuid,
  p_post_ids uuid[]
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
    or not public.is_active_member(auth.uid())
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;

  if coalesce(cardinality(p_post_ids), 0) not between 1 and 25 then
    raise exception 'Choose between 1 and 25 conversations';
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
    and asset.post_id = any(p_post_ids)
    and asset.status = 'active'
    and post.status = 'published'
    and post.parent_post_id is null
    and author.access_status = 'active'
    and not public.is_blocked_pair(auth.uid(), post.author_id);
end;
$$;

create or replace function public.set_community_post_pinned(
  p_post_id uuid,
  p_pinned boolean
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

  if not found or not public.can_manage_community(target.community_id) then
    raise exception 'Community host or moderator required';
  end if;

  if p_pinned
    and not target.is_pinned
    and (
      select count(*)
      from public.community_posts pinned
      where pinned.community_id = target.community_id
        and pinned.parent_post_id is null
        and pinned.status = 'published'
        and pinned.is_pinned
    ) >= 3 then
    raise exception 'Keep no more than three pinned conversations';
  end if;

  update public.community_posts
  set
    is_pinned = p_pinned,
    pinned_at = case when p_pinned then now() else null end,
    pinned_by = case when p_pinned then auth.uid() else null end,
    updated_at = now()
  where id = p_post_id;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    case when p_pinned
      then 'community.post_pinned'
      else 'community.post_unpinned'
    end,
    'community_post',
    p_post_id,
    jsonb_build_object('community_id', target.community_id)
  );
end;
$$;

revoke all on function public.list_community_conversation_page(
  uuid,
  boolean,
  timestamptz,
  uuid,
  integer
) from public;
grant execute on function public.list_community_conversation_page(
  uuid,
  boolean,
  timestamptz,
  uuid,
  integer
) to authenticated;

revoke all on function public.list_community_comments_for_posts(
  uuid,
  uuid[],
  integer
) from public;
grant execute on function public.list_community_comments_for_posts(
  uuid,
  uuid[],
  integer
) to authenticated;

revoke all on function public.list_community_post_media_for_posts(uuid, uuid[])
  from public;
grant execute on function public.list_community_post_media_for_posts(uuid, uuid[])
  to authenticated;

revoke all on function public.set_community_post_pinned(uuid, boolean)
  from public;
grant execute on function public.set_community_post_pinned(uuid, boolean)
  to authenticated;

comment on function public.list_community_conversation_page is
  'Stable keyset pagination across pinned and ordinary Community conversations with member-private edit and return state.';
comment on function public.list_community_comments_for_posts is
  'Loads only visible, block-filtered replies for an authorised page of Community conversations.';

commit;
