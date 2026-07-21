create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  country text not null default 'Kenya',
  address_line text,
  map_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  summary text,
  format text not null default 'in_person' check (format in ('in_person', 'virtual', 'hybrid')),
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Africa/Nairobi',
  venue_id uuid references public.venues(id) on delete restrict,
  capacity integer check (capacity is null or capacity > 0),
  registration_mode text not null default 'manual_review'
    check (registration_mode in ('automatic', 'manual_review', 'closed', 'waitlist')),
  is_featured boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_time_order check (ends_at > starts_at),
  constraint events_location_required check (
    format = 'virtual'
    or (format in ('in_person', 'hybrid') and venue_id is not null)
  )
);

create unique index events_one_featured_idx on public.events(is_featured) where is_featured;
create index events_status_starts_idx on public.events(status, starts_at);
create index events_venue_idx on public.events(venue_id);

create table public.event_private_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  online_url text,
  check_in_instructions text,
  updated_at timestamptz not null default now()
);

create table public.event_staff_scopes (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index event_staff_scopes_event_idx on public.event_staff_scopes(event_id, user_id);

create table public.programme_days (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_date date not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, event_date)
);

create table public.event_speakers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  job_title text,
  company text,
  bio text,
  photo_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programme_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  programme_day_id uuid references public.programme_days(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint programme_sessions_time_order check (ends_at > starts_at)
);

create index programme_sessions_event_time_idx on public.programme_sessions(event_id, starts_at);

create table public.session_speakers (
  session_id uuid not null references public.programme_sessions(id) on delete cascade,
  speaker_id uuid not null references public.event_speakers(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (session_id, speaker_id)
);

create table public.event_announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_announcements_event_published_idx
  on public.event_announcements(event_id, published_at desc);

create table public.event_sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  tier text,
  website_url text,
  logo_url text,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_sponsors_event_sort_idx on public.event_sponsors(event_id, sort_order);

create or replace function public.can_manage_event(check_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_admin(array['super_admin']::public.app_role[])
    or (
      public.is_admin(array['event_staff']::public.app_role[])
      and exists (
        select 1 from public.event_staff_scopes
        where user_id = auth.uid() and event_id = check_event_id
      )
    );
$$;

revoke all on function public.can_manage_event(uuid) from public;
grant execute on function public.can_manage_event(uuid) to authenticated;

alter table public.venues enable row level security;
alter table public.events enable row level security;
alter table public.event_private_details enable row level security;
alter table public.event_staff_scopes enable row level security;
alter table public.programme_days enable row level security;
alter table public.event_speakers enable row level security;
alter table public.programme_sessions enable row level security;
alter table public.session_speakers enable row level security;
alter table public.event_announcements enable row level security;
alter table public.event_sponsors enable row level security;

create policy "Anyone can read venues for published events"
  on public.venues for select to anon, authenticated
  using (exists (
    select 1 from public.events
    where events.venue_id = venues.id and events.status = 'published'
  ));

create policy "Event admins can read managed venues"
  on public.venues for select to authenticated
  using (exists (
    select 1 from public.events
    where events.venue_id = venues.id and public.can_manage_event(events.id)
  ));

create policy "Anyone can read published events"
  on public.events for select to anon, authenticated
  using (status = 'published');

create policy "Event admins can read managed events"
  on public.events for select to authenticated
  using (public.can_manage_event(id));

create policy "Event admins manage private event details"
  on public.event_private_details for all to authenticated
  using (public.can_manage_event(event_id))
  with check (public.can_manage_event(event_id));

create policy "Super admins can read event staff scopes"
  on public.event_staff_scopes for select to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]) or user_id = auth.uid());

create policy "Super admins can manage event staff scopes"
  on public.event_staff_scopes for all to authenticated
  using (public.is_admin(array['super_admin']::public.app_role[]))
  with check (public.is_admin(array['super_admin']::public.app_role[]));

create policy "Anyone can read published programme days"
  on public.programme_days for select to anon, authenticated
  using (exists (select 1 from public.events where events.id = programme_days.event_id and events.status = 'published'));
create policy "Event admins manage programme days"
  on public.programme_days for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "Anyone can read speakers for published events"
  on public.event_speakers for select to anon, authenticated
  using (exists (select 1 from public.events where events.id = event_speakers.event_id and events.status = 'published'));
