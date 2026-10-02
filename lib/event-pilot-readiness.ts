export type PilotEvent = {
  capacity: number | null;
  ends_at: string;
  format: "in_person" | "virtual" | "hybrid";
  registration_mode: "automatic" | "manual_review" | "closed" | "waitlist";
  starts_at: string;
  status: "draft" | "published" | "suspended" | "cancelled" | "completed";
  summary: string | null;
  venues: { address_line: string | null; city: string; country: string; map_url: string | null; name: string } | null;
};

export type PilotTicket = {
  id: string;
  inventory_quantity: number | null;
  price_minor: number;
  sales_end_at: string | null;
  sales_start_at: string | null;
  status: string;
};

export type PilotOrder = {
  event_id: string;
  status: string;
  order_items: { ticket_type_id: string; quantity: number }[];
};

export type PilotReadinessInput = {
  doorStaffActive: boolean;
  event: PilotEvent;
  hasSafetyContact: boolean;
  hostActive: boolean;
  hostDraftStatus: string | null;
  onlineLinkReady: boolean;
  orders: PilotOrder[];
  tickets: PilotTicket[];
};

export type PilotReadinessStep = {
  label: string;
  ready: boolean;
  guidance: string;
  href: string;
};

export function eventPilotReadiness(input: PilotReadinessInput, now = new Date()): PilotReadinessStep[] {
  const { event } = input;
  const startsAt = new Date(event.starts_at).getTime();
  const endsAt = new Date(event.ends_at).getTime();
  const requiresVenue = event.format !== "virtual";
  const requiresOnlineLink = event.format !== "in_person";
  const hasVenue = Boolean(event.venues?.name?.trim() && event.venues?.city?.trim() && event.venues?.country?.trim()
    && (event.venues?.address_line?.trim() || event.venues?.map_url?.trim()));
  const reservations = input.orders.filter((order) =>
    !["cancelled", "expired", "refunded"].includes(order.status));
  const reservedSeats = reservations.reduce((total, order) =>
    total + order.order_items.reduce((sum, item) => sum + item.quantity, 0), 0);
  const hasFreeTicket = input.tickets.some((ticket) =>
    ticket.price_minor === 0 && ticket.status === "on_sale" &&
    (ticket.inventory_quantity === null || ticket.inventory_quantity >
      reservations.reduce((total, order) => total + order.order_items
        .filter((item) => item.ticket_type_id === ticket.id)
        .reduce((sum, item) => sum + item.quantity, 0), 0)) &&
    (!ticket.sales_start_at || Date.parse(ticket.sales_start_at) <= now.getTime()) &&
    (!ticket.sales_end_at || Date.parse(ticket.sales_end_at) > now.getTime()));
  const basicsReady = Boolean(event.summary && event.summary.trim().length >= 40 && event.capacity && event.capacity > 0 &&
    Number.isFinite(startsAt) && Number.isFinite(endsAt) &&
    startsAt > now.getTime() + (event.status === "draft" ? 48 * 60 * 60 * 1000 : 0) && endsAt > startsAt);
  const basicsGuidance = !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt
    ? "Set a valid start and end time in Event details."
    : event.status === "draft" && startsAt <= now.getTime() + 48 * 60 * 60 * 1000
      ? "Move this private draft to a date more than 48 hours away. Host review cannot publish it after that cutoff."
      : !event.summary || event.summary.trim().length < 40
        ? "Add a clear introduction of at least 40 characters."
        : "Set the number of places in Event details.";

  return [
    {
      label: "Event basics",
      ready: basicsReady,
      guidance: basicsGuidance,
      href: "/admin/events?view=edit",
    },
    {
      label: "Place and joining details",
      ready: (!requiresVenue || hasVenue) && (!requiresOnlineLink || input.onlineLinkReady),
      guidance: requiresVenue && !hasVenue
        ? "Add the exact venue address or map link so guests can find it."
        : "Add the private online joining link in Event details, not in public arrival notes.",
      href: "/admin/events?view=edit",
    },
    {
      label: "Free place with private review",
      ready: event.registration_mode === "manual_review" && hasFreeTicket,
      guidance: event.registration_mode !== "manual_review"
        ? "Choose Manual review in Event details. Publishing with registration closed will not accept requests."
        : "Set a free ticket to On sale with available places and sale dates that include today. Keep automatic payments closed.",
      href: event.registration_mode !== "manual_review"
        ? "/admin/events?view=edit"
        : "/admin/events?view=registrations",
    },
    {
      label: "Places remaining",
      ready: Boolean(event.capacity && event.capacity > reservedSeats),
      guidance: "This event has reached its capacity. Review existing places before opening another request.",
      href: "/admin/events?view=registrations",
    },
    {
      label: "Event Host",
      ready: input.hostActive,
      guidance: "Assign an active member to prepare the event without giving them payment or guest-list access.",
      href: "/admin/events?view=host",
    },
    {
      label: "Host content reviewed",
      ready: input.hostDraftStatus === "approved",
      guidance: input.hostDraftStatus === "submitted"
        ? "Review the Host's words, programme and image; publish or ask for changes."
        : "Ask the Host to send a complete draft, then review it before publication.",
      href: "/admin/events?view=host",
    },
    {
      label: "On-the-day safety contact",
      ready: input.hasSafetyContact,
      guidance: "Name a reachable safety contact before guests can see the event.",
      href: "/admin/events?view=host",
    },
    {
      label: "Guest arrival lead",
      ready: input.doorStaffActive,
      guidance: "Assign an active team account under Operations → Event work → Staff access, then rehearse guest arrival.",
      href: "/admin/operations?area=event-work#event-work",
    },
  ];
}
