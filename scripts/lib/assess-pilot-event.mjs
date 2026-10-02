function reservationCounts(orders) {
  const reservedByTicket = new Map();
  let reservedSeats = 0;
  for (const order of orders) {
    if (["cancelled", "expired", "refunded"].includes(order.status)) continue;
    for (const item of order.order_items ?? []) {
      const quantity = Number(item.quantity) || 0;
      reservedSeats += quantity;
      reservedByTicket.set(item.ticket_type_id,
        (reservedByTicket.get(item.ticket_type_id) ?? 0) + quantity);
    }
  }
  return { reservedByTicket, reservedSeats };
}

export function assessPilotEvent({ event, tickets, host, hostProfile, workspace,
  safetyContact, onlineLink, venue, doorStaffActive, orders = [] }, now = new Date()) {
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();
  const current = now.getTime();
  const needsVenue = event.format !== "virtual";
  const needsOnlineLink = event.format !== "in_person";
  const { reservedByTicket, reservedSeats } = reservationCounts(orders);
  const freeOnSale = tickets.some((ticket) =>
    ticket.status === "on_sale" && Number(ticket.price_minor) === 0
    && (ticket.inventory_quantity === null
      || (ticket.inventory_quantity ?? 0) > (reservedByTicket.get(ticket.id) ?? 0))
    && (!ticket.sales_start_at || new Date(ticket.sales_start_at).getTime() <= current)
    && (!ticket.sales_end_at || new Date(ticket.sales_end_at).getTime() > current));

  return {
    publicAndPublished: event.status === "published" && event.audience === "public",
    basics: Boolean(event.summary?.trim().length >= 40 && event.capacity > 0
      && event.timezone?.trim() && Number.isFinite(start) && Number.isFinite(end)
      && start > current + (event.status === "draft" ? 48 * 60 * 60 * 1000 : 0)
      && end > start),
    placeReady: (!needsVenue || Boolean(venue?.name?.trim() && venue?.city?.trim()
      && venue?.country?.trim() && (venue?.address_line?.trim() || venue?.map_url?.trim())))
      && (!needsOnlineLink || Boolean(onlineLink?.trim())),
    placeAvailable: Number.isInteger(event.capacity)
      && event.capacity - reservedSeats > 0,
    freeManualTicket: event.registration_mode === "manual_review" && freeOnSale,
    hostReady: host?.status === "active" && hostProfile?.access_status === "active",
    hostContentApproved: workspace?.status === "approved",
    safetyContactReady: Boolean(safetyContact),
    doorStaffAssigned: doorStaffActive === true,
  };
}

// Publication is a separate, earlier decision from opening guest requests.
// A closed draft can have its page reviewed without silently accepting places.
export function assessPilotPublication(input, now = new Date()) {
  const checks = assessPilotEvent(input, now);
  const { reservedByTicket } = reservationCounts(input.orders ?? []);
  return {
    privatePublicDraft: input.event.status === "draft" && input.event.audience === "public"
      && input.event.registration_mode === "closed",
    basics: checks.basics,
    placeReady: checks.placeReady,
    placeAvailable: checks.placeAvailable,
    freeTicketPrepared: input.tickets.some((ticket) =>
      Number(ticket.price_minor) === 0 && ["draft", "on_sale"].includes(ticket.status)
      && (ticket.inventory_quantity === null
        || ticket.inventory_quantity > (reservedByTicket.get(ticket.id) ?? 0))
      && (!ticket.sales_end_at || new Date(ticket.sales_end_at).getTime() > now.getTime())),
    hostReady: checks.hostReady,
    hostDraftSubmitted: ["submitted", "approved"].includes(input.workspace?.status),
    safetyContactReady: checks.safetyContactReady,
    doorStaffAssigned: checks.doorStaffAssigned,
  };
}