create policy "Event admins manage speakers"
  on public.event_speakers for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "Anyone can read published programme sessions"
  on public.programme_sessions for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.events where events.id = programme_sessions.event_id and events.status = 'published')
  );
create policy "Event admins manage programme sessions"
  on public.programme_sessions for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "Anyone can read speaker links for published sessions"
  on public.session_speakers for select to anon, authenticated
  using (exists (
    select 1 from public.programme_sessions
    join public.events on events.id = programme_sessions.event_id
    where programme_sessions.id = session_speakers.session_id
      and programme_sessions.status = 'published'
      and events.status = 'published'
  ));
create policy "Event admins manage session speakers"
  on public.session_speakers for all to authenticated
  using (exists (
    select 1 from public.programme_sessions
    where programme_sessions.id = session_speakers.session_id
      and public.can_manage_event(programme_sessions.event_id)
  ))
  with check (exists (
    select 1 from public.programme_sessions
    where programme_sessions.id = session_speakers.session_id
      and public.can_manage_event(programme_sessions.event_id)
  ));

create policy "Anyone can read published announcements"
  on public.event_announcements for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.events where events.id = event_announcements.event_id and events.status = 'published')
  );
create policy "Event admins manage announcements"
  on public.event_announcements for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy "Anyone can read published sponsors"
  on public.event_sponsors for select to anon, authenticated
  using (
    is_published
    and exists (select 1 from public.events where events.id = event_sponsors.event_id and events.status = 'published')
  );
