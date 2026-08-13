begin;

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
  if not public.communities_enabled() then return 0; end if;

  for target in
    select reminder.id, reminder.user_id, reminder.revision,
      event.title, event.slug as event_slug,
      community.name as community_name, community.slug as community_slug
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
    where reminder.id = target.id and reminder.status = 'scheduled';

    if found then
      perform public.enqueue_notification(
        target.user_id,
        'event',
        'Coming up: ' || target.title,
        target.community_name || ' is gathering soon. Open the room for the latest details, questions and joining link.',
        '/communities/' || target.community_slug || '/gatherings/' || target.event_slug,
        'community-event-reminder:' || target.id || ':' || target.revision
      );
      queued := queued + 1;
    end if;
  end loop;
  return queued;
end;
$$;

revoke all on function public.queue_due_community_event_reminders(timestamptz) from public;
grant execute on function public.queue_due_community_event_reminders(timestamptz) to service_role;

comment on function public.queue_due_community_event_reminders(timestamptz) is
  'Queues consented Community event reminders through the existing notification outbox and returns members to the protected Gathering room.';

create or replace function public.notify_community_gathering_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target record; host_id uuid;
begin
  select room.community_id, event.title, event.slug as event_slug,
    community.slug as community_slug
  into target
  from public.community_gathering_rooms room
  join public.events event on event.id = room.event_id
  join public.communities community on community.id = room.community_id
  where room.id = new.room_id;

  for host_id in
    select membership.user_id
    from public.community_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.community_id = target.community_id
      and membership.status = 'active'
      and membership.role in ('owner', 'moderator')
      and membership.user_id <> new.author_id
      and profile.access_status = 'active'
  loop
    perform public.enqueue_notification(
      host_id,
      'community',
      'A member shared a gathering question',
      'A question is ready for Host review before “' || target.title || '”.',
      '/communities/' || target.community_slug || '/gatherings/' || target.event_slug || '#questions',
      'community-gathering-question:' || new.id || ':' || host_id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_hosts_of_gathering_question
  on public.community_gathering_questions;
create trigger notify_hosts_of_gathering_question
after insert on public.community_gathering_questions
for each row execute function public.notify_community_gathering_question();

create or replace function public.notify_community_gathering_recap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target record; member_id uuid;
begin
  if old.recap_published_at is not null or new.recap_published_at is null then
    return new;
  end if;
  select event.title, event.slug as event_slug, community.slug as community_slug
  into target
  from public.events event
  join public.communities community on community.id = new.community_id
  where event.id = new.event_id;

  for member_id in
    select membership.user_id
    from public.community_memberships membership
    join public.profiles profile on profile.id = membership.user_id
    where membership.community_id = new.community_id
      and membership.status = 'active'
      and profile.access_status = 'active'
      and membership.user_id <> coalesce(new.updated_by, new.created_by)
  loop
    perform public.enqueue_notification(
      member_id,
      'community',
      'Gathering recap ready',
      'The Host shared the useful ideas and next steps from “' || target.title || '”.',
      '/communities/' || target.community_slug || '/gatherings/' || target.event_slug,
      'community-gathering-recap:' || new.id || ':' || member_id
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists notify_members_of_gathering_recap
  on public.community_gathering_rooms;
create trigger notify_members_of_gathering_recap
after update of recap_published_at on public.community_gathering_rooms
for each row execute function public.notify_community_gathering_recap();

revoke all on function public.notify_community_gathering_question() from public;
revoke all on function public.notify_community_gathering_recap() from public;

commit;
