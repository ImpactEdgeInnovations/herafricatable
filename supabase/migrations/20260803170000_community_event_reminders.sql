begin;

create table if not exists public.community_event_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid not null,
  event_id uuid not null,
  reminder_window text not null
    check (reminder_window in ('day_before', 'hour_before')),
  remind_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'queued', 'cancelled')),
  revision integer not null default 1 check (revision between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, community_id, event_id),
  foreign key (community_id, event_id)
    references public.community_event_links(community_id, event_id)
    on delete cascade
);

create index if not exists community_event_reminders_due_idx
  on public.community_event_reminders (remind_at, id)
  where status = 'scheduled';

alter table public.community_event_reminders enable row level security;

drop policy if exists "Members read own Community event reminders"
  on public.community_event_reminders;
create policy "Members read own Community event reminders"
  on public.community_event_reminders for select
  to authenticated
  using (user_id = auth.uid());

revoke all on table public.community_event_reminders from anon, authenticated;
grant select on table public.community_event_reminders to authenticated;

create or replace function public.list_my_community_event_preferences(
  p_community_id uuid
)
returns table (
  event_id uuid,
  timezone text,
  registration_status text,
  reminder_window text,
  reminder_status text,
  remind_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.communities_enabled()
    or not public.is_active_member(auth.uid())
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = auth.uid()
        and membership.status = 'active'
    )
  then
    raise exception 'Active community membership required';
  end if;

  return query
  select
    event.id,
    event.timezone,
    event_member.status,
    reminder.reminder_window,
    reminder.status,
    reminder.remind_at
  from public.community_event_links event_link
  join public.events event on event.id = event_link.event_id
  left join public.event_memberships event_member
    on event_member.event_id = event.id
   and event_member.user_id = auth.uid()
  left join public.community_event_reminders reminder
    on reminder.community_id = event_link.community_id
   and reminder.event_id = event_link.event_id
   and reminder.user_id = auth.uid()
  where event_link.community_id = p_community_id
    and event.status = 'published'
  order by event.starts_at;
end;
$$;

create or replace function public.set_my_community_event_reminder(
  p_community_id uuid,
  p_event_id uuid,
  p_reminder_window text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  event_start timestamptz;
  scheduled_for timestamptz;
begin
  if not public.communities_enabled()
    or not public.is_active_member(actor)
    or not exists (
      select 1
      from public.community_memberships membership
      where membership.community_id = p_community_id
        and membership.user_id = actor
        and membership.status = 'active'
    )
  then
    raise exception 'Active community membership required';
  end if;

  select event.starts_at
  into event_start
  from public.community_event_links event_link
  join public.events event on event.id = event_link.event_id
  where event_link.community_id = p_community_id
    and event_link.event_id = p_event_id
    and event.status = 'published';

  if event_start is null then
    raise exception 'Community event not found';
  end if;

  if p_reminder_window is null then
    delete from public.community_event_reminders reminder
    where reminder.user_id = actor
      and reminder.community_id = p_community_id
      and reminder.event_id = p_event_id;
  else
    if p_reminder_window not in ('day_before', 'hour_before') then
      raise exception 'Choose one day or one hour before the event';
    end if;

    scheduled_for := event_start - case p_reminder_window
      when 'day_before' then interval '1 day'
      else interval '1 hour'
    end;
    if event_start <= now() or scheduled_for <= now() then
      raise exception 'It is too late to schedule this reminder';
    end if;

    insert into public.community_event_reminders (
      user_id,
      community_id,
      event_id,
      reminder_window,
      remind_at
    ) values (
      actor,
      p_community_id,
      p_event_id,
      p_reminder_window,
      scheduled_for
    )
    on conflict (user_id, community_id, event_id) do update
    set reminder_window = excluded.reminder_window,
        remind_at = excluded.remind_at,
        status = 'scheduled',
        revision = public.community_event_reminders.revision + 1,
        updated_at = now();
  end if;

  insert into public.audit_events (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    actor,
    case when p_reminder_window is null
      then 'community.event_reminder_removed'
      else 'community.event_reminder_set'
    end,
    'event',
    p_event_id,
    jsonb_build_object(
      'community_id', p_community_id,
      'window', p_reminder_window
    )
  );
end;
$$;

create or replace function public.sync_community_event_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.starts_at is not distinct from new.starts_at then
    return new;
  end if;

  update public.community_event_reminders reminder
  set remind_at = new.starts_at - case reminder.reminder_window
        when 'day_before' then interval '1 day'
        else interval '1 hour'
      end,
      status = case
        when new.starts_at - case reminder.reminder_window
          when 'day_before' then interval '1 day'
          else interval '1 hour'
        end > now() then 'scheduled'
        else 'cancelled'
      end,
      revision = reminder.revision + 1,
      updated_at = now()
  where reminder.event_id = new.id
    and reminder.status in ('scheduled', 'queued');

  return new;
end;
$$;

drop trigger if exists sync_community_event_reminders_on_change
  on public.events;
create trigger sync_community_event_reminders_on_change
after update of starts_at on public.events
for each row execute function public.sync_community_event_reminders();

create or replace function public.queue_due_community_event_reminders(
  p_run_at timestamptz default now()
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  queued integer := 0;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if not public.communities_enabled() then
    return 0;
  end if;

  for target in
    select
      reminder.id,
      reminder.user_id,
      reminder.revision,
      event.title,
      event.slug,
      community.name as community_name
    from public.community_event_reminders reminder
    join public.community_event_links event_link
      on event_link.community_id = reminder.community_id
     and event_link.event_id = reminder.event_id
    join public.events event on event.id = reminder.event_id
    join public.communities community on community.id = reminder.community_id
    join public.community_memberships membership
      on membership.community_id = reminder.community_id
     and membership.user_id = reminder.user_id
    join public.profiles profile on profile.id = reminder.user_id
    where reminder.status = 'scheduled'
      and reminder.remind_at <= p_run_at
      and event.starts_at > p_run_at
      and event.status = 'published'
      and community.status = 'published'
      and membership.status = 'active'
      and profile.access_status = 'active'
      and not profile.is_test_account
    order by reminder.remind_at, reminder.id
    for update of reminder skip locked
    limit 500
  loop
    update public.community_event_reminders reminder
    set status = 'queued', updated_at = now()
    where reminder.id = target.id
      and reminder.status = 'scheduled';

    if found then
      perform public.enqueue_notification(
        target.user_id,
        'event',
        'Coming up: ' || target.title,
        target.community_name || ' added this event to your Community calendar. Your reminder is ready.',
        '/events/' || target.slug,
        'community-event-reminder:' || target.id || ':' || target.revision
      );
      queued := queued + 1;
    end if;
  end loop;

  return queued;
end;
$$;

revoke all on function public.list_my_community_event_preferences(uuid) from public;
grant execute on function public.list_my_community_event_preferences(uuid) to authenticated;
revoke all on function public.set_my_community_event_reminder(uuid, uuid, text) from public;
grant execute on function public.set_my_community_event_reminder(uuid, uuid, text) to authenticated;
revoke all on function public.queue_due_community_event_reminders(timestamptz) from public;
grant execute on function public.queue_due_community_event_reminders(timestamptz) to service_role;

commit;
