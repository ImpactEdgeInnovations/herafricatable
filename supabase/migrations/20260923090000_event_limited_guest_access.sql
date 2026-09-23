begin;

-- An event ticket is an event entitlement. It must never approve a separate
-- application to join the full member network.
insert into public.feature_flags (key, enabled, description)
values (
  'event_guest_access',
  false,
  'Verified non-members may request places at published public events without receiving member access'
)
on conflict (key) do nothing;

-- Reuse the Admin Release evidence gate so this cannot be opened from a
-- convenient toggle before the event and payment foundations are verified.
create or replace function public.module_release_catalog()
returns table(
  feature_key text,
  feature_label text,
  module_key text,
  sort_order integer
)
language sql
immutable
security definer
set search_path = ''
as $$
  values
    ('communities', 'Communities', 'community_core', 10),
    ('communities', 'Communities', 'community_conversations', 10),
    ('communities', 'Communities', 'community_member_experience', 10),
    ('communities', 'Communities', 'community_programmes', 10),
    ('communities', 'Communities', 'community_release', 10),
    ('community_creator_commerce', 'Community host payments', 'community_commerce', 20),
    ('learning', 'Learning', 'learning', 30),
    ('referrals', 'Referrals', 'referrals', 40),
    ('memberships', 'Membership checkout', 'membership', 50),
    ('circles', 'Circles', 'circles', 60),
    ('partner_perks', 'Partner benefits', 'perks', 70),
    ('event_guest_access', 'Public event guests', 'events_content', 80),
    ('event_guest_access', 'Public event guests', 'registration_payments', 80)
$$;

insert into public.module_release_checks(
  feature_key, check_key, label, guidance, sort_order
)
values
  (
    'event_guest_access', 'database_boundary', 'Prove the event-only access boundary',
    'Run the guest-access database test. Confirm approval grants a pass but leaves membership pending and the member directory closed.', 10
  ),
  (
    'event_guest_access', 'two_account_journey', 'Rehearse guest and member registration',
    'Use separate verified guest and active-member accounts for the same public event. Confirm OTP return, decisions, pass and duplicate handling.', 20
  ),
  (
    'event_guest_access', 'admin_operations', 'Rehearse Admin review and notices',
    'Approve, decline and cancel realistic free/manual registrations. Check the notification outbox and email delivery.', 30
  ),
  (
    'event_guest_access', 'privacy_and_permissions', 'Keep member spaces private',
    'Verify a confirmed guest cannot open the member directory, messages or private Community and that suspended accounts cannot register.', 40
  ),
  (
    'event_guest_access', 'rollback_and_recovery', 'Rehearse closing guest registration',
    'Turn the pilot off, confirm new guest requests stop, and confirm existing approved passes remain available.', 50
  )
on conflict(feature_key, check_key) do nothing;

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
    where event_id = p_event_id and user_id = actor
      and status not in ('rejected', 'cancelled')
  ) then raise exception 'You already have a registration for this event'; end if;

  if evt.registration_mode = 'waitlist' then
    insert into public.registration_requests(event_id, user_id, status, attendee_note)
    values(p_event_id, actor, 'waitlisted', nullif(trim(p_attendee_note), ''))
    returning id into saved_order;
    return saved_order;
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
  );
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

-- Preserve the later lifecycle repair: a late payment cannot restore an
-- unavailable event. Remove only the unrelated member-onboarding grant.
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
        target.id,
        target.user_id,
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
    set status = 'confirmed', confirmed_at = now(), updated_at = now();
  insert into public.entitlements(
    user_id, event_id, order_id, entitlement_type, metadata
  ) values (
    target.user_id, target.event_id, target.id, 'event_access',
    jsonb_build_object('source', p_source)
  ) on conflict(user_id, event_id, entitlement_type) do nothing;
  update public.registration_requests set status = 'approved', updated_at = now()
  where order_id = p_order_id;
  update public.orders set status = 'fulfilled', fulfilled_at = now(), updated_at = now()
  where id = p_order_id;
end;
$$;

comment on function public.fulfill_registration_order(uuid, text) is
  'Fulfill an approved event order with event access only; membership approval remains a separate decision.';

commit;
