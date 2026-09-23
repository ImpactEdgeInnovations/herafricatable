begin;

-- Both a member and an event-only guest may cancel their own pending request.
-- A confirmed free place can be released before the event starts without a
-- refund workflow. Paid confirmed places continue through refund review.
create or replace function public.cancel_my_event_place(
  p_order_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  target public.orders%rowtype;
  event_start timestamptz;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select * into target from public.orders
  where id = p_order_id and user_id = actor and order_type = 'event'
  for update;
  if not found then raise exception 'Event registration not found'; end if;

  if target.status in ('pending_payment', 'pending_review') then
    perform public.cancel_pending_registration(p_order_id, p_reason);
    return;
  end if;
  if target.status <> 'fulfilled' then
    raise exception 'This event place cannot be cancelled here';
  end if;
  if target.total_minor > 0 then
    raise exception 'Use the refund request for a paid event place';
  end if;

  select starts_at into event_start from public.events where id = target.event_id;
  if event_start <= now() then
    raise exception 'Contact the event team to change a place after the event begins';
  end if;
  if not exists (
    select 1 from public.event_memberships
    where event_id = target.event_id and user_id = actor
      and order_id = target.id and status = 'confirmed'
  ) then
    raise exception 'A confirmed, unused place is required';
  end if;
  if exists (
    select 1 from public.event_checkins
    where event_id = target.event_id and user_id = actor
  ) then
    raise exception 'Contact the event team after a check-in has been recorded';
  end if;

  -- A later reapplication must receive a fresh code, even if the first pass
  -- was photographed or shared before cancellation.
  delete from public.event_checkin_credentials
  where event_id = target.event_id and user_id = actor;

  update public.event_memberships
  set status = 'cancelled', updated_at = now()
  where event_id = target.event_id and user_id = actor and order_id = target.id;
  update public.entitlements
  set status = 'revoked', revoked_at = now()
  where order_id = target.id and entitlement_type = 'event_access'
    and status = 'active';
  update public.registration_requests
  set status = 'cancelled', updated_at = now()
  where event_id = target.event_id and user_id = actor and order_id = target.id;
  update public.orders set status = 'cancelled', updated_at = now()
  where id = target.id;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'registration.free_place_cancelled', 'order', target.id,
    jsonb_build_object(
      'event_id', target.event_id,
      'reason', nullif(left(trim(coalesce(p_reason, '')), 1000), '')
    )
  );
end;
$$;

revoke all on function public.cancel_my_event_place(uuid, text) from public;
grant execute on function public.cancel_my_event_place(uuid, text) to authenticated;

