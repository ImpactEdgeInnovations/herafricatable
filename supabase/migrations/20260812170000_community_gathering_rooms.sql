begin;

create table if not exists public.community_gathering_rooms (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  gathering_kind text not null default 'community_catch_up' check (
    gathering_kind in (
      'community_catch_up', 'networking_circle', 'workshop',
      'guest_conversation', 'webinar', 'accountability_session',
      'social_wellbeing'
    )
  ),
  meeting_provider text check (
    meeting_provider is null or meeting_provider in (
      'google_meet', 'zoom', 'microsoft_teams', 'other'
    )
  ),
  meeting_url text check (
    meeting_url is null or meeting_url ~ '^https://'
  ),
  chat_enabled boolean not null default true,
  chat_mode text not null default 'open' check (
    chat_mode in ('open', 'slow', 'hosts_only', 'closed')
  ),
  questions_open_at timestamptz not null,
  chat_opens_at timestamptz not null,
  chat_closes_at timestamptz not null,
  recap_body text check (
    recap_body is null or char_length(recap_body) between 20 and 3000
  ),
  recap_post_id uuid references public.community_posts(id) on delete set null,
  recap_published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (community_id, event_id),
  foreign key (community_id, event_id)
    references public.community_event_links(community_id, event_id)
    on delete cascade,
  constraint community_gathering_room_window check (
    questions_open_at <= chat_opens_at and chat_closes_at > chat_opens_at
  )
);

create table if not exists public.community_gathering_rsvps (
  room_id uuid not null references public.community_gathering_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('going', 'not_going')),
  discoverable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.community_gathering_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_gathering_rooms(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 2 and 600),
  status text not null default 'published' check (
    status in ('published', 'removed')
  ),
  is_pinned boolean not null default false,
  pinned_by uuid references auth.users(id) on delete set null,
  pinned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gathering_removed_message_not_pinned check (
    status = 'published' or not is_pinned
  )
);

create table if not exists public.community_gathering_questions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.community_gathering_rooms(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 10 and 600),
  status text not null default 'open' check (
    status in ('open', 'answered', 'dismissed')
  ),
  answered_at timestamptz,
  answered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_gathering_question_supports (
  question_id uuid not null references public.community_gathering_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create table if not exists public.community_gathering_message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.community_gathering_messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'privacy', 'spam', 'safety', 'other')),
  details text not null check (char_length(details) between 10 and 1000),
  evidence_snapshot jsonb not null,
  status text not null default 'open' check (
    status in ('open', 'reviewing', 'resolved', 'dismissed')
  ),
  assigned_to uuid references auth.users(id) on delete set null,
  outcome text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, reporter_id)
);

create index if not exists gathering_rooms_community_time_idx
  on public.community_gathering_rooms(community_id, chat_opens_at, chat_closes_at);
create index if not exists gathering_rsvps_room_status_idx
  on public.community_gathering_rsvps(room_id, status, updated_at desc);
create index if not exists gathering_messages_room_created_idx
  on public.community_gathering_messages(room_id, created_at desc)
  where status = 'published';
create index if not exists gathering_questions_room_status_idx
  on public.community_gathering_questions(room_id, status, created_at);
create index if not exists gathering_message_reports_status_idx
  on public.community_gathering_message_reports(status, created_at);

alter table public.community_gathering_rooms enable row level security;
alter table public.community_gathering_rsvps enable row level security;
alter table public.community_gathering_messages enable row level security;
alter table public.community_gathering_questions enable row level security;
alter table public.community_gathering_question_supports enable row level security;
alter table public.community_gathering_message_reports enable row level security;

revoke all on table public.community_gathering_rooms from anon, authenticated;
revoke all on table public.community_gathering_rsvps from anon, authenticated;
revoke all on table public.community_gathering_messages from anon, authenticated;
revoke all on table public.community_gathering_questions from anon, authenticated;
revoke all on table public.community_gathering_question_supports from anon, authenticated;
revoke all on table public.community_gathering_message_reports from anon, authenticated;
grant select on table public.community_gathering_rooms to authenticated;
grant select on table public.community_gathering_rsvps to authenticated;
grant select on table public.community_gathering_messages to authenticated;
grant select on table public.community_gathering_questions to authenticated;
grant select on table public.community_gathering_question_supports to authenticated;
grant select on table public.community_gathering_message_reports to authenticated;

