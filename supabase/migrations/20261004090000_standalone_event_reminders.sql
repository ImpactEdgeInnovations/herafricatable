begin;

-- A standalone event reminder is a separate, explicit choice by a confirmed guest.
-- Community gatherings keep their existing reminder system.
create table if not exists public.standalone_event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  remind_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'queued', 'cancelled')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
create index if not exists standalone_event_reminders_due_idx
  on public.standalone_event_reminders(remind_at, id)
  where status = 'scheduled';
alter table public.standalone_event_reminders enable row level security;
drop policy if exists "Guests read own standalone event reminders"
  on public.standalone_event_reminders;
create policy "Guests read own standalone event reminders"
  on public.standalone_event_reminders for select to authenticated
  using (user_id = auth.uid());
revoke all on table public.standalone_event_reminders from anon, authenticated;
grant select on table public.standalone_event_reminders to authenticated;

create or replace function public.set_my_standalone_event_reminder(
  p_event_id uuid, p_enabled boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target public.events%rowtype;
  existing public.standalone_event_reminders%rowtype;
  next_remind_at timestamptz;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if p_enabled is null then raise exception 'Choose whether to receive a reminder'; end if;

  select * into target from public.events where id = p_event_id;
  if not found then raise exception 'Event not found'; end if;
  select * into existing from public.standalone_event_reminders
    where event_id = p_event_id and user_id = actor for update;

  if p_enabled then
    if target.status <> 'published'
      or target.starts_at - interval '1 day' <= now()
      or exists (select 1 from public.community_event_links link
        where link.event_id = p_event_id)
      or not exists (select 1 from public.event_memberships membership
        where membership.event_id = p_event_id and membership.user_id = actor
          and membership.status = 'confirmed')
      or not exists (select 1 from public.profiles profile
        where profile.id = actor and profile.access_status <> 'deleted')
    then raise exception 'A confirmed standalone event place at least one day away is required';
    end if;
    next_remind_at := target.starts_at - interval '1 day';
    if existing.id is not null and existing.status in ('scheduled', 'queued')
      and existing.remind_at = next_remind_at then return; end if;
    if existing.id is null then
      insert into public.standalone_event_reminders(event_id, user_id, remind_at)
      values (p_event_id, actor, next_remind_at);
    else
      update public.notification_jobs job set status = 'suppressed', updated_at = now()
      where job.user_id = actor and job.status = 'queued'
        and job.dedupe_key like 'standalone-event-reminder:' || existing.id || ':%';
      update public.standalone_event_reminders reminder
      set remind_at = next_remind_at, status = 'scheduled',
        revision = revision + 1, updated_at = now()
      where reminder.id = existing.id;
    end if;
  else
    if existing.id is null or existing.status = 'cancelled' then return; end if;
    update public.notification_jobs job set status = 'suppressed', updated_at = now()
    where job.user_id = actor and job.status = 'queued'
      and job.dedupe_key like 'standalone-event-reminder:' || existing.id || ':%';
    update public.standalone_event_reminders reminder
    set status = 'cancelled', revision = revision + 1, updated_at = now()
    where reminder.id = existing.id;
  end if;

  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor,
    case when p_enabled then 'event.reminder_set' else 'event.reminder_removed' end,
    'event', p_event_id, jsonb_build_object('remind_at', next_remind_at));
end;
$$;
revoke all on function public.set_my_standalone_event_reminder(uuid, boolean) from public;
grant execute on function public.set_my_standalone_event_reminder(uuid, boolean) to authenticated;

create or replace function public.sync_standalone_event_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.starts_at is not distinct from new.starts_at
    and old.status is not distinct from new.status then return new; end if;

  update public.notification_jobs job set status = 'suppressed', updated_at = now()
  where job.status = 'queued' and exists (
    select 1 from public.standalone_event_reminders reminder
    where reminder.event_id = new.id
      and job.dedupe_key like 'standalone-event-reminder:' || reminder.id || ':%'
  );
  update public.standalone_event_reminders reminder
  set remind_at = new.starts_at - interval '1 day',
    status = case when new.status = 'published'
      and new.starts_at - interval '1 day' > now() then 'scheduled' else 'cancelled' end,
    revision = revision + 1, updated_at = now()
  where reminder.event_id = new.id and reminder.status in ('scheduled', 'queued');
  return new;
