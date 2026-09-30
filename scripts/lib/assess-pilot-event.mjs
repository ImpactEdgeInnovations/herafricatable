export function assessPilotEvent({ event, tickets, host, hostProfile, workspace,
  safetyContact, onlineLink, venue, doorStaffActive, orders = [] }, now = new Date()) {
  const start = new Date(event.starts_at).getTime();
  const end = new Date(event.ends_at).getTime();
  const current = now.getTime();
  const needsVenue = event.format !== "virtual";
  const needsOnlineLink = event.format !== "in_person";
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
      && start > current && end > start),
    placeReady: (!needsVenue || Boolean(venue?.name?.trim() && venue?.city?.trim()
      && venue?.country?.trim())) && (!needsOnlineLink || Boolean(onlineLink?.trim())),
    placeAvailable: Number.isInteger(event.capacity)
      && event.capacity - reservedSeats > 0,
    freeManualTicket: event.registration_mode === "manual_review" && freeOnSale,
    hostReady: host?.status === "active" && hostProfile?.access_status === "active",
    hostContentApproved: workspace?.status === "approved",
    safetyContactReady: Boolean(safetyContact),
    doorStaffAssigned: doorStaffActive === true,
  };
}
