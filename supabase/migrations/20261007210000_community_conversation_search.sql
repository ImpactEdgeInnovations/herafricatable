begin;

create function public.search_community_conversation_page(
  p_community_id uuid,
  p_before_pinned boolean default null,
  p_before_activity_at timestamptz default null,
  p_before_post_id uuid default null,
  p_limit integer default 21,
  p_category text default null,
  p_search text default null,
  p_view text default 'all'
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
  if char_length(coalesce(p_search,''))>120
    or p_view is null or p_view not in ('all','following','mine','new','saved')
    or (p_category is not null and p_category not in ('discussion','introduction','ask','offer','opportunity','resource','event_follow_up','win','start_here','announcement')) then
    raise exception 'Choose a topic and a search of up to 120 characters';
  end if;
  if not exists(select 1 from public.communities c where c.id=p_community_id and c.status='published') then
    raise exception 'This Community is unavailable';
  end if;
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
    and (p_category is null or post.category=p_category)
    and (nullif(btrim(p_search),'') is null or strpos(lower(concat_ws(' ',post.body,author.display_name,author.job_title,author.company)),lower(btrim(p_search)))>0)
    and (p_view='all'
      or (p_view='mine' and post.author_id=actor)
      or (p_view='saved' and exists(select 1 from public.community_saved_posts s where s.post_id=post.id and s.user_id=actor))
      or (p_view='following' and exists(select 1 from public.community_followed_posts f where f.post_id=post.id and f.user_id=actor))
      or (p_view='new' and ((post.author_id<>actor and post.created_at>reference_at)
        or exists(select 1 from public.community_posts r join public.profiles ra on ra.id=r.author_id
          where r.parent_post_id=post.id and r.status='published' and ra.access_status='active'
          and r.author_id<>actor and r.created_at>reference_at and not public.is_blocked_pair(actor,r.author_id)))))
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

create index community_posts_topic_cursor_idx on public.community_posts(community_id,category,is_pinned desc,(case when is_pinned then coalesce(pinned_at,created_at) else created_at end) desc,id desc)
 where parent_post_id is null and status='published';
revoke all on function public.search_community_conversation_page(uuid,boolean,timestamptz,uuid,integer,text,text,text) from public,anon;
grant execute on function public.search_community_conversation_page(uuid,boolean,timestamptz,uuid,integer,text,text,text) to authenticated;
commit;
