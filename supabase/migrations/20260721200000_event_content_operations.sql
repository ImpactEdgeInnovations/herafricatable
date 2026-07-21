create or replace function public.save_programme_session(
  p_session_id uuid,
  p_event_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_room text,
  p_status text,
  p_day_label text,
  p_speaker_name text,
  p_speaker_job_title text,
  p_speaker_company text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  saved_session_id uuid := p_session_id;
  saved_day_id uuid;
  saved_speaker_id uuid;
  event_start timestamptz;
  event_end timestamptz;
  event_timezone text;
  session_date date;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_event_id is null or not public.can_manage_event(p_event_id) then
    raise exception 'You are not authorized to manage this event';
  end if;
  if nullif(trim(p_title), '') is null then raise exception 'Session title is required'; end if;
  if p_ends_at <= p_starts_at then raise exception 'Session end must be after its start'; end if;
  if p_status not in ('draft', 'published', 'cancelled') then raise exception 'Unsupported session status'; end if;

  select starts_at, ends_at, timezone into event_start, event_end, event_timezone
  from public.events where id = p_event_id;

  if p_starts_at < event_start or p_ends_at > event_end then
    raise exception 'Session times must fall within the event dates';
  end if;

  if p_session_id is not null and not exists (
    select 1 from public.programme_sessions where id = p_session_id and event_id = p_event_id
  ) then
    raise exception 'Session does not belong to this event';
  end if;

  session_date := (p_starts_at at time zone event_timezone)::date;
  insert into public.programme_days (event_id, event_date, label, sort_order)
  values (
    p_event_id,
    session_date,
    coalesce(nullif(trim(p_day_label), ''), to_char(session_date, 'FMDay, DD FMMonth')),
    session_date - (event_start at time zone event_timezone)::date
  )
  on conflict (event_id, event_date) do update
  set label = excluded.label, sort_order = excluded.sort_order, updated_at = now()
  returning id into saved_day_id;

  if p_session_id is null then
    insert into public.programme_sessions (
      event_id, programme_day_id, title, description, starts_at, ends_at, room, status
    ) values (
      p_event_id, saved_day_id, trim(p_title), nullif(trim(p_description), ''),
      p_starts_at, p_ends_at, nullif(trim(p_room), ''), p_status
    ) returning id into saved_session_id;
  else
    update public.programme_sessions
    set programme_day_id = saved_day_id,
        title = trim(p_title),
        description = nullif(trim(p_description), ''),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        room = nullif(trim(p_room), ''),
        status = p_status,
        updated_at = now()
    where id = p_session_id;
  end if;

  delete from public.session_speakers where session_id = saved_session_id;
  if nullif(trim(p_speaker_name), '') is not null then
    select id into saved_speaker_id
    from public.event_speakers
    where event_id = p_event_id and lower(name) = lower(trim(p_speaker_name))
    order by created_at
    limit 1;

    if saved_speaker_id is null then
      insert into public.event_speakers (event_id, name, job_title, company)
      values (
        p_event_id, trim(p_speaker_name), nullif(trim(p_speaker_job_title), ''),
        nullif(trim(p_speaker_company), '')
      ) returning id into saved_speaker_id;
    else
      update public.event_speakers
      set job_title = nullif(trim(p_speaker_job_title), ''),
          company = nullif(trim(p_speaker_company), ''),
          updated_at = now()
      where id = saved_speaker_id;
    end if;

    insert into public.session_speakers (session_id, speaker_id)
    values (saved_session_id, saved_speaker_id);
  end if;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    actor_id,
    case when p_session_id is null then 'event.programme_session_created' else 'event.programme_session_updated' end,
    'programme_session',
    saved_session_id,
    jsonb_build_object('event_id', p_event_id, 'status', p_status, 'starts_at', p_starts_at)
  );

  return saved_session_id;
end;
$$;

create or replace function public.save_event_announcement(
  p_announcement_id uuid,
  p_event_id uuid,
  p_title text,
  p_body text,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  saved_id uuid := p_announcement_id;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_event_id is null or not public.can_manage_event(p_event_id) then
    raise exception 'You are not authorized to manage this event';
  end if;
  if nullif(trim(p_title), '') is null or nullif(trim(p_body), '') is null then
    raise exception 'Announcement title and message are required';
  end if;
  if p_status not in ('draft', 'published', 'archived') then raise exception 'Unsupported announcement status'; end if;
  if p_announcement_id is not null and not exists (
    select 1 from public.event_announcements where id = p_announcement_id and event_id = p_event_id
  ) then raise exception 'Announcement does not belong to this event'; end if;

  if p_announcement_id is null then
    insert into public.event_announcements (event_id, title, body, status, published_at, created_by)
    values (
      p_event_id, trim(p_title), trim(p_body), p_status,
      case when p_status = 'published' then now() else null end, actor_id
    ) returning id into saved_id;
  else
    update public.event_announcements
    set title = trim(p_title), body = trim(p_body), status = p_status,
        published_at = case
          when p_status = 'published' then coalesce(published_at, now())
          when p_status = 'draft' then null
          else published_at
        end,
        updated_at = now()
    where id = p_announcement_id;
  end if;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    actor_id,
    case when p_announcement_id is null then 'event.announcement_created' else 'event.announcement_updated' end,
    'event_announcement', saved_id,
    jsonb_build_object('event_id', p_event_id, 'status', p_status)
  );
  return saved_id;
end;
$$;

