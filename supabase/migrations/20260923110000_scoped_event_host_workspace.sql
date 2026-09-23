begin;

-- Event Hosts are scoped separately from event_staff. A Host may prepare
-- content, but cannot review payments, inspect the guest roster or publish.
create table public.event_hosts (
  event_id uuid primary key references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active', 'paused')),
  assigned_by uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index event_hosts_user_idx on public.event_hosts(user_id, status);

create table public.event_host_workspaces (
  event_id uuid primary key references public.event_hosts(event_id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'changes_requested', 'approved')),
  summary text not null default '',
  arrival_info text not null default '',
  programme jsonb not null default '[]'::jsonb,
  partners jsonb not null default '[]'::jsonb,
  published_programme jsonb not null default '[]'::jsonb,
  published_partners jsonb not null default '[]'::jsonb,
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint event_host_programme_array check (jsonb_typeof(programme) = 'array'),
  constraint event_host_partners_array check (jsonb_typeof(partners) = 'array')
);

alter table public.programme_sessions
  add column if not exists host_workspace_key uuid;
create unique index if not exists programme_sessions_host_key_idx
  on public.programme_sessions(event_id, host_workspace_key)
  where host_workspace_key is not null;
alter table public.event_announcements
  add column if not exists host_workspace_key text;
create unique index if not exists event_announcements_host_key_idx
  on public.event_announcements(event_id, host_workspace_key)
  where host_workspace_key is not null;
alter table public.event_sponsors
  add column if not exists host_workspace_key uuid;
create unique index if not exists event_sponsors_host_key_idx
  on public.event_sponsors(event_id, host_workspace_key)
  where host_workspace_key is not null;

alter table public.event_hosts enable row level security;
alter table public.event_host_workspaces enable row level security;

create or replace function public.can_host_event(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.event_hosts host
    join public.profiles profile on profile.id = host.user_id
    join public.events event on event.id = host.event_id
    where host.event_id = p_event_id
      and host.user_id = auth.uid()
      and host.status = 'active'
      and profile.access_status = 'active'
      and event.status in ('draft', 'published')
  );
$$;
revoke all on function public.can_host_event(uuid) from public;
grant execute on function public.can_host_event(uuid) to authenticated;

create policy "Hosts read own event assignment"
  on public.event_hosts for select to authenticated
  using (user_id = auth.uid() or public.is_admin(array['super_admin']::public.app_role[]));
create policy "Hosts read own event workspace"
  on public.event_host_workspaces for select to authenticated
  using (
    public.can_host_event(event_id)
    or public.is_admin(array['super_admin']::public.app_role[])
  );

create or replace function public.assign_event_host(
  p_event_id uuid, p_email text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  selected_user uuid;
  prior_user uuid;
  event_slug text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  select slug into event_slug from public.events
  where id = p_event_id and status in ('draft', 'published');
  if event_slug is null then raise exception 'Event is not available for Host assignment'; end if;
  select account.id into selected_user
  from auth.users account
  join public.profiles profile on profile.id = account.id
  where lower(account.email) = lower(trim(p_email))
    and profile.access_status = 'active';
  if selected_user is null then
    raise exception 'Choose an active member with a verified account';
  end if;
  select user_id into prior_user
  from public.event_hosts where event_id = p_event_id for update;
  insert into public.event_hosts(event_id, user_id, status, assigned_by)
  values (p_event_id, selected_user, 'active', actor)
  on conflict(event_id) do update
    set user_id = excluded.user_id, status = 'active',
        assigned_by = actor, assigned_at = now(), updated_at = now();
  insert into public.event_host_workspaces(event_id)
  values (p_event_id) on conflict(event_id) do nothing;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'event.host_assigned', 'event', p_event_id,
    jsonb_build_object('host_id', selected_user, 'prior_host_id', prior_user)
  );
  if prior_user is not null and prior_user <> selected_user then
    perform public.enqueue_notification(
      prior_user, 'event', 'Event Host assignment changed',
      'Your Host access for this event has ended. Contact the event team if this was unexpected.',
      '/events', 'event-host-replaced:' || p_event_id || ':' || prior_user
    );
  end if;
  perform public.enqueue_notification(
    selected_user, 'event', 'You are hosting an event',
    'Your private Host workspace is ready. Prepare the programme and send it to the event team for review.',
    '/events/' || event_slug || '/host',
    'event-host-assigned:' || p_event_id || ':' || selected_user
  );
end;
$$;
revoke all on function public.assign_event_host(uuid, text) from public;
grant execute on function public.assign_event_host(uuid, text) to authenticated;

