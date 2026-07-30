begin;

alter table public.community_posts
  add column parent_post_id uuid references public.community_posts(id) on delete cascade,
  add column category text not null default 'discussion'
    check (category in (
      'start_here',
      'introduction',
      'ask',
      'offer',
      'opportunity',
      'resource',
      'event_follow_up',
      'win',
      'announcement',
      'discussion'
    )),
  add column is_pinned boolean not null default false,
  add column pinned_at timestamptz,
  add column pinned_by uuid references auth.users(id) on delete set null,
  add constraint community_comment_cannot_be_pinned
    check (parent_post_id is null or not is_pinned);

create index community_posts_parent_idx
  on public.community_posts(parent_post_id, status, created_at);
create index community_posts_structured_feed_idx
  on public.community_posts(
    community_id,
    status,
    is_pinned desc,
    created_at desc
  )
  where parent_post_id is null;

create table public.community_post_appreciations (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_saved_posts (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_followed_posts (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index community_saved_posts_user_idx
  on public.community_saved_posts(user_id, created_at desc);
create index community_followed_posts_user_idx
  on public.community_followed_posts(user_id, created_at desc);

alter table public.community_post_appreciations enable row level security;
alter table public.community_saved_posts enable row level security;
alter table public.community_followed_posts enable row level security;

create policy "Room members read community appreciations"
  on public.community_post_appreciations for select
  to authenticated
  using (
    public.communities_enabled()
    and exists (
      select 1
      from public.community_posts post
      join public.community_memberships membership
        on membership.community_id = post.community_id
      where post.id = community_post_appreciations.post_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

create policy "Members read their saved community posts"
  on public.community_saved_posts for select
  to authenticated
  using (user_id = auth.uid());

create policy "Members read their followed community posts"
  on public.community_followed_posts for select
  to authenticated
  using (user_id = auth.uid());

create or replace function public.list_community_posts(
  p_community_id uuid,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table(
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
    post.id,
    post.author_id,
    profile.display_name,
    profile.job_title,
    profile.company,
    post.body,
    post.created_at
  from public.community_posts post
  join public.profiles profile on profile.id = post.author_id
  where post.community_id = p_community_id
    and post.parent_post_id is null
    and post.status = 'published'
    and profile.access_status = 'active'
    and not public.is_blocked_pair(auth.uid(), post.author_id)
  order by post.is_pinned desc, post.pinned_at desc nulls last, post.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.list_community_conversations(
  p_community_id uuid,
  p_category text default null,
  p_limit integer default 30,
  p_offset integer default 0
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
  created_at timestamptz
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

  if p_category is not null and p_category not in (
    'start_here',
    'introduction',
    'ask',
    'offer',
    'opportunity',
    'resource',
    'event_follow_up',
    'win',
    'announcement',
    'discussion'
  ) then
    raise exception 'Unsupported conversation category';
  end if;

  return query
  select
    post.id,
    post.author_id,
    profile.display_name,
    profile.job_title,
    profile.company,
    post.body,
    post.category,
    post.is_pinned,
    (
      select count(*)
      from public.community_posts comment
      join public.profiles comment_author on comment_author.id = comment.author_id
      where comment.parent_post_id = post.id
        and comment.status = 'published'
        and comment_author.access_status = 'active'
        and not public.is_blocked_pair(auth.uid(), comment.author_id)
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
        and appreciation.user_id = auth.uid()
    ),
    exists (
      select 1
      from public.community_saved_posts saved
      where saved.post_id = post.id
        and saved.user_id = auth.uid()
    ),
    exists (
      select 1
      from public.community_followed_posts followed
      where followed.post_id = post.id
        and followed.user_id = auth.uid()
    ),
    post.created_at
  from public.community_posts post
  join public.profiles profile on profile.id = post.author_id
  where post.community_id = p_community_id
    and post.parent_post_id is null
    and post.status = 'published'
    and profile.access_status = 'active'
    and not public.is_blocked_pair(auth.uid(), post.author_id)
    and (p_category is null or post.category = p_category)
  order by post.is_pinned desc, post.pinned_at desc nulls last, post.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.list_community_comments(
  p_community_id uuid,
  p_limit integer default 200
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
    comment.id,
    comment.parent_post_id,
    comment.author_id,
    profile.display_name,
    profile.job_title,
    profile.company,
    comment.body,
    comment.created_at
  from public.community_posts comment
  join public.community_posts parent on parent.id = comment.parent_post_id
  join public.profiles profile on profile.id = comment.author_id
  where comment.community_id = p_community_id
    and comment.status = 'published'
    and parent.status = 'published'
    and profile.access_status = 'active'
    and not public.is_blocked_pair(auth.uid(), comment.author_id)
  order by comment.created_at
  limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

create or replace function public.create_structured_community_post(
  p_community_id uuid,
  p_body text,
  p_category text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  saved uuid;
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

  if p_category not in (
    'start_here',
    'introduction',
    'ask',
    'offer',
    'opportunity',
    'resource',
    'event_follow_up',
    'win',
    'announcement',
    'discussion'
  ) then
    raise exception 'Choose a supported conversation type';
  end if;

  if p_category in ('start_here', 'announcement')
    and not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  if char_length(trim(coalesce(p_body, ''))) not between 2 and 3000 then
    raise exception 'Post must be between 2 and 3000 characters';
  end if;

  if (
    select count(*)
    from public.community_posts
    where author_id = actor
      and created_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'Hourly community post limit reached';
  end if;

  insert into public.community_posts(
    community_id,
    author_id,
    body,
    category
  )
  values (
    p_community_id,
    actor,
    trim(p_body),
    p_category
  )
  returning id into saved;

  insert into public.community_followed_posts(post_id, user_id)
  values (saved, actor);

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'community.post_created',
    'community_post',
    saved,
    jsonb_build_object(
      'community_id', p_community_id,
      'category', p_category
    )
  );

  return saved;
end;
$$;

create or replace function public.create_community_comment(
  p_post_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  parent public.community_posts%rowtype;
  saved uuid;
  community_slug text;
begin
  select *
  into parent
  from public.community_posts
  where id = p_post_id
    and parent_post_id is null
    and status = 'published'
  for update;

  if not found
    or not public.communities_enabled()
    or not public.is_active_member(actor)
    or public.is_blocked_pair(actor, parent.author_id)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = parent.community_id
        and membership.user_id = actor
        and membership.status = 'active'
    ) then
    raise exception 'Active community membership required';
  end if;

  if char_length(trim(coalesce(p_body, ''))) not between 2 and 1500 then
    raise exception 'Comment must be between 2 and 1500 characters';
  end if;

  if (
    select count(*)
    from public.community_posts
    where author_id = actor
      and parent_post_id is not null
      and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'Hourly community comment limit reached';
  end if;

  insert into public.community_posts(
    community_id,
    author_id,
    parent_post_id,
    body,
    category
  )
  values (
    parent.community_id,
    actor,
    parent.id,
    trim(p_body),
    parent.category
  )
  returning id into saved;

  insert into public.community_followed_posts(post_id, user_id)
  values (parent.id, actor)
  on conflict do nothing;

  select slug into community_slug
  from public.communities
  where id = parent.community_id;

  perform public.enqueue_notification(
    recipient.user_id,
    'community',
    'New community reply',
    'A member replied to a conversation you follow.',
    '/communities/' || community_slug || '#conversations',
    'community-comment:' || saved::text || ':' || recipient.user_id::text
  )
  from (
    select parent.author_id as user_id
    union
    select followed.user_id
    from public.community_followed_posts followed
    where followed.post_id = parent.id
  ) recipient
  where recipient.user_id <> actor
    and not public.is_blocked_pair(actor, recipient.user_id);

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor,
    'community.comment_created',
    'community_post',
    saved,
    jsonb_build_object(
      'community_id', parent.community_id,
      'parent_post_id', parent.id
    )
  );

  return saved;
end;
$$;

create or replace function public.set_community_post_appreciation(
  p_post_id uuid,
  p_active boolean
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
    and status = 'published';

  if not found
    or not public.communities_enabled()
    or public.is_blocked_pair(auth.uid(), target.author_id)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Conversation unavailable';
  end if;

  if p_active then
    insert into public.community_post_appreciations(post_id, user_id)
    values (p_post_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.community_post_appreciations
    where post_id = p_post_id
      and user_id = auth.uid();
  end if;
end;
$$;

create or replace function public.set_community_post_saved(
  p_post_id uuid,
  p_active boolean
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
    and status = 'published';

  if not found
    or not public.communities_enabled()
    or public.is_blocked_pair(auth.uid(), target.author_id)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Conversation unavailable';
  end if;

  if p_active then
    insert into public.community_saved_posts(post_id, user_id)
    values (p_post_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.community_saved_posts
    where post_id = p_post_id
      and user_id = auth.uid();
  end if;
end;
$$;

create or replace function public.set_community_post_followed(
  p_post_id uuid,
  p_active boolean
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
    and status = 'published';

  if not found
    or not public.communities_enabled()
    or public.is_blocked_pair(auth.uid(), target.author_id)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = target.community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    ) then
    raise exception 'Conversation unavailable';
  end if;

  if p_active then
    insert into public.community_followed_posts(post_id, user_id)
    values (p_post_id, auth.uid())
    on conflict do nothing;
  else
    delete from public.community_followed_posts
    where post_id = p_post_id
      and user_id = auth.uid();
  end if;
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

  update public.community_posts
  set is_pinned = p_pinned,
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
  values (
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
  values (
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

revoke all on function public.list_community_conversations(uuid, text, integer, integer)
  from public;
grant execute on function public.list_community_conversations(uuid, text, integer, integer)
  to authenticated;
revoke all on function public.list_community_posts(uuid, integer, integer)
  from public;
grant execute on function public.list_community_posts(uuid, integer, integer)
  to authenticated;
revoke all on function public.list_community_comments(uuid, integer)
  from public;
grant execute on function public.list_community_comments(uuid, integer)
  to authenticated;
revoke all on function public.create_structured_community_post(uuid, text, text)
  from public;
grant execute on function public.create_structured_community_post(uuid, text, text)
  to authenticated;
revoke all on function public.create_community_comment(uuid, text)
  from public;
grant execute on function public.create_community_comment(uuid, text)
  to authenticated;
revoke all on function public.set_community_post_appreciation(uuid, boolean)
  from public;
grant execute on function public.set_community_post_appreciation(uuid, boolean)
  to authenticated;
revoke all on function public.set_community_post_saved(uuid, boolean)
  from public;
grant execute on function public.set_community_post_saved(uuid, boolean)
  to authenticated;
revoke all on function public.set_community_post_followed(uuid, boolean)
  from public;
grant execute on function public.set_community_post_followed(uuid, boolean)
  to authenticated;
revoke all on function public.set_community_post_pinned(uuid, boolean)
  from public;
grant execute on function public.set_community_post_pinned(uuid, boolean)
  to authenticated;
revoke all on function public.report_community_post(uuid, text, text)
  from public;
grant execute on function public.report_community_post(uuid, text, text)
  to authenticated;

comment on table public.community_saved_posts
  is 'Private per-member community reading list. Saved state is never projected to hosts or analytics.';
comment on table public.community_followed_posts
  is 'Member-controlled notification subscriptions for a community conversation.';
comment on function public.list_community_conversations(uuid, text, integer, integer)
  is 'Structured top-level room conversations with private per-member interaction state.';

commit;
