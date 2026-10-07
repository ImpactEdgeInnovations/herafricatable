begin;

-- The instant path respects both the whole-event cap and a smaller free-ticket
-- allocation. Locking the ticket row serializes two requests for its last seat.
alter function public.reserve_free_event_place(uuid,uuid,text)
  rename to reserve_free_event_place_core;
revoke all on function public.reserve_free_event_place_core(uuid,uuid,text)
  from public, anon, authenticated;

create or replace function public.reserve_free_event_place(
  p_event_id uuid, p_ticket_type_id uuid, p_attendee_note text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare ticket public.ticket_types%rowtype; reserved bigint;
begin
  select * into ticket from public.ticket_types
  where id = p_ticket_type_id and event_id = p_event_id for update;
  if not found then raise exception 'Ticket is not available'; end if;
  if ticket.inventory_quantity is not null then
    select coalesce(sum(item.quantity),0) into reserved
    from public.order_items item
    join public.orders booking on booking.id = item.order_id
    where item.ticket_type_id = ticket.id
      and booking.status not in ('cancelled','expired','refunded');
    if reserved >= ticket.inventory_quantity then
      raise exception 'This free ticket is fully booked';
    end if;
  end if;
  return public.reserve_free_event_place_core(
    p_event_id,p_ticket_type_id,p_attendee_note);
end;
$$;
revoke all on function public.reserve_free_event_place(uuid,uuid,text) from public, anon;
grant execute on function public.reserve_free_event_place(uuid,uuid,text) to authenticated;

-- A pilot Host's automatically published free event should open with instant
-- places. Only the already-approved pilot proposal path may set this default;
-- a Host/Admin can later turn it off through the scoped setting above.
create or replace function public.enable_pilot_free_booking_after_publication()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'approved' or not new.pilot_auto_draft
    or new.canonical_event_id is null
    or public.get_membership_intake_mode() <> 'trusted_auto'
    or (tg_op = 'UPDATE' and old.canonical_event_id is not distinct from new.canonical_event_id
      and old.pilot_auto_draft is not distinct from new.pilot_auto_draft) then
    return new;
  end if;
  update public.events event set free_instant_booking = true, updated_at = now()
  where event.id = new.canonical_event_id
    and event.created_by = new.proposed_by
    and event.status = 'published' and event.starts_at > now()
    and event.audience = 'public' and event.capacity is not null
    and event.registration_mode = 'manual_review'
    and exists (select 1 from public.event_hosts host
      where host.event_id = event.id and host.user_id = new.proposed_by
        and host.status = 'active')
    and exists (select 1 from public.ticket_types ticket
      where ticket.event_id = event.id and ticket.status = 'on_sale'
        and ticket.price_minor = 0)
    and not exists (select 1 from public.ticket_types ticket
      where ticket.event_id = event.id and ticket.status = 'on_sale'
        and ticket.price_minor > 0);
  return new;
end;
$$;
revoke all on function public.enable_pilot_free_booking_after_publication()
  from public, anon;
drop trigger if exists pilot_free_booking_after_publication
  on public.member_event_proposals;
create trigger pilot_free_booking_after_publication
after update of canonical_event_id,pilot_auto_draft
on public.member_event_proposals
for each row execute function public.enable_pilot_free_booking_after_publication();

-- Existing live pilot events are opt-in only if they meet the same safeguards.
update public.events event set free_instant_booking = true, updated_at = now()
where public.get_membership_intake_mode() = 'trusted_auto'
  and event.status = 'published' and event.starts_at > now()
  and event.audience = 'public' and event.capacity is not null
  and event.registration_mode = 'manual_review'
  and exists (select 1 from public.member_event_proposals proposal
    where proposal.canonical_event_id = event.id
      and proposal.proposed_by = event.created_by
      and proposal.status = 'approved' and proposal.pilot_auto_draft)
  and exists (select 1 from public.event_hosts host
    where host.event_id = event.id and host.user_id = event.created_by
      and host.status = 'active')
  and exists (select 1 from public.ticket_types ticket
    where ticket.event_id = event.id and ticket.status = 'on_sale'
      and ticket.price_minor = 0)
  and not exists (select 1 from public.ticket_types ticket
    where ticket.event_id = event.id and ticket.status = 'on_sale'
      and ticket.price_minor > 0);

notify pgrst, 'reload schema';
commit;