create or replace function public.get_my_event_host_workspace(p_slug text)
returns table (
  event_id uuid, event_slug text, event_title text, event_status text,
  starts_at timestamptz, ends_at timestamptz, timezone text,
  workspace_status text, summary text, arrival_info text,
  programme jsonb, partners jsonb, review_note text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  return query
  select event.id, event.slug::text, event.title::text, event.status::text,
         event.starts_at, event.ends_at, event.timezone::text,
         workspace.status::text, workspace.summary::text,
         workspace.arrival_info::text, workspace.programme,
         workspace.partners, workspace.review_note::text
  from public.events event
  join public.event_hosts host on host.event_id = event.id
  join public.event_host_workspaces workspace on workspace.event_id = event.id
  where event.slug = p_slug
    and host.user_id = auth.uid()
    and public.can_host_event(event.id);
end;
$$;
revoke all on function public.get_my_event_host_workspace(text) from public;
grant execute on function public.get_my_event_host_workspace(text) to authenticated;

create or replace function public.list_admin_event_host_workspaces()
returns table (
  event_id uuid, event_slug text, event_title text, event_status text,
  starts_at timestamptz, host_email text, host_name text, host_status text,
  workspace_status text, summary text, arrival_info text,
  programme jsonb, partners jsonb, review_note text, submitted_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  return query
  select event.id, event.slug::text, event.title::text, event.status::text,
         event.starts_at, account.email::text, profile.display_name::text,
         host.status::text, workspace.status::text, workspace.summary::text,
         workspace.arrival_info::text, workspace.programme,
         workspace.partners, workspace.review_note::text, workspace.submitted_at
  from public.event_hosts host
  join public.events event on event.id = host.event_id
  join auth.users account on account.id = host.user_id
  join public.profiles profile on profile.id = host.user_id
  join public.event_host_workspaces workspace on workspace.event_id = event.id
  order by case workspace.status when 'submitted' then 0
           when 'changes_requested' then 1 else 2 end,
           workspace.submitted_at desc nulls last, event.starts_at;
end;
$$;
revoke all on function public.list_admin_event_host_workspaces() from public;
grant execute on function public.list_admin_event_host_workspaces() to authenticated;

create or replace function public.save_event_host_workspace(
  p_event_id uuid,
  p_summary text,
  p_arrival_info text,
  p_programme jsonb,
  p_partners jsonb
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  item jsonb;
  event_start timestamptz;
  event_end timestamptz;
  item_key uuid;
  used_keys uuid[] := array[]::uuid[];
begin
  if not public.can_host_event(p_event_id) then
    raise exception 'You are not the active Host for this event';
  end if;
  if (select status from public.event_host_workspaces where event_id = p_event_id)
    = 'submitted' then
    raise exception 'This draft is with the event team for review';
  end if;
  if char_length(trim(coalesce(p_summary, ''))) > 2000
    or char_length(trim(coalesce(p_arrival_info, ''))) > 2000 then
    raise exception 'Keep event summary and arrival information under 2000 characters';
  end if;
  if jsonb_typeof(p_programme) <> 'array'
    or jsonb_array_length(p_programme) > 30
    or jsonb_typeof(p_partners) <> 'array'
    or jsonb_array_length(p_partners) > 20 then
    raise exception 'Choose up to 30 programme items and 20 partners';
  end if;
  select starts_at, ends_at into event_start, event_end
  from public.events where id = p_event_id;
  for item in select value from jsonb_array_elements(p_programme) as entry(value) loop
    if jsonb_typeof(item) <> 'object'
      or nullif(trim(item->>'title'), '') is null
      or char_length(item->>'title') > 160 then
      raise exception 'Each programme item needs a short title';
    end if;
    item_key := nullif(item->>'key', '')::uuid;
    if item_key is null or item_key = any(used_keys) then
      raise exception 'Programme item identifiers must be unique';
    end if;
    used_keys := array_append(used_keys, item_key);
    if nullif(item->>'starts_at', '') is null
      or nullif(item->>'ends_at', '') is null
      or (item->>'starts_at')::timestamptz < event_start
      or (item->>'ends_at')::timestamptz > event_end
      or (item->>'ends_at')::timestamptz <= (item->>'starts_at')::timestamptz then
      raise exception 'Programme times must fall within the event';
    end if;
    if char_length(coalesce(item->>'description', '')) > 2000
      or char_length(coalesce(item->>'speaker_name', '')) > 160 then
      raise exception 'A programme description or speaker name is too long';
    end if;
  end loop;
  used_keys := array[]::uuid[];
  for item in select value from jsonb_array_elements(p_partners) as entry(value) loop
    if jsonb_typeof(item) <> 'object'
      or nullif(trim(item->>'name'), '') is null
      or char_length(item->>'name') > 160 then
      raise exception 'Each partner needs a short name';
    end if;
    item_key := nullif(item->>'key', '')::uuid;
    if item_key is null or item_key = any(used_keys) then
      raise exception 'Partner identifiers must be unique';
    end if;
    used_keys := array_append(used_keys, item_key);
    if nullif(item->>'website_url', '') is not null
      and item->>'website_url' !~* '^https://' then
      raise exception 'Partner websites must start with https://';
    end if;
    if nullif(item->>'logo_url', '') is not null
      and item->>'logo_url' !~* '^https://' then
      raise exception 'Partner logos must start with https://';
    end if;
  end loop;
  update public.event_host_workspaces
  set summary = trim(coalesce(p_summary, '')),
      arrival_info = trim(coalesce(p_arrival_info, '')),
      programme = p_programme, partners = p_partners,
      status = 'draft', updated_at = now()
  where event_id = p_event_id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'event.host_draft_saved', 'event', p_event_id,
    jsonb_build_object('programme_count', jsonb_array_length(p_programme),
                       'partner_count', jsonb_array_length(p_partners))
  );
end;
$$;
revoke all on function public.save_event_host_workspace(uuid, text, text, jsonb, jsonb) from public;
grant execute on function public.save_event_host_workspace(uuid, text, text, jsonb, jsonb) to authenticated;

create or replace function public.submit_event_host_workspace(p_event_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  draft public.event_host_workspaces%rowtype;
  event_title text;
  admin_id uuid;
begin
  if not public.can_host_event(p_event_id) then
    raise exception 'You are not the active Host for this event';
  end if;
  select * into draft from public.event_host_workspaces
  where event_id = p_event_id for update;
  if draft.status <> 'draft' then
    raise exception 'Save your draft before sending it for review';
  end if;
  if char_length(draft.summary) < 40
    or char_length(draft.arrival_info) < 20
    or jsonb_array_length(draft.programme) = 0 then
    raise exception 'Add a clear summary, arrival details and at least one programme item';
  end if;
  update public.event_host_workspaces
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where event_id = p_event_id;
  select title into event_title from public.events where id = p_event_id;
  for admin_id in
    select user_id from public.user_roles where role = 'super_admin'
  loop
    perform public.enqueue_notification(
      admin_id, 'event', 'Event Host draft needs review',
      event_title || ' is ready for your content and publication decision.',
      '/admin/events?view=host', 'event-host-submitted:' || p_event_id || ':' || draft.updated_at
    );
  end loop;
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (auth.uid(), 'event.host_draft_submitted', 'event', p_event_id);
end;
$$;
revoke all on function public.submit_event_host_workspace(uuid) from public;
grant execute on function public.submit_event_host_workspace(uuid) to authenticated;

create or replace function public.review_event_host_workspace(
  p_event_id uuid, p_action text, p_note text
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  draft public.event_host_workspaces%rowtype;
  target public.events%rowtype;
  host_id uuid;
  item jsonb;
  item_key uuid;
  session_id uuid;
  announcement_id uuid;
  next_status text;
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super Admin required';
  end if;
  if p_action not in ('approve', 'request_changes') then
    raise exception 'Unsupported review action';
  end if;
  if p_action = 'request_changes'
    and char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Add clear guidance for the Host';
  end if;
  select * into draft from public.event_host_workspaces
  where event_id = p_event_id for update;
  if not found or draft.status <> 'submitted' then
    raise exception 'A submitted Host draft is required';
  end if;
  select * into target from public.events where id = p_event_id for update;
  select user_id into host_id from public.event_hosts
  where event_id = p_event_id and status = 'active';
  if target.status not in ('draft', 'published') or host_id is null then
    raise exception 'This event or Host is not available for review';
  end if;

  if p_action = 'request_changes' then
    next_status := 'changes_requested';
  else
    if target.status = 'draft' and target.starts_at < now() + interval '48 hours' then
      raise exception 'Allow at least 48 hours before publishing a new event';
    end if;
    if target.format in ('in_person', 'hybrid') and target.venue_id is null then
      raise exception 'Add the event venue before publishing';
    end if;
    if target.format in ('virtual', 'hybrid') and not exists (
      select 1 from public.event_private_details
      where event_id = p_event_id and nullif(trim(online_url), '') is not null
    ) then raise exception 'Add the private online joining link before publishing'; end if;
    if not exists (
      select 1 from public.ticket_types
      where event_id = p_event_id and status in ('draft', 'on_sale')
    ) then raise exception 'Add an event ticket before publishing'; end if;

    -- Only rows previously created from this workspace may be replaced.
    update public.programme_sessions session
    set status = 'cancelled', updated_at = now()
    where session.event_id = p_event_id
      and session.host_workspace_key is not null
      and not exists (
        select 1 from jsonb_array_elements(draft.programme) as entry(value)
        where entry.value->>'key' = session.host_workspace_key::text
      );
    for item in select value from jsonb_array_elements(draft.programme) as entry(value) loop
      item_key := (item->>'key')::uuid;
      select id into session_id from public.programme_sessions
      where event_id = p_event_id and host_workspace_key = item_key;
      session_id := public.save_programme_session(
        session_id, p_event_id, item->>'title', item->>'description',
        (item->>'starts_at')::timestamptz, (item->>'ends_at')::timestamptz,
        item->>'room', 'published', '',
        item->>'speaker_name', item->>'speaker_job_title', item->>'speaker_company'
      );
      update public.programme_sessions set host_workspace_key = item_key
      where id = session_id;
      session_id := null;
    end loop;

    select id into announcement_id from public.event_announcements
    where event_id = p_event_id and host_workspace_key = 'arrival';
    announcement_id := public.save_event_announcement(
      announcement_id, p_event_id, 'Before you arrive',
      draft.arrival_info, 'published'
    );
    update public.event_announcements set host_workspace_key = 'arrival'
    where id = announcement_id;

    update public.event_sponsors sponsor
    set is_published = false, updated_at = now()
    where sponsor.event_id = p_event_id
      and sponsor.host_workspace_key is not null
      and not exists (
        select 1 from jsonb_array_elements(draft.partners) as entry(value)
        where entry.value->>'key' = sponsor.host_workspace_key::text
      );
    for item in select value from jsonb_array_elements(draft.partners) as entry(value) loop
      item_key := (item->>'key')::uuid;
      insert into public.event_sponsors(
        event_id, name, tier, website_url, logo_url,
        is_published, sort_order, host_workspace_key
      ) values (
        p_event_id, trim(item->>'name'), nullif(trim(item->>'tier'), ''),
        nullif(trim(item->>'website_url'), ''),
        nullif(trim(item->>'logo_url'), ''), true, 0, item_key
      )
      on conflict(event_id, host_workspace_key)
        where host_workspace_key is not null
      do update set
        name = excluded.name, tier = excluded.tier,
        website_url = excluded.website_url, logo_url = excluded.logo_url,
        is_published = true, updated_at = now();
    end loop;

    update public.events
    set summary = draft.summary, status = 'published',
        updated_by = auth.uid(), updated_at = now()
    where id = p_event_id;
    update public.ticket_types
    set status = 'on_sale', updated_at = now()
    where event_id = p_event_id and status = 'draft' and price_minor = 0;
    next_status := 'approved';
  end if;

  update public.event_host_workspaces
  set status = next_status, review_note = nullif(trim(coalesce(p_note, '')), ''),
      reviewed_at = now(), reviewed_by = auth.uid(), updated_at = now(),
      published_programme = case when p_action = 'approve'
        then programme else published_programme end,
      published_partners = case when p_action = 'approve'
        then partners else published_partners end
  where event_id = p_event_id;
  perform public.enqueue_notification(
    host_id, 'event',
    case when p_action = 'approve' then 'Your event content is approved'
         else 'Your event draft needs an update' end,
    case when p_action = 'approve'
      then 'Your reviewed event page is live. Open your Host workspace to see it.'
      else 'The event team left guidance in your Host workspace. Update the draft and send it again.' end,
    '/events/' || target.slug || '/host',
    'event-host-review:' || p_event_id || ':' || next_status || ':' || draft.submitted_at
  );
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    auth.uid(), 'event.host_draft_' || p_action, 'event', p_event_id,
    jsonb_build_object('review_note', nullif(trim(coalesce(p_note, '')), ''),
                       'programme_count', jsonb_array_length(draft.programme),
                       'partner_count', jsonb_array_length(draft.partners))
  );
end;
$$;
revoke all on function public.review_event_host_workspace(uuid, text, text) from public;
grant execute on function public.review_event_host_workspace(uuid, text, text) to authenticated;

commit;