create policy "Event admins manage sponsors"
  on public.event_sponsors for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create or replace function public.save_event(
  p_event_id uuid,
  p_title text,
  p_slug text,
  p_summary text,
  p_format text,
  p_status text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_venue_name text,
  p_city text,
  p_country text,
  p_address_line text,
  p_map_url text,
  p_online_url text,
  p_capacity integer,
  p_registration_mode text,
  p_is_featured boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  saved_event_id uuid := p_event_id;
  saved_venue_id uuid;
  normalized_slug text;
  was_featured boolean := false;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_event_id is null and not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Only a super admin can create an event';
  end if;
  if p_event_id is not null and not public.can_manage_event(p_event_id) then
    raise exception 'You are not authorized to manage this event';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Event title is required'; end if;
  if p_ends_at <= p_starts_at then raise exception 'Event end must be after its start'; end if;
  if p_format not in ('in_person', 'virtual', 'hybrid') then raise exception 'Unsupported event format'; end if;
  if p_status not in ('draft', 'published', 'cancelled', 'completed') then raise exception 'Unsupported event status'; end if;
  if p_registration_mode not in ('automatic', 'manual_review', 'closed', 'waitlist') then raise exception 'Unsupported registration mode'; end if;
  if p_format in ('in_person', 'hybrid') and nullif(trim(p_venue_name), '') is null then raise exception 'Venue is required'; end if;
  if p_format in ('in_person', 'hybrid') and nullif(trim(p_city), '') is null then raise exception 'Venue city is required'; end if;
  if p_format = 'virtual' and nullif(trim(p_online_url), '') is null then raise exception 'Online event URL is required'; end if;
  if p_status = 'published' and nullif(trim(p_summary), '') is null then raise exception 'A public summary is required before publishing'; end if;
  if nullif(trim(p_online_url), '') is not null and trim(p_online_url) !~* '^https://' then raise exception 'Online event URL must begin with https://'; end if;
  if nullif(trim(p_map_url), '') is not null and trim(p_map_url) !~* '^https://' then raise exception 'Map URL must begin with https://'; end if;

  normalized_slug := lower(regexp_replace(trim(p_slug), '[^a-zA-Z0-9]+', '-', 'g'));
  normalized_slug := trim(both '-' from normalized_slug);
  if normalized_slug = '' then raise exception 'Event URL slug is required'; end if;

  if p_event_id is not null then
    select venue_id, is_featured into saved_venue_id, was_featured
    from public.events where id = p_event_id for update;
    if p_is_featured is distinct from was_featured
      and not public.is_admin(array['super_admin']::public.app_role[]) then
      raise exception 'Only a super admin can change the featured event';
    end if;
  end if;

  if p_format in ('in_person', 'hybrid') then
    if saved_venue_id is null then
      insert into public.venues (name, city, country, address_line, map_url)
      values (trim(p_venue_name), trim(p_city), coalesce(nullif(trim(p_country), ''), 'Kenya'), nullif(trim(p_address_line), ''), nullif(trim(p_map_url), ''))
      returning id into saved_venue_id;
    else
      update public.venues
      set name = trim(p_venue_name), city = trim(p_city), country = coalesce(nullif(trim(p_country), ''), 'Kenya'),
          address_line = nullif(trim(p_address_line), ''), map_url = nullif(trim(p_map_url), ''), updated_at = now()
      where id = saved_venue_id;
    end if;
  else
    saved_venue_id := null;
  end if;

  if p_is_featured then
    update public.events set is_featured = false, updated_at = now(), updated_by = actor_id where is_featured;
  end if;

  if p_event_id is null then
    insert into public.events (
      slug, title, summary, format, status, starts_at, ends_at, timezone, venue_id,
      capacity, registration_mode, is_featured, created_by, updated_by
    ) values (
      normalized_slug, trim(p_title), nullif(trim(p_summary), ''), p_format, p_status,
      p_starts_at, p_ends_at, coalesce(nullif(trim(p_timezone), ''), 'Africa/Nairobi'),
      saved_venue_id, p_capacity, p_registration_mode,
      p_is_featured, actor_id, actor_id
    ) returning id into saved_event_id;
  else
    update public.events
    set slug = normalized_slug, title = trim(p_title), summary = nullif(trim(p_summary), ''),
        format = p_format, status = p_status, starts_at = p_starts_at, ends_at = p_ends_at,
        timezone = coalesce(nullif(trim(p_timezone), ''), 'Africa/Nairobi'), venue_id = saved_venue_id,
        capacity = p_capacity, registration_mode = p_registration_mode, is_featured = p_is_featured,
        updated_by = actor_id, updated_at = now()
    where id = p_event_id;
  end if;

  insert into public.event_private_details (event_id, online_url, updated_at)
  values (saved_event_id, nullif(trim(p_online_url), ''), now())
  on conflict (event_id) do update
  set online_url = excluded.online_url, updated_at = now();

  if p_is_featured then
    insert into public.site_event_countdown (id, event_name, city, starts_at, is_published, updated_by, updated_at)
    values (true, trim(p_title), coalesce(nullif(trim(p_city), ''), 'Online'), p_starts_at, p_status = 'published', actor_id, now())
    on conflict (id) do update
    set event_name = excluded.event_name, city = excluded.city, starts_at = excluded.starts_at,
        is_published = excluded.is_published, updated_by = excluded.updated_by, updated_at = now();
  elsif was_featured then
    update public.site_event_countdown set is_published = false, updated_by = actor_id, updated_at = now() where id = true;
  end if;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    actor_id,
    case when p_event_id is null then 'event.created' else 'event.updated' end,
    'event',
    saved_event_id,
    jsonb_build_object('status', p_status, 'registration_mode', p_registration_mode, 'featured', p_is_featured)
  );

  return saved_event_id;
end;
$$;

revoke all on function public.save_event(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, integer, text, boolean
) from public;
grant execute on function public.save_event(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, text,
  text, text, text, text, text, integer, text, boolean
) to authenticated;

create or replace function public.list_managed_events()
returns table (
  event_id uuid,
  slug text,
  title text,
  summary text,
  format text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  capacity integer,
  registration_mode text,
  is_featured boolean,
  venue_name text,
  city text,
  country text,
  address_line text,
  map_url text,
  online_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.slug,
    e.title,
    e.summary,
    e.format,
    e.status,
    e.starts_at,
    e.ends_at,
    e.timezone,
    e.capacity,
    e.registration_mode,
    e.is_featured,
    v.name,
    v.city,
    v.country,
    v.address_line,
    v.map_url,
    details.online_url
  from public.events e
  left join public.venues v on v.id = e.venue_id
  left join public.event_private_details details on details.event_id = e.id
  where public.can_manage_event(e.id)
  order by e.starts_at desc;
$$;

revoke all on function public.list_managed_events() from public;
grant execute on function public.list_managed_events() to authenticated;

comment on table public.events is 'Platform and community-ready event lifecycle records.';
comment on table public.event_staff_scopes is 'Explicit event boundaries for event_staff users.';
comment on function public.save_event is 'Audited event create/update operation that synchronizes the featured public countdown.';
comment on function public.list_managed_events is 'Returns only events inside the current administrator event scope.';
