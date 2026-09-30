begin;

-- Waitlisting is interest, not a reservation or an event pass. Keep the list
-- private to event managers and let the attendee withdraw at any time.
create or replace function public.list_event_waitlist(p_event_id uuid)
returns table(
  request_id uuid, event_id uuid, user_id uuid, email text,
  display_name text, joined_at timestamptz, is_test_account boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_manage_event(p_event_id) then
    raise exception 'Not authorized';
  end if;
  return query
    select request.id, request.event_id, request.user_id, user_row.email::text,
      profile.display_name, request.created_at,
      coalesce(profile.is_test_account, false)
    from public.registration_requests request
    join auth.users user_row on user_row.id = request.user_id
    left join public.profiles profile on profile.id = request.user_id
    where request.event_id = p_event_id and request.status = 'waitlisted'
    order by request.created_at, request.id;
end;
$$;

create or replace function public.leave_event_waitlist(p_event_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.registration_requests%rowtype;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into target from public.registration_requests
  where event_id = p_event_id and user_id = actor and status = 'waitlisted'
  for update;
  if not found then raise exception 'You are not on this event waitlist'; end if;

  update public.registration_requests
  set status = 'cancelled', updated_at = now() where id = target.id;
  update public.notification_jobs
  set status = 'suppressed', updated_at = now()
  where user_id = actor and status = 'queued'
    and dedupe_key like 'event-waitlist-open:' || target.id || ':%';
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (actor, 'event.waitlist_left', 'registration_request', target.id);
end;
$$;

-- Reopening a free or manually reviewed event does not silently register the
-- waiting attendee. This RPC reuses the existing one-person registration,
-- ticket inventory and shared event-capacity guards in one transaction.
create or replace function public.request_event_place_from_waitlist(
  p_event_id uuid, p_ticket_type_id uuid, p_attendee_note text,
  p_manual_reference text, p_manual_note text
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.registration_requests%rowtype;
  event_record public.events%rowtype;
  saved_order uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into target from public.registration_requests
  where event_id = p_event_id and user_id = actor and status = 'waitlisted'
  for update;
  if not found then raise exception 'You are not on this event waitlist'; end if;
  select * into event_record from public.events where id = p_event_id;
  if event_record.status <> 'published' or event_record.ends_at <= now()
    or event_record.registration_mode <> 'manual_review' then
    raise exception 'Event places are not open for request';
  end if;

  update public.registration_requests
  set status = 'cancelled', updated_at = now() where id = target.id;
  saved_order := public.create_event_registration(
    p_event_id, p_ticket_type_id, 1,
    coalesce(nullif(trim(p_attendee_note), ''), target.attendee_note),
    p_manual_reference, p_manual_note
  );
  insert into public.audit_events(actor_id, action, target_type, target_id,
    metadata)
  values (actor, 'event.waitlist_place_requested', 'registration_request',
    target.id, jsonb_build_object('order_id', saved_order));
  return saved_order;
end;
$$;

-- Admin can notify a waiting person only when a published event has reopened
-- for manual review and a ticket is currently available. The notice explicitly
-- does not hold a seat; approval and availability remain authoritative.
create or replace function public.notify_waitlisted_event_guest(p_request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.registration_requests%rowtype;
  event_record public.events%rowtype;
  actor_status text;
  guest_flag boolean;
  reserved bigint;
  available_ticket boolean;
  notice_key text;
begin
  select * into target from public.registration_requests
  where id = p_request_id and status = 'waitlisted' for update;
  if not found or actor is null or not public.can_manage_event(target.event_id) then
    raise exception 'Waitlist request not available';
  end if;
  select * into event_record from public.events where id = target.event_id;
  if event_record.status <> 'published' or event_record.starts_at <= now()
    or event_record.registration_mode <> 'manual_review' then
    raise exception 'Reopen manual registration before emailing the waitlist';
  end if;
  select access_status::text into actor_status from public.profiles
  where id = target.user_id;
  select coalesce(enabled, false) into guest_flag from public.feature_flags
  where key = 'event_guest_access';
  if not public.can_view_event(target.event_id, target.user_id)
    or not (actor_status = 'active' or
      (actor_status = 'pending' and event_record.audience = 'public'
        and coalesce(guest_flag, false))) then
    raise exception 'This attendee cannot request an event place now';
  end if;
  select coalesce(sum(item.quantity), 0) into reserved
  from public.order_items item
  join public.orders booking on booking.id = item.order_id
  where booking.event_id = target.event_id and booking.order_type = 'event'
    and booking.status not in ('cancelled', 'expired', 'refunded');
  if event_record.capacity is not null and reserved >= event_record.capacity then
    raise exception 'Event is full';
  end if;
  select exists (
    select 1 from public.ticket_types ticket
    where ticket.event_id = target.event_id and ticket.status = 'on_sale'
      and (ticket.sales_start_at is null or ticket.sales_start_at <= now())
      and (ticket.sales_end_at is null or ticket.sales_end_at > now())
      and (ticket.inventory_quantity is null or ticket.inventory_quantity > (
        select coalesce(sum(item.quantity), 0)
        from public.order_items item
        join public.orders booking on booking.id = item.order_id
        where item.ticket_type_id = ticket.id
          and booking.status not in ('cancelled', 'expired', 'refunded')
      ))
  ) into available_ticket;
  if not available_ticket then raise exception 'No booking option is available'; end if;

  notice_key := 'event-waitlist-open:' || target.id || ':' ||
    pg_catalog.to_char(target.updated_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS');
  if exists (select 1 from public.notification_jobs
    where user_id = target.user_id and dedupe_key = notice_key) then
    raise exception 'This opening notice was already sent';
  end if;
  perform public.enqueue_notification(
    target.user_id, 'registration', 'Bookings reopened for ' || event_record.title,
    'You can now request a place at ' || event_record.title ||
      '. No seat is held for you; availability and event-team approval still apply.',
    '/events/' || event_record.slug || '/register', notice_key
  );
  insert into public.audit_events(actor_id, action, target_type, target_id)
  values (actor, 'event.waitlist_opening_notified', 'registration_request',
    target.id);
end;
$$;

create or replace function public.event_waitlist_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select pg_catalog.to_regprocedure('public.list_event_waitlist(uuid)') is not null
    and pg_catalog.to_regprocedure('public.leave_event_waitlist(uuid)') is not null
    and pg_catalog.to_regprocedure('public.request_event_place_from_waitlist(uuid,uuid,text,text,text)') is not null
    and pg_catalog.to_regprocedure('public.notify_waitlisted_event_guest(uuid)') is not null;
$$;

revoke all on function public.list_event_waitlist(uuid) from public;
revoke all on function public.leave_event_waitlist(uuid) from public;
revoke all on function public.request_event_place_from_waitlist(uuid,uuid,text,text,text) from public;
revoke all on function public.notify_waitlisted_event_guest(uuid) from public;
revoke all on function public.event_waitlist_ready() from public;
grant execute on function public.list_event_waitlist(uuid) to authenticated;
grant execute on function public.leave_event_waitlist(uuid) to authenticated;
grant execute on function public.request_event_place_from_waitlist(uuid,uuid,text,text,text) to authenticated;
grant execute on function public.notify_waitlisted_event_guest(uuid) to authenticated;
grant execute on function public.event_waitlist_ready() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