-- The original unique(event_id,user_id) request row can be reused only after
-- rejection or cancellation. A new order and audit trail are still created.
create or replace function public.create_event_registration(
  p_event_id uuid,
  p_ticket_type_id uuid,
  p_quantity integer,
  p_attendee_note text,
  p_manual_reference text,
  p_manual_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_status text;
  guest_access_enabled boolean := false;
  evt public.events%rowtype;
  ticket public.ticket_types%rowtype;
  saved_order uuid;
  saved_request uuid;
  requested integer;
  order_status text;
begin
  if actor is null then raise exception 'Authentication required'; end if;

  select profile.access_status::text into actor_status
  from public.profiles profile where profile.id = actor;
  if actor_status is null or actor_status in ('suspended', 'deleted') then
    raise exception 'This account cannot request an event place';
  end if;

  select * into evt from public.events
  where id = p_event_id and status = 'published' for share;
  if not found or not public.can_view_event(p_event_id, actor) then
    raise exception 'Event is not available to this account';
  end if;

  if actor_status <> 'active' then
    select coalesce(flag.enabled, false) into guest_access_enabled
    from public.feature_flags flag where flag.key = 'event_guest_access';
    if actor_status <> 'pending'
      or not coalesce(guest_access_enabled, false)
      or evt.audience <> 'public' then
      raise exception 'Event registration is available after membership approval';
    end if;
  end if;

  if evt.registration_mode = 'closed' then raise exception 'Registration is closed'; end if;
  if evt.audience = 'community' and p_quantity <> 1 then
    raise exception 'Choose one Community place per member';
  end if;
  if exists (
    select 1 from public.registration_requests
    where event_id = p_event_id and user_id = actor and status = 'rejected'
  ) then
    raise exception 'This request was declined. Contact the event team if you need help';
  end if;
  if exists (
    select 1 from public.registration_requests
    where event_id = p_event_id and user_id = actor
      and status <> 'cancelled'
  ) then raise exception 'You already have a registration for this event'; end if;

  if evt.registration_mode = 'waitlist' then
    insert into public.registration_requests(event_id, user_id, status, attendee_note)
    values(p_event_id, actor, 'waitlisted', nullif(trim(p_attendee_note), ''))
    on conflict(event_id, user_id) do update
      set order_id = null, status = excluded.status,
          attendee_note = excluded.attendee_note, updated_at = now()
      where public.registration_requests.status = 'cancelled'
    returning id into saved_request;
    if saved_request is null then
      raise exception 'You already have a registration for this event';
    end if;
    return saved_request;
  end if;

  select * into ticket from public.ticket_types
  where id = p_ticket_type_id and event_id = p_event_id and status = 'on_sale'
  for update;
  if not found then raise exception 'Ticket is not available'; end if;
  if p_quantity not between 1 and 10 then raise exception 'Choose between 1 and 10 tickets'; end if;
  if ticket.sales_start_at is not null and ticket.sales_start_at > now() then
    raise exception 'Ticket sales have not opened';
  end if;
  if ticket.sales_end_at is not null and ticket.sales_end_at < now() then
    raise exception 'Ticket sales have ended';
  end if;
  select coalesce(sum(order_items.quantity), 0) into requested
  from public.order_items
  join public.orders on orders.id = order_items.order_id
  where order_items.ticket_type_id = ticket.id
    and orders.status not in ('cancelled', 'expired', 'refunded');
  if ticket.inventory_quantity is not null
    and requested + p_quantity > ticket.inventory_quantity then
    raise exception 'Not enough tickets remain';
  end if;

  order_status := case when evt.registration_mode = 'automatic'
    then 'pending_payment' else 'pending_review' end;
  insert into public.orders(
    user_id, event_id, status, processing_mode, currency,
    subtotal_minor, total_minor, reservation_expires_at
  ) values (
    actor, p_event_id, order_status, evt.registration_mode, ticket.currency,
    ticket.price_minor * p_quantity, ticket.price_minor * p_quantity,
    case when evt.registration_mode = 'automatic'
      then now() + interval '20 minutes' else null end
  ) returning id into saved_order;
  insert into public.order_items(
    order_id, ticket_type_id, quantity, unit_price_minor, line_total_minor
  ) values (
    saved_order, ticket.id, p_quantity, ticket.price_minor,
    ticket.price_minor * p_quantity
  );
  insert into public.registration_requests(
    event_id, user_id, order_id, status, attendee_note
  ) values (
    p_event_id, actor, saved_order, order_status,
    nullif(trim(p_attendee_note), '')
  ) on conflict(event_id, user_id) do update
    set order_id = excluded.order_id, status = excluded.status,
        attendee_note = excluded.attendee_note, updated_at = now()
    where public.registration_requests.status = 'cancelled'
  returning id into saved_request;
  if saved_request is null then
    raise exception 'You already have a registration for this event';
  end if;
  if evt.registration_mode = 'manual_review' then
    insert into public.manual_payment_reviews(
      order_id, submitted_reference, submitter_note
    ) values (
      saved_order, nullif(trim(p_manual_reference), ''),
      nullif(trim(p_manual_note), '')
    );
  end if;
  insert into public.audit_events(actor_id, action, target_type, target_id, metadata)
  values (
    actor, 'registration.created', 'order', saved_order,
    jsonb_build_object(
      'event_id', p_event_id, 'mode', evt.registration_mode,
      'total_minor', ticket.price_minor * p_quantity,
      'currency', ticket.currency,
      'event_guest', actor_status <> 'active'
    )
  );
  return saved_order;
end;
$$;

-- Reapproval after a voluntary cancellation must point the event membership
-- at the new order, so later cancellation and refund checks use the right one.
create or replace function public.fulfill_registration_order(
  p_order_id uuid,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.orders%rowtype;
  ticket_id uuid;
  event_status text;
begin
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if target.status = 'fulfilled' then return; end if;
  if target.status not in ('paid', 'approved') then
    raise exception 'Order is not approved for fulfillment';
  end if;

  select status into event_status from public.events where id = target.event_id;
  if event_status <> 'published' then
    if target.total_minor > 0 then
      insert into public.refund_requests(order_id, user_id, reason)
      values (
        target.id, target.user_id,
        'Payment completed while the event was unavailable. Refund review is required.'
      ) on conflict(order_id) do nothing;
      update public.orders set status = 'refund_pending', updated_at = now()
      where id = target.id;
    else
      update public.orders set status = 'cancelled', updated_at = now()
      where id = target.id;
    end if;
    update public.registration_requests set status = 'cancelled', updated_at = now()
    where order_id = target.id;
    return;
  end if;

  select ticket_type_id into ticket_id from public.order_items
  where order_id = p_order_id order by id limit 1;
  insert into public.event_memberships(
    event_id, user_id, order_id, ticket_type_id, status, confirmed_at
  ) values (
    target.event_id, target.user_id, target.id, ticket_id, 'confirmed', now()
  ) on conflict(event_id, user_id) do update
    set order_id = excluded.order_id,
        ticket_type_id = excluded.ticket_type_id,
        status = 'confirmed', confirmed_at = now(), updated_at = now();
  insert into public.entitlements(
    user_id, event_id, order_id, entitlement_type, metadata
  ) values (
    target.user_id, target.event_id, target.id, 'event_access',
    jsonb_build_object('source', p_source)
  ) on conflict(user_id, event_id, entitlement_type) do update
    set order_id = excluded.order_id,
        status = 'active', revoked_at = null, metadata = excluded.metadata;
  update public.registration_requests set status = 'approved', updated_at = now()
  where order_id = p_order_id;
  update public.orders set status = 'fulfilled', fulfilled_at = now(), updated_at = now()
  where id = p_order_id;
end;
$$;

commit;
