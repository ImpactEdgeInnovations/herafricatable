begin;

create table public.community_event_links (
  community_id uuid not null references public.communities(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  is_featured boolean not null default false,
  linked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, event_id)
);

create table public.community_course_links (
  community_id uuid not null references public.communities(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  is_featured boolean not null default false,
  linked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, course_id)
);

create index community_event_links_event_idx
  on public.community_event_links(event_id, community_id);
create index community_course_links_course_idx
  on public.community_course_links(course_id, community_id);

alter table public.community_event_links enable row level security;
alter table public.community_course_links enable row level security;

create policy "Room members read linked community events"
  on public.community_event_links for select
  to authenticated
  using (
    public.communities_enabled()
    and exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = community_event_links.community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

create policy "Room members read linked community courses"
  on public.community_course_links for select
  to authenticated
  using (
    public.communities_enabled()
    and exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = community_course_links.community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

create or replace function public.list_community_gatherings(
  p_community_id uuid
)
returns table(
  event_id uuid,
  slug text,
  title text,
  summary text,
  format text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue_name text,
  city text,
  country text,
  is_featured boolean
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
    event.id,
    event.slug,
    event.title,
    event.summary,
    event.format,
    event.starts_at,
    event.ends_at,
    venue.name,
    venue.city,
    venue.country,
    link.is_featured
  from public.community_event_links link
  join public.events event on event.id = link.event_id
  left join public.venues venue on venue.id = event.venue_id
  where link.community_id = p_community_id
    and event.status = 'published'
  order by
    link.is_featured desc,
    case when event.ends_at >= now() then 0 else 1 end,
    case when event.ends_at >= now() then event.starts_at end,
    event.starts_at desc;
end;
$$;

create or replace function public.list_community_resources(
  p_community_id uuid
)
returns table(
  course_id uuid,
  slug text,
  title text,
  summary text,
  instructor_name text,
  access_type text,
  lesson_count bigint,
  enrollment_status text,
  is_featured boolean
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

  if not public.learning_enabled() then
    return;
  end if;

  return query
  select
    course.id,
    course.slug,
    course.title,
    course.summary,
    course.instructor_name,
    course.access_type,
    (
      select count(*)
      from public.course_lessons lesson
      where lesson.course_id = course.id
        and lesson.status = 'published'
    ),
    enrollment.status,
    link.is_featured
  from public.community_course_links link
  join public.courses course on course.id = link.course_id
  left join public.course_enrollments enrollment
    on enrollment.course_id = course.id
    and enrollment.user_id = auth.uid()
  where link.community_id = p_community_id
    and course.status = 'published'
  order by link.is_featured desc, link.created_at desc;
end;
$$;

create or replace function public.set_community_event_link(
  p_community_id uuid,
  p_event_id uuid,
  p_active boolean,
  p_featured boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  if p_active then
    if not exists (
      select 1 from public.events
      where id = p_event_id and status = 'published'
    ) then
      raise exception 'Only a published event can be added';
    end if;

    insert into public.community_event_links(
      community_id,
      event_id,
      is_featured,
      linked_by
    )
    values (
      p_community_id,
      p_event_id,
      coalesce(p_featured, false),
      auth.uid()
    )
    on conflict (community_id, event_id)
    do update set
      is_featured = excluded.is_featured,
      linked_by = auth.uid(),
      updated_at = now();
  else
    delete from public.community_event_links
    where community_id = p_community_id and event_id = p_event_id;
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    case when p_active
      then 'community.event_linked'
      else 'community.event_unlinked'
    end,
    'event',
    p_event_id,
    jsonb_build_object(
      'community_id', p_community_id,
      'featured', case when p_active then coalesce(p_featured, false) else false end
    )
  );
end;
$$;

create or replace function public.set_community_course_link(
  p_community_id uuid,
  p_course_id uuid,
  p_active boolean,
  p_featured boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  if p_active then
    if not exists (
      select 1 from public.courses
      where id = p_course_id and status = 'published'
    ) then
      raise exception 'Only a published resource can be added';
    end if;

    insert into public.community_course_links(
      community_id,
      course_id,
      is_featured,
      linked_by
    )
    values (
      p_community_id,
      p_course_id,
      coalesce(p_featured, false),
      auth.uid()
    )
    on conflict (community_id, course_id)
    do update set
      is_featured = excluded.is_featured,
      linked_by = auth.uid(),
      updated_at = now();
  else
    delete from public.community_course_links
    where community_id = p_community_id and course_id = p_course_id;
  end if;

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    case when p_active
      then 'community.course_linked'
      else 'community.course_unlinked'
    end,
    'course',
    p_course_id,
    jsonb_build_object(
      'community_id', p_community_id,
      'featured', case when p_active then coalesce(p_featured, false) else false end
    )
  );
end;
$$;

create or replace function public.list_community_programming_options(
  p_community_id uuid
)
returns table(
  item_type text,
  item_id uuid,
  slug text,
  title text,
  summary text,
  starts_at timestamptz,
  format text,
  access_type text,
  is_linked boolean,
  is_featured boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  return query
  select programming.*
  from (
    select
      'event'::text as item_type,
      event.id as item_id,
      event.slug,
      event.title,
      event.summary,
      event.starts_at,
      event.format,
      null::text as access_type,
      link.event_id is not null as is_linked,
      coalesce(link.is_featured, false) as is_featured
    from public.events event
    left join public.community_event_links link
      on link.event_id = event.id
      and link.community_id = p_community_id
    where event.status = 'published'

    union all

    select
      'resource'::text,
      course.id,
      course.slug,
      course.title,
      course.summary,
      null::timestamptz,
      null::text,
      course.access_type,
      link.course_id is not null,
      coalesce(link.is_featured, false)
    from public.courses course
    left join public.community_course_links link
      on link.course_id = course.id
      and link.community_id = p_community_id
    where course.status = 'published'
  ) programming
  order by programming.item_type, programming.starts_at nulls last, programming.title;
end;
$$;

create or replace function public.get_community_host_health(
  p_community_id uuid
)
returns table(
  active_members bigint,
  pending_members bigint,
  posts_7d bigint,
  comments_7d bigint,
  unanswered_asks bigint,
  open_reports bigint,
  upcoming_gatherings bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_community(p_community_id) then
    raise exception 'Community host or moderator required';
  end if;

  return query
  select
    (
      select count(*)
      from public.community_memberships membership
      join public.profiles profile on profile.id = membership.user_id
      where membership.community_id = p_community_id
        and membership.status = 'active'
        and profile.access_status = 'active'
        and not coalesce(profile.is_test_account, false)
    ),
    (
      select count(*)
      from public.community_memberships membership
      join public.profiles profile on profile.id = membership.user_id
      where membership.community_id = p_community_id
        and membership.status in ('requested', 'invited')
        and not coalesce(profile.is_test_account, false)
    ),
    (
      select count(*)
      from public.community_posts post
      join public.profiles profile on profile.id = post.author_id
      where post.community_id = p_community_id
        and post.parent_post_id is null
        and post.status = 'published'
        and post.created_at >= now() - interval '7 days'
        and profile.access_status = 'active'
        and not coalesce(profile.is_test_account, false)
    ),
    (
      select count(*)
      from public.community_posts comment
      join public.profiles profile on profile.id = comment.author_id
      where comment.community_id = p_community_id
        and comment.parent_post_id is not null
        and comment.status = 'published'
        and comment.created_at >= now() - interval '7 days'
        and profile.access_status = 'active'
        and not coalesce(profile.is_test_account, false)
    ),
    (
      select count(*)
      from public.community_posts post
      join public.profiles profile on profile.id = post.author_id
      where post.community_id = p_community_id
        and post.parent_post_id is null
        and post.category = 'ask'
        and post.status = 'published'
        and profile.access_status = 'active'
        and not coalesce(profile.is_test_account, false)
        and not exists (
          select 1
          from public.community_posts comment
          where comment.parent_post_id = post.id
            and comment.status = 'published'
        )
    ),
    (
      select count(*)
      from public.community_post_reports report
      join public.community_posts post on post.id = report.post_id
      where post.community_id = p_community_id
        and report.status in ('open', 'reviewing')
    ),
    (
      select count(*)
      from public.community_event_links link
      join public.events event on event.id = link.event_id
      where link.community_id = p_community_id
        and event.status = 'published'
        and event.ends_at >= now()
    );
end;
$$;

revoke all on function public.list_community_gatherings(uuid) from public;
grant execute on function public.list_community_gatherings(uuid) to authenticated;
revoke all on function public.list_community_resources(uuid) from public;
grant execute on function public.list_community_resources(uuid) to authenticated;
revoke all on function public.set_community_event_link(uuid, uuid, boolean, boolean)
  from public;
grant execute on function public.set_community_event_link(uuid, uuid, boolean, boolean)
  to authenticated;
revoke all on function public.set_community_course_link(uuid, uuid, boolean, boolean)
  from public;
grant execute on function public.set_community_course_link(uuid, uuid, boolean, boolean)
  to authenticated;
revoke all on function public.list_community_programming_options(uuid) from public;
grant execute on function public.list_community_programming_options(uuid)
  to authenticated;
revoke all on function public.get_community_host_health(uuid) from public;
grant execute on function public.get_community_host_health(uuid) to authenticated;

comment on table public.community_event_links
  is 'Host-curated events shown inside a community room.';
comment on table public.community_course_links
  is 'Host-curated learning resources shown inside a community room.';
comment on function public.get_community_host_health(uuid)
  is 'Privacy-safe aggregate signals for community owners and moderators; no member content bodies or private saved state.';

commit;
