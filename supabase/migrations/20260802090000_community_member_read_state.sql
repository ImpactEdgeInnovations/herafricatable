begin;

create table if not exists public.community_member_read_states (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_caught_up_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

alter table public.community_member_read_states enable row level security;

revoke all on table public.community_member_read_states
  from public, anon, authenticated;

create or replace function public.get_community_read_summary(
  p_community_id uuid
)
returns table(
  last_caught_up_at timestamptz,
  new_conversation_count bigint,
  new_reply_count bigint,
  new_activity_count bigint,
  latest_activity_at timestamptz
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

  return query
  with visible_posts as (
    select post.id, post.author_id, post.created_at
    from public.community_posts post
    join public.profiles author on author.id = post.author_id
    where post.community_id = p_community_id
      and post.parent_post_id is null
      and post.status = 'published'
      and author.access_status = 'active'
      and not public.is_blocked_pair(actor, post.author_id)
  ),
  visible_replies as (
    select reply.id, reply.author_id, reply.created_at
    from public.community_posts reply
    join public.community_posts parent on parent.id = reply.parent_post_id
    join public.profiles author on author.id = reply.author_id
    where reply.community_id = p_community_id
      and reply.status = 'published'
      and parent.status = 'published'
      and author.access_status = 'active'
      and not public.is_blocked_pair(actor, reply.author_id)
  ),
  counts as (
    select
      (
        select count(*)
        from visible_posts post
        where post.author_id <> actor
          and post.created_at > reference_at
      ) as conversations,
      (
        select count(*)
        from visible_replies reply
        where reply.author_id <> actor
          and reply.created_at > reference_at
      ) as replies,
      greatest(
        (select max(post.created_at) from visible_posts post),
        (select max(reply.created_at) from visible_replies reply)
      ) as latest_activity
  )
  select
    reference_at,
    counts.conversations,
    counts.replies,
    counts.conversations + counts.replies,
    counts.latest_activity
  from counts;
end;
$$;

create or replace function public.list_community_post_read_states(
  p_community_id uuid,
  p_limit integer default 100
)
returns table(
  post_id uuid,
  is_new boolean,
  new_reply_count bigint,
  last_activity_at timestamptz
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

  return query
  select
    post.id,
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
    )
  from public.community_posts post
  join public.profiles author on author.id = post.author_id
  where post.community_id = p_community_id
    and post.parent_post_id is null
    and post.status = 'published'
    and author.access_status = 'active'
    and not public.is_blocked_pair(actor, post.author_id)
  order by post.is_pinned desc, post.pinned_at desc nulls last, post.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

create or replace function public.mark_community_caught_up(
  p_community_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = actor
        and membership.status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;

  insert into public.community_member_read_states(
    community_id,
    user_id,
    last_caught_up_at,
    updated_at
  )
  values (
    p_community_id,
    actor,
    now(),
    now()
  )
  on conflict (community_id, user_id)
  do update set
    last_caught_up_at = greatest(
      public.community_member_read_states.last_caught_up_at,
      excluded.last_caught_up_at
    ),
    updated_at = now();
end;
$$;

revoke all on function public.get_community_read_summary(uuid)
  from public;
grant execute on function public.get_community_read_summary(uuid)
  to authenticated;

revoke all on function public.list_community_post_read_states(uuid, integer)
  from public;
grant execute on function public.list_community_post_read_states(uuid, integer)
  to authenticated;

revoke all on function public.mark_community_caught_up(uuid)
  from public;
grant execute on function public.mark_community_caught_up(uuid)
  to authenticated;

comment on table public.community_member_read_states is
  'Private member-controlled Community return state. It is never exposed to hosts, moderators or other members.';
comment on function public.mark_community_caught_up is
  'Explicitly advances only the current active member''s private Community read boundary.';

commit;
