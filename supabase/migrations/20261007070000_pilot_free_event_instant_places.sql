begin;

-- Free pilot places are separate from paid automatic checkout. Existing events
-- retain their present review setting unless a Host/Admin explicitly opts in.
alter table public.events
  add column if not exists free_instant_booking boolean not null default false;

create or replace function public.set_event_free_instant_booking(
  p_event_id uuid, p_enabled boolean
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.events%rowtype; actor uuid := auth.uid();
begin
  if actor is null or p_enabled is null then raise exception 'Sign in and choose a booking setting'; end if;
  select * into target from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found'; end if;
  if not public.is_admin(array['super_admin']::public.app_role[])
    and not (public.can_host_event(p_event_id)
      and target.created_by = actor
      and public.founding_pilot_member_ready(actor)) then
    raise exception 'Only this pilot Event Host or Super Admin can change free booking';
  end if;
  if p_enabled then
    if target.status <> 'published' or target.starts_at <= now()
      or target.audience <> 'public' or target.capacity is null
      or target.registration_mode <> 'manual_review'
      or public.get_membership_intake_mode() <> 'trusted_auto' then
      raise exception 'Instant places require a future, public, capacity-limited free pilot event';
    end if;
    if not exists (select 1 from public.ticket_types ticket
      where ticket.event_id = p_event_id and ticket.status = 'on_sale'
        and ticket.price_minor = 0)
      or exists (select 1 from public.ticket_types ticket
        where ticket.event_id = p_event_id and ticket.status = 'on_sale'
          and ticket.price_minor <> 0) then
      raise exception 'All available ticket choices must be free';
    end if;
  end if;
  update public.events set free_instant_booking = p_enabled,
    updated_by = actor, updated_at = now() where id = p_event_id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (actor, 'event.free_instant_booking_changed', 'event', p_event_id,
    jsonb_build_object('enabled', p_enabled));
  return p_enabled;
end;
$$;
revoke all on function public.set_event_free_instant_booking(uuid,boolean) from public, anon;
grant execute on function public.set_event_free_instant_booking(uuid,boolean) to authenticated;

create or replace function public.reserve_free_event_place(
  p_event_id uuid, p_ticket_type_id uuid, p_attendee_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.events%rowtype;
  ticket public.ticket_types%rowtype; saved_order uuid; saved_request uuid;
begin
  if actor is null or not public.is_active_member(actor) then
    raise exception 'An active membership is needed to reserve this place';
  end if;
  select * into target from public.events where id = p_event_id for share;
  if not found or target.status <> 'published' or target.starts_at <= now()
    or target.registration_mode <> 'manual_review'
    or not target.free_instant_booking
    or public.get_membership_intake_mode() <> 'trusted_auto'
    or not public.can_view_event(p_event_id, actor) then
    raise exception 'Instant free booking is not available for this event';
  end if;
  if exists (select 1 from public.ticket_types other_ticket
    where other_ticket.event_id = p_event_id and other_ticket.status = 'on_sale'
      and other_ticket.price_minor <> 0) then
    raise exception 'Free booking is unavailable while a paid choice is on sale';
  end if;
  if exists (select 1 from public.registration_requests request
    where request.event_id = p_event_id and request.user_id = actor
      and request.status = 'rejected') then
    raise exception 'This request was declined. Contact the event team if you need help';
  end if;
  if exists (select 1 from public.registration_requests request
    where request.event_id = p_event_id and request.user_id = actor
      and request.status <> 'cancelled') then
    raise exception 'You already have a place or request for this event';
  end if;
  select * into ticket from public.ticket_types
  where id = p_ticket_type_id and event_id = p_event_id
    and status = 'on_sale' and price_minor = 0 for update;
  if not found then raise exception 'Free place is unavailable'; end if;
  if (ticket.sales_start_at is not null and ticket.sales_start_at > now())
    or (ticket.sales_end_at is not null and ticket.sales_end_at < now()) then
    raise exception 'Bookings are not open';
  end if;
  insert into public.orders(user_id,event_id,status,processing_mode,currency,
    subtotal_minor,total_minor)
  values (actor,p_event_id,'approved','manual_review',ticket.currency,0,0)
  returning id into saved_order;
  -- The existing advisory-lock trigger atomically enforces event capacity.
  insert into public.order_items(order_id,ticket_type_id,quantity,
    unit_price_minor,line_total_minor)
  values (saved_order,ticket.id,1,0,0);
  insert into public.registration_requests(event_id,user_id,order_id,status,attendee_note)
  values (p_event_id,actor,saved_order,'approved',nullif(trim(p_attendee_note),''))
  on conflict(event_id,user_id) do update
    set order_id = excluded.order_id, status = 'approved',
      attendee_note = excluded.attendee_note, updated_at = now()
    where public.registration_requests.status = 'cancelled'
  returning id into saved_request;
  if saved_request is null then raise exception 'You already have a place for this event'; end if;
  perform public.fulfill_registration_order(saved_order,'free_instant_booking');
  insert into public.audit_events(actor_id,action,target_type,target_id,metadata)
  values (actor,'registration.free_instant_confirmed','order',saved_order,
    jsonb_build_object('event_id',p_event_id,'ticket_type_id',ticket.id));
  return saved_order;
end;
$$;
revoke all on function public.reserve_free_event_place(uuid,uuid,text) from public, anon;
grant execute on function public.reserve_free_event_place(uuid,uuid,text) to authenticated;

-- Hosts receive a useful heads-up, without exposing guest identities or the
-- private guest roster in their limited Host workspace.
create or replace function public.notify_event_host_of_confirmed_place()
returns trigger language plpgsql security definer set search_path = '' as $$
declare host_user uuid; event_title text; event_slug text;
begin
  if new.status <> 'confirmed' or
    (tg_op = 'UPDATE' and old.status = 'confirmed' and old.order_id = new.order_id) then
    return new;
  end if;
  select host.user_id, event.title, event.slug into host_user,event_title,event_slug
  from public.event_hosts host join public.events event on event.id = host.event_id
  where host.event_id = new.event_id and host.status = 'active';
  if host_user is not null and host_user <> new.user_id then
    perform public.enqueue_notification(host_user,'event',
      'A guest joined ' || event_title,
      'A free place is confirmed. Open your event page to see the latest availability.',
      '/events/' || event_slug,
      'event-host-place:' || new.event_id || ':' || new.user_id || ':' || new.order_id);
  end if;
  return new;
end;
$$;
revoke all on function public.notify_event_host_of_confirmed_place() from public, anon;
drop trigger if exists event_host_confirmed_place on public.event_memberships;
create trigger event_host_confirmed_place
after insert or update of status,order_id on public.event_memberships
for each row execute function public.notify_event_host_of_confirmed_place();

notify pgrst, 'reload schema';
commit;