create or replace function public.save_event_sponsor(
  p_sponsor_id uuid,
  p_event_id uuid,
  p_name text,
  p_tier text,
  p_website_url text,
  p_logo_url text,
  p_is_published boolean,
  p_sort_order integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  saved_id uuid := p_sponsor_id;
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if p_event_id is null or not public.can_manage_event(p_event_id) then
    raise exception 'You are not authorized to manage this event';
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'Sponsor name is required'; end if;
  if nullif(trim(p_website_url), '') is not null and trim(p_website_url) !~* '^https://' then
    raise exception 'Sponsor website must begin with https://';
  end if;
  if nullif(trim(p_logo_url), '') is not null and trim(p_logo_url) !~* '^https://' then
    raise exception 'Sponsor logo URL must begin with https://';
  end if;
  if p_sponsor_id is not null and not exists (
    select 1 from public.event_sponsors where id = p_sponsor_id and event_id = p_event_id
  ) then raise exception 'Sponsor does not belong to this event'; end if;

  if p_sponsor_id is null then
    insert into public.event_sponsors (event_id, name, tier, website_url, logo_url, is_published, sort_order)
    values (
      p_event_id, trim(p_name), nullif(trim(p_tier), ''), nullif(trim(p_website_url), ''),
      nullif(trim(p_logo_url), ''), coalesce(p_is_published, false), greatest(coalesce(p_sort_order, 0), 0)
    ) returning id into saved_id;
  else
    update public.event_sponsors
    set name = trim(p_name), tier = nullif(trim(p_tier), ''),
        website_url = nullif(trim(p_website_url), ''), logo_url = nullif(trim(p_logo_url), ''),
        is_published = coalesce(p_is_published, false), sort_order = greatest(coalesce(p_sort_order, 0), 0),
        updated_at = now()
    where id = p_sponsor_id;
  end if;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    actor_id,
    case when p_sponsor_id is null then 'event.sponsor_created' else 'event.sponsor_updated' end,
    'event_sponsor', saved_id,
    jsonb_build_object('event_id', p_event_id, 'published', p_is_published)
  );
  return saved_id;
end;
$$;

create or replace function public.manage_event_staff(
  p_event_id uuid,
  p_staff_email text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  staff_user_id uuid;
  normalized_email text := lower(trim(p_staff_email));
begin
  if actor_id is null then raise exception 'Authentication required'; end if;
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Only a super admin can change event staff';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then raise exception 'Event not found'; end if;
  if p_action not in ('assign', 'remove') then raise exception 'Unsupported staff action'; end if;
  if normalized_email = '' then raise exception 'Staff email is required'; end if;

  select id into staff_user_id from auth.users where lower(email) = normalized_email limit 1;
  if staff_user_id is null then
    raise exception 'No Her Africa Table account exists for this email';
  end if;

  if p_action = 'assign' then
    insert into public.user_roles (user_id, role, granted_by)
    values (staff_user_id, 'event_staff'::public.app_role, actor_id)
    on conflict (user_id, role) do nothing;

    insert into public.event_staff_scopes (user_id, event_id, granted_by)
    values (staff_user_id, p_event_id, actor_id)
    on conflict (user_id, event_id) do update
    set granted_by = excluded.granted_by, granted_at = now();
  else
    delete from public.event_staff_scopes where user_id = staff_user_id and event_id = p_event_id;
    if not exists (select 1 from public.event_staff_scopes where user_id = staff_user_id) then
      delete from public.user_roles where user_id = staff_user_id and role = 'event_staff'::public.app_role;
    end if;
  end if;

  insert into public.audit_events (actor_id, action, target_type, target_id, metadata)
  values (
    actor_id,
    case when p_action = 'assign' then 'event.staff_assigned' else 'event.staff_removed' end,
    'event', p_event_id,
    jsonb_build_object('staff_user_id', staff_user_id, 'staff_email', normalized_email)
  );
end;
$$;

create or replace function public.list_event_staff(p_event_id uuid)
returns table (user_id uuid, email text, display_name text, granted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Only a super admin can view event staff';
  end if;
  return query
  select scopes.user_id, users.email::text, profiles.display_name, scopes.granted_at
  from public.event_staff_scopes scopes
  join auth.users users on users.id = scopes.user_id
  left join public.profiles profiles on profiles.id = scopes.user_id
  where scopes.event_id = p_event_id
  order by coalesce(profiles.display_name, users.email);
end;
$$;

revoke all on function public.save_programme_session(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, text) from public;
grant execute on function public.save_programme_session(uuid, uuid, text, text, timestamptz, timestamptz, text, text, text, text, text, text) to authenticated;
revoke all on function public.save_event_announcement(uuid, uuid, text, text, text) from public;
grant execute on function public.save_event_announcement(uuid, uuid, text, text, text) to authenticated;
revoke all on function public.save_event_sponsor(uuid, uuid, text, text, text, text, boolean, integer) from public;
grant execute on function public.save_event_sponsor(uuid, uuid, text, text, text, text, boolean, integer) to authenticated;
revoke all on function public.manage_event_staff(uuid, text, text) from public;
grant execute on function public.manage_event_staff(uuid, text, text) to authenticated;
revoke all on function public.list_event_staff(uuid) from public;
grant execute on function public.list_event_staff(uuid) to authenticated;

comment on function public.save_programme_session is 'Audited programme and speaker upsert constrained to the managed event and event dates.';
comment on function public.save_event_announcement is 'Audited announcement upsert with explicit publication state.';
comment on function public.save_event_sponsor is 'Audited sponsor upsert with explicit public visibility.';
comment on function public.manage_event_staff is 'Super-admin-only event staff scope assignment and removal.';
comment on function public.list_event_staff is 'Super-admin-only event staff directory for one event.';
