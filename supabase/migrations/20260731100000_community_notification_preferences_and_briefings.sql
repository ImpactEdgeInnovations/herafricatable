begin;

create table public.community_notification_preferences (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  in_app_replies boolean not null default true,
  email_replies boolean not null default false,
  weekly_briefing boolean not null default true,
  weekly_briefing_email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id),
  constraint community_briefing_email_requires_briefing
    check (weekly_briefing or not weekly_briefing_email)
);

create table public.community_briefing_batches (
  week_start date primary key,
  status text not null default 'processing'
    check (status in ('processing', 'completed')),
  queued_recipients integer not null default 0
    check (queued_recipients >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index community_notification_preferences_user_idx
  on public.community_notification_preferences(user_id, community_id);
create index community_briefing_batches_started_idx
  on public.community_briefing_batches(started_at desc);

alter table public.community_notification_preferences enable row level security;
alter table public.community_briefing_batches enable row level security;

create policy "Members read own community notification preferences"
  on public.community_notification_preferences for select
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = community_notification_preferences.community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  );

create policy "Super admins read community briefing batches"
  on public.community_briefing_batches for select
  to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]));

create or replace function public.get_community_notification_preferences(
  p_community_id uuid
)
returns table(
  in_app_replies boolean,
  email_replies boolean,
  weekly_briefing boolean,
  weekly_briefing_email boolean
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
    coalesce(preference.in_app_replies, true),
    coalesce(preference.email_replies, false),
    coalesce(preference.weekly_briefing, true),
    coalesce(preference.weekly_briefing_email, false)
  from (select 1) seed
  left join public.community_notification_preferences preference
    on preference.community_id = p_community_id
    and preference.user_id = auth.uid();
end;
$$;

create or replace function public.update_community_notification_preferences(
  p_community_id uuid,
  p_in_app_replies boolean,
  p_email_replies boolean,
  p_weekly_briefing boolean,
  p_weekly_briefing_email boolean
)
returns void
language plpgsql
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

  if p_in_app_replies is null
    or p_email_replies is null
    or p_weekly_briefing is null
    or p_weekly_briefing_email is null
    or (not p_weekly_briefing and p_weekly_briefing_email) then
    raise exception 'Choose valid community notification preferences';
  end if;

  insert into public.community_notification_preferences(
    community_id,
    user_id,
    in_app_replies,
    email_replies,
    weekly_briefing,
    weekly_briefing_email
  )
  values (
    p_community_id,
    auth.uid(),
    p_in_app_replies,
    p_email_replies,
    p_weekly_briefing,
    p_weekly_briefing_email
  )
  on conflict (community_id, user_id)
  do update set
    in_app_replies = excluded.in_app_replies,
    email_replies = excluded.email_replies,
    weekly_briefing = excluded.weekly_briefing,
    weekly_briefing_email = excluded.weekly_briefing_email,
    updated_at = now();

  insert into public.audit_events(
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    auth.uid(),
    'community.notification_preferences_updated',
    'community',
    p_community_id,
    jsonb_build_object(
      'in_app_replies', p_in_app_replies,
      'email_replies', p_email_replies,
      'weekly_briefing', p_weekly_briefing,
      'weekly_briefing_email', p_weekly_briefing_email
    )
  );
end;
$$;

create or replace function public.enqueue_community_notification(
  p_community_id uuid,
  p_user_id uuid,
  p_notification_type text,
  p_title text,
  p_body text,
  p_href text,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_notification uuid;
  global_in_app boolean;
  global_email boolean;
  room_in_app boolean;
  room_email boolean;
  recipient_email text;
  inserted_jobs integer := 0;
begin
  if p_notification_type not in ('reply', 'briefing')
    or nullif(trim(p_dedupe_key), '') is null
    or p_href !~ '^/' then
    raise exception 'Invalid community notification';
  end if;

  if not public.communities_enabled()
    or not exists (
      select 1
      from public.community_memberships membership
      join public.profiles profile on profile.id = membership.user_id
      where membership.community_id = p_community_id
        and membership.user_id = p_user_id
        and membership.status = 'active'
        and profile.access_status = 'active'
    ) then
    return false;
  end if;

  insert into public.notification_preferences(user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.community_notification_preferences(community_id, user_id)
  values (p_community_id, p_user_id)
  on conflict (community_id, user_id) do nothing;

  select
    global_preference.in_app_enabled,
    global_preference.email_network,
    case p_notification_type
      when 'reply' then room_preference.in_app_replies
      else room_preference.weekly_briefing
    end,
    case p_notification_type
      when 'reply' then room_preference.email_replies
      else room_preference.weekly_briefing
        and room_preference.weekly_briefing_email
    end,
    account.email::text
  into
    global_in_app,
    global_email,
    room_in_app,
    room_email,
    recipient_email
  from public.notification_preferences global_preference
  join public.community_notification_preferences room_preference
    on room_preference.user_id = global_preference.user_id
    and room_preference.community_id = p_community_id
  join auth.users account on account.id = global_preference.user_id
  where global_preference.user_id = p_user_id;

  if global_in_app and room_in_app then
    insert into public.notifications(
      user_id,
      kind,
      title,
      body,
      href,
      dedupe_key
    )
    values (
      p_user_id,
      'community',
      left(trim(p_title), 160),
      left(trim(p_body), 1000),
      p_href,
      trim(p_dedupe_key)
    )
    on conflict (user_id, dedupe_key)
    do update set
      title = excluded.title,
      body = excluded.body,
      href = excluded.href
    returning id into saved_notification;
  end if;

  if global_email and room_email and recipient_email is not null then
    insert into public.notification_jobs(
      notification_id,
      user_id,
      template_key,
      to_email,
      payload,
      dedupe_key
    )
    values (
      saved_notification,
      p_user_id,
      'community',
      recipient_email,
      jsonb_build_object(
        'title', left(trim(p_title), 160),
        'body', left(trim(p_body), 1000),
        'href', p_href
      ),
      trim(p_dedupe_key)
    )
    on conflict (user_id, channel, dedupe_key) do nothing;
    get diagnostics inserted_jobs = row_count;
  end if;

  return saved_notification is not null or inserted_jobs > 0;
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

  perform public.enqueue_community_notification(
    parent.community_id,
    recipient.user_id,
    'reply',
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

create or replace function public.queue_community_weekly_briefings(
  p_run_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_week date :=
    date_trunc('week', p_run_at at time zone 'Africa/Nairobi')::date;
  recipient record;
  briefing_body text;
  queued integer := 0;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if not public.communities_enabled() then
    return 0;
  end if;

  insert into public.community_briefing_batches(week_start)
  values (target_week)
  on conflict (week_start) do nothing;

  if not found then
    return 0;
  end if;

  for recipient in
    select
      community.id as community_id,
      community.slug,
      community.name,
      membership.user_id,
      activity.post_count,
      activity.comment_count,
      activity.unanswered_asks,
      activity.upcoming_gatherings
    from public.community_memberships membership
    join public.communities community on community.id = membership.community_id
    join public.profiles profile on profile.id = membership.user_id
    cross join lateral (
      select
        (
          select count(*)
          from public.community_posts post
          join public.profiles author on author.id = post.author_id
          where post.community_id = community.id
            and post.parent_post_id is null
            and post.status = 'published'
            and post.created_at >= p_run_at - interval '7 days'
            and post.created_at < p_run_at
            and author.access_status = 'active'
            and not author.is_test_account
            and not public.is_blocked_pair(membership.user_id, post.author_id)
        ) as post_count,
        (
          select count(*)
          from public.community_posts comment
          join public.profiles author on author.id = comment.author_id
          where comment.community_id = community.id
            and comment.parent_post_id is not null
            and comment.status = 'published'
            and comment.created_at >= p_run_at - interval '7 days'
            and comment.created_at < p_run_at
            and author.access_status = 'active'
            and not author.is_test_account
            and not public.is_blocked_pair(membership.user_id, comment.author_id)
        ) as comment_count,
        (
          select count(*)
          from public.community_posts ask
          join public.profiles author on author.id = ask.author_id
          where ask.community_id = community.id
            and ask.parent_post_id is null
            and ask.category = 'ask'
            and ask.status = 'published'
            and author.access_status = 'active'
            and not author.is_test_account
            and not public.is_blocked_pair(membership.user_id, ask.author_id)
            and not exists (
              select 1
              from public.community_posts reply
              where reply.parent_post_id = ask.id
                and reply.status = 'published'
                and not public.is_blocked_pair(membership.user_id, reply.author_id)
            )
        ) as unanswered_asks,
        (
          select count(*)
          from public.community_event_links link
          join public.events event on event.id = link.event_id
          where link.community_id = community.id
            and event.status = 'published'
            and event.starts_at >= p_run_at
            and event.starts_at < p_run_at + interval '7 days'
        ) as upcoming_gatherings
    ) activity
    where membership.status = 'active'
      and community.status = 'published'
      and profile.access_status = 'active'
      and not profile.is_test_account
      and (
        activity.post_count > 0
        or activity.comment_count > 0
        or activity.upcoming_gatherings > 0
      )
  loop
    briefing_body :=
      recipient.post_count || ' new conversation'
      || case when recipient.post_count = 1 then '' else 's' end
      || ' · ' || recipient.comment_count || ' thoughtful repl'
      || case when recipient.comment_count = 1 then 'y' else 'ies' end
      || ' · ' || recipient.unanswered_asks || ' Ask'
      || case when recipient.unanswered_asks = 1 then '' else 's' end
      || ' still open · ' || recipient.upcoming_gatherings || ' gathering'
      || case when recipient.upcoming_gatherings = 1 then '' else 's' end
      || ' in the next seven days. Open the room when it serves you.';

    if public.enqueue_community_notification(
      recipient.community_id,
      recipient.user_id,
      'briefing',
      recipient.name || ': this week at the table',
      briefing_body,
      '/communities/' || recipient.slug,
      'community-weekly:' || recipient.community_id::text
        || ':' || recipient.user_id::text || ':' || target_week::text
    ) then
      queued := queued + 1;
    end if;
  end loop;

  update public.community_briefing_batches
  set status = 'completed',
      queued_recipients = queued,
      completed_at = now()
  where week_start = target_week;

  return queued;
end;
$$;

create or replace function public.list_community_briefing_batches()
returns table(
  week_start date,
  status text,
  queued_recipients integer,
  started_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  return query
  select
    batch.week_start,
    batch.status,
    batch.queued_recipients,
    batch.started_at,
    batch.completed_at
  from public.community_briefing_batches batch
  order by batch.week_start desc
  limit 12;
end;
$$;

revoke all on function public.get_community_notification_preferences(uuid)
  from public;
grant execute on function public.get_community_notification_preferences(uuid)
  to authenticated;
revoke all on function public.update_community_notification_preferences(
  uuid,
  boolean,
  boolean,
  boolean,
  boolean
) from public;
grant execute on function public.update_community_notification_preferences(
  uuid,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;
revoke all on function public.enqueue_community_notification(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text
) from public;
revoke all on function public.create_community_comment(uuid, text) from public;
grant execute on function public.create_community_comment(uuid, text)
  to authenticated;
revoke all on function public.queue_community_weekly_briefings(timestamptz)
  from public;
grant execute on function public.queue_community_weekly_briefings(timestamptz)
  to service_role;
revoke all on function public.list_community_briefing_batches() from public;
grant execute on function public.list_community_briefing_batches()
  to authenticated;

comment on table public.community_notification_preferences
  is 'Member-controlled delivery choices for one community; reply email defaults off to prevent notification fatigue.';
comment on table public.community_briefing_batches
  is 'Idempotent weekly aggregate community briefing runs, without post bodies or private member data.';
comment on function public.queue_community_weekly_briefings(timestamptz)
  is 'Queues one privacy-safe weekly community summary only when new activity or an imminent gathering exists.';

commit;