end;
$$;
drop trigger if exists sync_standalone_event_reminders_on_event on public.events;
create trigger sync_standalone_event_reminders_on_event
after update of starts_at, status on public.events
for each row execute function public.sync_standalone_event_reminders();

create or replace function public.stop_standalone_event_reminder_on_place_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target public.standalone_event_reminders%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.status = 'confirmed' then return new; end if;
  end if;
  select * into target from public.standalone_event_reminders
  where event_id = old.event_id and user_id = old.user_id
    and status in ('scheduled', 'queued') for update;
  if target.id is not null then
    update public.notification_jobs job set status = 'suppressed', updated_at = now()
    where job.user_id = old.user_id and job.status = 'queued'
      and job.dedupe_key like 'standalone-event-reminder:' || target.id || ':%';
    update public.standalone_event_reminders reminder
    set status = 'cancelled', revision = revision + 1, updated_at = now()
    where reminder.id = target.id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists stop_standalone_event_reminder_on_place_change
  on public.event_memberships;
create trigger stop_standalone_event_reminder_on_place_change
after update of status or delete on public.event_memberships
for each row execute function public.stop_standalone_event_reminder_on_place_change();

create or replace function public.queue_due_standalone_event_reminders(
  p_run_at timestamptz default now()
)
returns integer language plpgsql security definer set search_path = '' as $$
declare target record; queued integer := 0;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required'; end if;
  for target in
    select reminder.id, reminder.user_id, reminder.revision,
      event.title, event.slug
    from public.standalone_event_reminders reminder
    join public.events event on event.id = reminder.event_id
    join public.event_memberships membership
      on membership.event_id = reminder.event_id
      and membership.user_id = reminder.user_id
    join public.profiles profile on profile.id = reminder.user_id
    where reminder.status = 'scheduled' and reminder.remind_at <= p_run_at
      and event.starts_at > p_run_at and event.status = 'published'
      and membership.status = 'confirmed'
      and profile.access_status <> 'deleted'
      and not exists (select 1 from public.community_event_links link
        where link.event_id = reminder.event_id)
    order by reminder.remind_at, reminder.id
    for update of reminder skip locked limit 500
  loop
    update public.standalone_event_reminders reminder
    set status = 'queued', updated_at = now()
    where reminder.id = target.id and reminder.status = 'scheduled';
    if found then
      perform public.enqueue_notification(
        target.user_id, 'event', 'Coming up: ' || target.title,
        'Your place is confirmed. Open your private pass for the latest time, arrival details and directions.',
        '/events/' || target.slug || '/pass',
        'standalone-event-reminder:' || target.id || ':' || target.revision
      );
      queued := queued + 1;
    end if;
  end loop;
  return queued;
end;
$$;
revoke all on function public.queue_due_standalone_event_reminders(timestamptz) from public;
grant execute on function public.queue_due_standalone_event_reminders(timestamptz) to service_role;

-- The worker asks again immediately before calling the provider. A changed
-- place, event time, event status or email preference suppresses a stale job.
create or replace function public.check_standalone_event_reminder_job(p_job_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.notification_jobs%rowtype; allowed boolean;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required'; end if;
  select * into target from public.notification_jobs where id = p_job_id for update;
  if not found or target.status <> 'processing' then return false; end if;
  select exists (
    select 1 from public.standalone_event_reminders reminder
    join public.events event on event.id = reminder.event_id
    join public.event_memberships membership
      on membership.event_id = reminder.event_id
      and membership.user_id = reminder.user_id
    join public.profiles profile on profile.id = reminder.user_id
    join public.notification_preferences preference
      on preference.user_id = reminder.user_id
    where target.template_key = 'event'
      and target.dedupe_key = 'standalone-event-reminder:' || reminder.id || ':' || reminder.revision
      and reminder.status = 'queued' and reminder.user_id = target.user_id
      and event.status = 'published' and event.starts_at > now()
      and membership.status = 'confirmed'
      and profile.access_status <> 'deleted' and preference.email_events
      and not exists (select 1 from public.community_event_links link
        where link.event_id = reminder.event_id)
  ) into allowed;
  if not allowed then
    update public.notification_jobs
    set status = 'suppressed', locked_at = null, updated_at = now()
    where id = p_job_id and status = 'processing';
  end if;
  return allowed;
end;
$$;
revoke all on function public.check_standalone_event_reminder_job(uuid) from public;
grant execute on function public.check_standalone_event_reminder_job(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