create or replace function public.can_access_community_gathering(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.can_manage_community(room.community_id, p_user_id)
    or (
      public.communities_enabled()
      and exists (
        select 1
        from public.community_memberships membership
        where membership.community_id = room.community_id
          and membership.user_id = p_user_id
          and membership.status = 'active'
      )
    )
  from public.community_gathering_rooms room
  join public.events event on event.id = room.event_id
  where room.id = p_room_id
    and event.status in ('published', 'completed');
$$;

drop policy if exists "Community members read gathering rooms"
  on public.community_gathering_rooms;
create policy "Community members read gathering rooms"
  on public.community_gathering_rooms for select to authenticated
  using (public.can_access_community_gathering(id));

drop policy if exists "Community members read gathering responses"
  on public.community_gathering_rsvps;
create policy "Community members read gathering responses"
  on public.community_gathering_rsvps for select to authenticated
  using (
    user_id = auth.uid()
    or public.can_manage_community(
      (
        select room.community_id
        from public.community_gathering_rooms room
        where room.id = community_gathering_rsvps.room_id
      )
    )
    or (
      discoverable and status = 'going'
      and public.can_access_community_gathering(room_id)
      and not public.is_blocked_pair(auth.uid(), user_id)
    )
  );

drop policy if exists "Community members read gathering messages"
  on public.community_gathering_messages;
create policy "Community members read gathering messages"
  on public.community_gathering_messages for select to authenticated
  using (
    public.can_access_community_gathering(room_id)
    and (author_id = auth.uid() or not public.is_blocked_pair(auth.uid(), author_id))
  );

drop policy if exists "Community members read gathering questions"
  on public.community_gathering_questions;
create policy "Community members read gathering questions"
  on public.community_gathering_questions for select to authenticated
  using (
    public.can_access_community_gathering(room_id)
    and (author_id = auth.uid() or not public.is_blocked_pair(auth.uid(), author_id))
  );

drop policy if exists "Community members read question support"
  on public.community_gathering_question_supports;
create policy "Community members read question support"
  on public.community_gathering_question_supports for select to authenticated
  using (
    exists (
      select 1 from public.community_gathering_questions question
      where question.id = question_id
        and public.can_access_community_gathering(question.room_id)
        and (question.author_id = auth.uid()
          or not public.is_blocked_pair(auth.uid(), question.author_id))
    )
  );

drop policy if exists "Members read own gathering reports"
  on public.community_gathering_message_reports;
create policy "Members read own gathering reports"
  on public.community_gathering_message_reports for select to authenticated
  using (reporter_id = auth.uid());

create or replace function public.seed_community_gathering_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target public.events%rowtype;
begin
  select * into target from public.events where id = new.event_id;
  if not found then return new; end if;
  insert into public.community_gathering_rooms(
    community_id, event_id, questions_open_at, chat_opens_at,
    chat_closes_at, created_by, updated_by
  ) values (
    new.community_id, new.event_id,
    target.starts_at - interval '7 days',
    target.starts_at - interval '30 minutes',
    target.ends_at + interval '24 hours',
    new.linked_by, new.linked_by
  ) on conflict (community_id, event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists seed_gathering_room_on_community_event
  on public.community_event_links;
create trigger seed_gathering_room_on_community_event
after insert on public.community_event_links
for each row execute function public.seed_community_gathering_room();

insert into public.community_gathering_rooms(
  community_id, event_id, questions_open_at, chat_opens_at,
  chat_closes_at, created_by, updated_by
)
select link.community_id, event.id,
  event.starts_at - interval '7 days',
  event.starts_at - interval '30 minutes',
  event.ends_at + interval '24 hours',
  link.linked_by, link.linked_by
from public.community_event_links link
join public.events event on event.id = link.event_id
on conflict (community_id, event_id) do nothing;

create or replace function public.sync_community_gathering_room_times()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at then
    update public.community_gathering_rooms room
    set questions_open_at = new.starts_at - interval '7 days',
        chat_opens_at = new.starts_at - interval '30 minutes',
        chat_closes_at = new.ends_at + interval '24 hours',
        updated_at = now()
    where room.event_id = new.id
      and room.recap_published_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_gathering_room_on_event_change on public.events;
create trigger sync_gathering_room_on_event_change
after update of starts_at, ends_at on public.events
for each row execute function public.sync_community_gathering_room_times();

create or replace function public.list_community_gathering_cards(
  p_community_id uuid
)
returns table(
  room_id uuid,
  event_id uuid,
  event_slug text,
  title text,
  summary text,
  format text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  venue_name text,
  city text,
  country text,
  gathering_kind text,
  chat_phase text,
  my_rsvp text,
  going_count bigint,
  question_count bigint,
  recap_published boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.community_memberships membership
    where membership.community_id = p_community_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  ) and not public.can_manage_community(p_community_id) then
    raise exception 'Active Community membership required';
  end if;
  return query
  select room.id, event.id, event.slug, event.title, event.summary,
    event.format, event.starts_at, event.ends_at, event.timezone,
    venue.name, venue.city, venue.country, room.gathering_kind,
    case
      when not room.chat_enabled or room.chat_mode = 'closed' then 'closed'
      when now() < room.chat_opens_at then 'before'
      when now() <= room.chat_closes_at then 'open'
      else 'archived'
    end,
    rsvp.status,
    (select count(*) from public.community_gathering_rsvps response
      where response.room_id = room.id and response.status = 'going'),
    (select count(*) from public.community_gathering_questions question
      where question.room_id = room.id and question.status <> 'dismissed'),
    room.recap_published_at is not null
  from public.community_gathering_rooms room
  join public.events event on event.id = room.event_id
  left join public.venues venue on venue.id = event.venue_id
  left join public.community_gathering_rsvps rsvp
    on rsvp.room_id = room.id and rsvp.user_id = auth.uid()
  where room.community_id = p_community_id
    and event.status in ('published', 'completed')
  order by case when event.ends_at >= now() then 0 else 1 end,
    case when event.ends_at >= now() then event.starts_at end,
    event.starts_at desc;
end;
$$;

create or replace function public.get_community_gathering_room(
  p_community_id uuid,
  p_event_id uuid
)
returns table(
  room_id uuid,
  community_name text,
  community_slug text,
  event_slug text,
  title text,
  summary text,
  format text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  venue_name text,
  city text,
  country text,
  gathering_kind text,
  meeting_provider text,
  meeting_url text,
  questions_open_at timestamptz,
  chat_opens_at timestamptz,
  chat_closes_at timestamptz,
  chat_mode text,
  chat_phase text,
  my_rsvp text,
  my_discoverable boolean,
  can_manage boolean,
  going_count bigint,
  recap_body text,
  recap_published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select room.id, community.name, community.slug, event.slug,
    event.title, event.summary, event.format, event.starts_at,
    event.ends_at, event.timezone, venue.name, venue.city, venue.country,
    room.gathering_kind, room.meeting_provider,
    case when
      public.can_manage_community(room.community_id)
      or (
        rsvp.status = 'going'
        and now() between event.starts_at - interval '30 minutes'
          and event.ends_at + interval '1 hour'
      ) then room.meeting_url else null end,
    room.questions_open_at, room.chat_opens_at, room.chat_closes_at,
    room.chat_mode,
    case
      when not room.chat_enabled or room.chat_mode = 'closed' then 'closed'
      when now() < room.chat_opens_at then 'before'
      when now() <= room.chat_closes_at then 'open'
      else 'archived'
    end,
    rsvp.status, coalesce(rsvp.discoverable, false),
    public.can_manage_community(room.community_id),
    (select count(*) from public.community_gathering_rsvps response
      where response.room_id = room.id and response.status = 'going'),
    room.recap_body, room.recap_published_at
  from public.community_gathering_rooms room
  join public.communities community on community.id = room.community_id
  join public.events event on event.id = room.event_id
  left join public.venues venue on venue.id = event.venue_id
  left join public.community_gathering_rsvps rsvp
    on rsvp.room_id = room.id and rsvp.user_id = auth.uid()
  where room.community_id = p_community_id
    and room.event_id = p_event_id
    and public.can_access_community_gathering(room.id);
end;
$$;

create or replace function public.set_community_gathering_rsvp(
  p_room_id uuid,
  p_status text,
  p_discoverable boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target record;
begin
  if p_status not in ('going', 'not_going') then
    raise exception 'Choose going or not going';
  end if;
  if not public.can_access_community_gathering(p_room_id) then
    raise exception 'Gathering unavailable';
  end if;
  select event.ends_at, event.capacity into target
  from public.community_gathering_rooms room
  join public.events event on event.id = room.event_id
  where room.id = p_room_id;
  if target.ends_at <= now() then raise exception 'This gathering has ended'; end if;
  if p_status = 'going' and target.capacity is not null and (
    select count(*) from public.community_gathering_rsvps response
    where response.room_id = p_room_id and response.status = 'going'
      and response.user_id <> auth.uid()
  ) >= target.capacity then raise exception 'This gathering is full'; end if;
  insert into public.community_gathering_rsvps(room_id, user_id, status, discoverable)
  values(p_room_id, auth.uid(), p_status, coalesce(p_discoverable, false))
  on conflict(room_id, user_id) do update set
    status = excluded.status, discoverable = excluded.discoverable,
    updated_at = now();
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'community.gathering_rsvp_changed', 'community_gathering_room',
    p_room_id, jsonb_build_object('status', p_status, 'discoverable', coalesce(p_discoverable, false)));
end;
$$;

create or replace function public.list_community_gathering_attendees(p_room_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, job_title text, company text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_access_community_gathering(p_room_id) then
    raise exception 'Gathering unavailable';
  end if;
  return query
  select profile.id, profile.display_name, profile.avatar_url,
    profile.job_title, profile.company
  from public.community_gathering_rsvps response
  join public.profiles profile on profile.id = response.user_id
  where response.room_id = p_room_id and response.status = 'going'
    and (response.user_id = auth.uid()
      or not public.is_blocked_pair(auth.uid(), response.user_id))
    and (response.discoverable or response.user_id = auth.uid()
      or public.can_manage_community((select room.community_id from public.community_gathering_rooms room where room.id = p_room_id)))
  order by profile.display_name;
end;
$$;

create or replace function public.list_community_gathering_messages(
  p_room_id uuid,
  p_limit integer default 100
)
returns table(
  message_id uuid, author_id uuid, author_name text, author_avatar_url text,
  body text, is_pinned boolean, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_access_community_gathering(p_room_id) then
    raise exception 'Gathering unavailable';
  end if;
  return query
  select message.id, message.author_id, profile.display_name,
    profile.avatar_url, message.body, message.is_pinned, message.created_at
  from public.community_gathering_messages message
  join public.profiles profile on profile.id = message.author_id
  where message.room_id = p_room_id and message.status = 'published'
    and (message.author_id = auth.uid()
      or not public.is_blocked_pair(auth.uid(), message.author_id))
  order by message.is_pinned desc, message.created_at asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
end;
$$;

create or replace function public.send_community_gathering_message(
  p_room_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare room public.community_gathering_rooms%rowtype; saved uuid; clean_body text := trim(coalesce(p_body, ''));
begin
  select * into room from public.community_gathering_rooms where id = p_room_id for update;
  if not found or not public.can_access_community_gathering(p_room_id) then
    raise exception 'Gathering unavailable';
  end if;
  if not room.chat_enabled or room.chat_mode = 'closed'
    or now() not between room.chat_opens_at and room.chat_closes_at then
    raise exception 'Live conversation is not open';
  end if;
  if room.chat_mode = 'hosts_only' and not public.can_manage_community(room.community_id) then
    raise exception 'Only Hosts can post while the conversation is paused';
  end if;
  if not public.can_manage_community(room.community_id) and not exists (
    select 1 from public.community_gathering_rsvps response
    where response.room_id = p_room_id and response.user_id = auth.uid()
      and response.status = 'going'
  ) then raise exception 'RSVP before joining the live conversation'; end if;
  if char_length(clean_body) not between 2 and 600 then
    raise exception 'Keep your message between 2 and 600 characters';
  end if;
  if (select count(*) from public.community_gathering_messages message
    where message.author_id = auth.uid() and message.created_at >= now() - interval '1 minute') >= 10 then
    raise exception 'Please pause for a moment before sending another message';
  end if;
  if room.chat_mode = 'slow' and exists (
    select 1 from public.community_gathering_messages message
    where message.author_id = auth.uid()
      and message.created_at >= now() - interval '30 seconds'
  ) then raise exception 'Slow mode is on. Please wait 30 seconds'; end if;
  insert into public.community_gathering_messages(
    room_id, community_id, event_id, author_id, body
  ) values(room.id, room.community_id, room.event_id, auth.uid(), clean_body)
  returning id into saved;
  return saved;
end;
$$;

create or replace function public.list_community_gathering_questions(p_room_id uuid)
returns table(
  question_id uuid, author_id uuid, author_name text, body text,
  question_status text, support_count bigint, supported_by_me boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_access_community_gathering(p_room_id) then
    raise exception 'Gathering unavailable';
  end if;
  return query
  select question.id, question.author_id, profile.display_name, question.body,
    question.status,
    (select count(*) from public.community_gathering_question_supports support where support.question_id = question.id),
    exists(select 1 from public.community_gathering_question_supports support where support.question_id = question.id and support.user_id = auth.uid()),
    question.created_at
  from public.community_gathering_questions question
  join public.profiles profile on profile.id = question.author_id
  where question.room_id = p_room_id and question.status <> 'dismissed'
    and (question.author_id = auth.uid()
      or not public.is_blocked_pair(auth.uid(), question.author_id))
  order by case question.status when 'open' then 0 else 1 end,
    (select count(*) from public.community_gathering_question_supports support where support.question_id = question.id) desc,
    question.created_at;
end;
$$;

create or replace function public.submit_community_gathering_question(
  p_room_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare room public.community_gathering_rooms%rowtype; saved uuid; clean_body text := trim(coalesce(p_body, ''));
begin
  select * into room from public.community_gathering_rooms where id = p_room_id;
  if not found or not public.can_access_community_gathering(p_room_id) then
    raise exception 'Gathering unavailable';
  end if;
  if now() < room.questions_open_at or now() > room.chat_closes_at then
    raise exception 'Questions are not open';
  end if;
  if char_length(clean_body) not between 10 and 600 then
    raise exception 'Keep your question between 10 and 600 characters';
  end if;
  if (select count(*) from public.community_gathering_questions question
    where question.author_id = auth.uid() and question.created_at >= now() - interval '1 hour') >= 5 then
    raise exception 'You have reached the question limit for this hour';
  end if;
  insert into public.community_gathering_questions(room_id, author_id, body)
  values(p_room_id, auth.uid(), clean_body) returning id into saved;
  return saved;
end;
$$;

create or replace function public.toggle_community_gathering_question_support(p_question_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare target public.community_gathering_questions%rowtype;
begin
  select * into target from public.community_gathering_questions where id = p_question_id;
  if not found or not public.can_access_community_gathering(target.room_id)
    or (target.author_id <> auth.uid()
      and public.is_blocked_pair(auth.uid(), target.author_id)) then
    raise exception 'Question unavailable';
  end if;
  delete from public.community_gathering_question_supports
  where question_id = p_question_id and user_id = auth.uid();
  if found then return false; end if;
  insert into public.community_gathering_question_supports(question_id, user_id)
  values(p_question_id, auth.uid());
  return true;
end;
$$;

create or replace function public.manage_community_gathering_message(
  p_message_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target public.community_gathering_messages%rowtype;
begin
  select * into target from public.community_gathering_messages where id = p_message_id for update;
  if not found or not public.can_manage_community(target.community_id) then
    raise exception 'Host access required';
  end if;
  if p_action = 'remove' then
    update public.community_gathering_messages set status = 'removed',
      body = '[Removed by a Community Host]', is_pinned = false,
      pinned_by = null, pinned_at = null, updated_at = now()
    where id = target.id;
  elsif p_action = 'pin' then
    if (select count(*) from public.community_gathering_messages message
      where message.room_id = target.room_id and message.is_pinned and message.id <> target.id) >= 3 then
      raise exception 'A gathering can have up to three pinned messages';
    end if;
    update public.community_gathering_messages set is_pinned = true,
      pinned_by = auth.uid(), pinned_at = now(), updated_at = now()
    where id = target.id and status = 'published';
  elsif p_action = 'unpin' then
    update public.community_gathering_messages set is_pinned = false,
      pinned_by = null, pinned_at = null, updated_at = now()
    where id = target.id;
  else raise exception 'Choose pin, unpin or remove'; end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'community.gathering_message_' || p_action,
    'community_gathering_message', target.id,
    jsonb_build_object('community_id', target.community_id, 'event_id', target.event_id));
end;
$$;

create or replace function public.review_community_gathering_question(
  p_question_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target record;
begin
  select question.*, room.community_id into target
  from public.community_gathering_questions question
  join public.community_gathering_rooms room on room.id = question.room_id
  where question.id = p_question_id;
  if not found or not public.can_manage_community(target.community_id) then
    raise exception 'Host access required';
  end if;
  if p_status not in ('open', 'answered', 'dismissed') then
    raise exception 'Choose open, answered or dismissed';
  end if;
  update public.community_gathering_questions set status = p_status,
    answered_at = case when p_status = 'answered' then now() else null end,
    answered_by = case when p_status = 'answered' then auth.uid() else null end,
    updated_at = now() where id = p_question_id;
end;
$$;

create or replace function public.report_community_gathering_message(
  p_message_id uuid,
  p_reason text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare target record; saved uuid;
begin
  select message.*, profile.display_name into target
  from public.community_gathering_messages message
  join public.profiles profile on profile.id = message.author_id
  where message.id = p_message_id and message.status = 'published';
  if not found or not public.can_access_community_gathering(target.room_id) then
    raise exception 'Message unavailable';
  end if;
  if target.author_id = auth.uid() then
    raise exception 'You cannot report your own message';
  end if;
  if public.is_blocked_pair(auth.uid(), target.author_id) then
    raise exception 'Message unavailable';
  end if;
  if p_reason not in ('harassment', 'privacy', 'spam', 'safety', 'other')
    or char_length(trim(coalesce(p_details, ''))) not between 10 and 1000 then
    raise exception 'Choose a reason and add a short explanation';
  end if;
  insert into public.community_gathering_message_reports(
    message_id, reporter_id, reason, details, evidence_snapshot
  ) values (
    target.id, auth.uid(), p_reason, trim(p_details),
    jsonb_build_object('body', target.body, 'author_id', target.author_id,
      'author_name', target.display_name, 'created_at', target.created_at,
      'room_id', target.room_id, 'event_id', target.event_id)
  ) returning id into saved;
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values(auth.uid(), 'community.gathering_message_reported',
    'community_gathering_message', target.id);
  return saved;
exception when unique_violation then
  raise exception 'You have already reported this message';
end;
$$;

create or replace function public.save_community_gathering_settings(
  p_room_id uuid,
  p_gathering_kind text,
  p_meeting_provider text,
  p_meeting_url text,
  p_chat_mode text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target public.community_gathering_rooms%rowtype; clean_url text := nullif(trim(coalesce(p_meeting_url, '')), '');
begin
  select * into target from public.community_gathering_rooms where id = p_room_id;
  if not found or not public.can_manage_community(target.community_id) then
    raise exception 'Host access required';
  end if;
  if p_gathering_kind not in ('community_catch_up', 'networking_circle', 'workshop',
    'guest_conversation', 'webinar', 'accountability_session', 'social_wellbeing') then
    raise exception 'Choose a gathering type';
  end if;
  if p_chat_mode not in ('open', 'slow', 'hosts_only', 'closed') then
    raise exception 'Choose a conversation setting';
  end if;
  if p_meeting_provider is not null and p_meeting_provider not in
    ('google_meet', 'zoom', 'microsoft_teams', 'other') then
    raise exception 'Choose a supported meeting service';
  end if;
  if clean_url is not null and clean_url !~ '^https://' then
    raise exception 'Meeting links must begin with https://';
  end if;
  update public.community_gathering_rooms set
    gathering_kind = p_gathering_kind,
    meeting_provider = p_meeting_provider,
    meeting_url = clean_url,
    chat_mode = p_chat_mode,
    chat_enabled = p_chat_mode <> 'closed',
    updated_by = auth.uid(), updated_at = now()
  where id = target.id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'community.gathering_settings_updated',
    'community_gathering_room', target.id,
    jsonb_build_object('kind', p_gathering_kind, 'provider', p_meeting_provider,
      'chat_mode', p_chat_mode, 'has_link', clean_url is not null));
end;
$$;

create or replace function public.publish_community_gathering_recap(
  p_room_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare room public.community_gathering_rooms%rowtype; event_title text; clean_body text := trim(coalesce(p_body, '')); saved uuid;
begin
  select * into room from public.community_gathering_rooms where id = p_room_id for update;
  if not found or not public.can_manage_community(room.community_id) then
    raise exception 'Host access required';
  end if;
  if char_length(clean_body) not between 20 and 2800 then
    raise exception 'Keep the recap between 20 and 2,800 characters';
  end if;
  select title into event_title from public.events where id = room.event_id;
  if room.recap_post_id is null then
    insert into public.community_posts(
      community_id, author_id, body, status, category
    ) values (
      room.community_id, auth.uid(),
      left('Gathering recap · ' || event_title || E'\n\n' || clean_body, 3000),
      'published', 'event_follow_up'
    ) returning id into saved;
  else
    saved := room.recap_post_id;
    update public.community_posts set
      body = left('Gathering recap · ' || event_title || E'\n\n' || clean_body, 3000),
      updated_at = now()
    where id = saved;
  end if;
  update public.community_gathering_rooms set recap_body = clean_body,
    recap_post_id = saved, recap_published_at = coalesce(recap_published_at, now()),
    updated_by = auth.uid(), updated_at = now() where id = room.id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'community.gathering_recap_published',
    'community_gathering_room', room.id,
    jsonb_build_object('community_id', room.community_id, 'event_id', room.event_id,
      'post_id', saved));
  return saved;
end;
$$;

create or replace function public.list_community_gathering_reports()
returns table(
  report_id uuid, content_type text, community_id uuid,
  community_name text, reporter_email text, category text, details text,
  evidence_snapshot jsonb, status text, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin', 'moderator']::public.app_role[]) then
    raise exception 'Moderator role required';
  end if;
  insert into public.audit_events(actor_id, action, target_type)
  values(auth.uid(), 'community.gathering_report_queue_accessed', 'community_gathering_message_reports');
  return query
  select report.id, 'gathering_message'::text, message.community_id,
    community.name, account.email::text, report.reason, report.details,
    report.evidence_snapshot, report.status, report.created_at
  from public.community_gathering_message_reports report
  join public.community_gathering_messages message on message.id = report.message_id
  join public.communities community on community.id = message.community_id
  join auth.users account on account.id = report.reporter_id
  order by case report.status when 'open' then 0 when 'reviewing' then 1 else 2 end,
    report.created_at;
end;
$$;

create or replace function public.review_community_gathering_report(
  p_report_id uuid,
  p_action text,
  p_outcome text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target record;
begin
  if not public.is_admin(array['super_admin', 'moderator']::public.app_role[]) then
    raise exception 'Moderator role required';
  end if;
  if p_action not in ('start_review', 'hide', 'dismiss')
    or (p_action <> 'start_review' and char_length(trim(coalesce(p_outcome, ''))) < 5) then
    raise exception 'Valid moderation action and outcome required';
  end if;
  select queued.*, message.id as target_message_id into target
  from public.community_gathering_message_reports queued
  join public.community_gathering_messages message on message.id = queued.message_id
  where queued.id = p_report_id for update of queued;
  if not found or target.status not in ('open', 'reviewing') then
    raise exception 'Active report not found';
  end if;
  update public.community_gathering_message_reports set
    status = case p_action when 'start_review' then 'reviewing' when 'hide' then 'resolved' else 'dismissed' end,
    assigned_to = auth.uid(), outcome = nullif(trim(p_outcome), ''),
    reviewed_at = case when p_action = 'start_review' then null else now() end,
    updated_at = now()
  where id = p_report_id;
  if p_action = 'hide' then
    update public.community_gathering_messages set status = 'removed',
      body = '[Removed by the Her Africa Table safety team]', is_pinned = false,
      pinned_by = null, pinned_at = null, updated_at = now()
    where id = target.target_message_id;
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values(auth.uid(), 'community.gathering_report_' || p_action,
    'community_gathering_message_report', p_report_id,
    jsonb_build_object('message_id', target.target_message_id,
      'outcome', nullif(trim(p_outcome), '')));
end;
$$;

revoke all on function public.can_access_community_gathering(uuid, uuid) from public;
grant execute on function public.can_access_community_gathering(uuid, uuid) to authenticated;
revoke all on function public.list_community_gathering_cards(uuid) from public;
grant execute on function public.list_community_gathering_cards(uuid) to authenticated;
revoke all on function public.get_community_gathering_room(uuid, uuid) from public;
grant execute on function public.get_community_gathering_room(uuid, uuid) to authenticated;
revoke all on function public.set_community_gathering_rsvp(uuid, text, boolean) from public;
grant execute on function public.set_community_gathering_rsvp(uuid, text, boolean) to authenticated;
revoke all on function public.list_community_gathering_attendees(uuid) from public;
grant execute on function public.list_community_gathering_attendees(uuid) to authenticated;
revoke all on function public.list_community_gathering_messages(uuid, integer) from public;
grant execute on function public.list_community_gathering_messages(uuid, integer) to authenticated;
revoke all on function public.send_community_gathering_message(uuid, text) from public;
grant execute on function public.send_community_gathering_message(uuid, text) to authenticated;
revoke all on function public.list_community_gathering_questions(uuid) from public;
grant execute on function public.list_community_gathering_questions(uuid) to authenticated;
revoke all on function public.submit_community_gathering_question(uuid, text) from public;
grant execute on function public.submit_community_gathering_question(uuid, text) to authenticated;
revoke all on function public.toggle_community_gathering_question_support(uuid) from public;
grant execute on function public.toggle_community_gathering_question_support(uuid) to authenticated;
revoke all on function public.manage_community_gathering_message(uuid, text) from public;
grant execute on function public.manage_community_gathering_message(uuid, text) to authenticated;
revoke all on function public.review_community_gathering_question(uuid, text) from public;
grant execute on function public.review_community_gathering_question(uuid, text) to authenticated;
revoke all on function public.report_community_gathering_message(uuid, text, text) from public;
grant execute on function public.report_community_gathering_message(uuid, text, text) to authenticated;
revoke all on function public.save_community_gathering_settings(uuid, text, text, text, text) from public;
grant execute on function public.save_community_gathering_settings(uuid, text, text, text, text) to authenticated;
revoke all on function public.publish_community_gathering_recap(uuid, text) from public;
grant execute on function public.publish_community_gathering_recap(uuid, text) to authenticated;
revoke all on function public.list_community_gathering_reports() from public;
grant execute on function public.list_community_gathering_reports() to authenticated;
revoke all on function public.review_community_gathering_report(uuid, text, text) from public;
grant execute on function public.review_community_gathering_report(uuid, text, text) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.community_gathering_messages;
exception when duplicate_object then null;
end;
$$;

comment on table public.community_gathering_rooms is
  'Time-bound member rooms around approved Community events. Private meeting links are returned only by a recipient-safe RPC during the joining window.';
comment on table public.community_gathering_messages is
  'Rate-limited live gathering conversation. The permanent Community record is the Host-reviewed recap, not an endless chat transcript.';

commit;
