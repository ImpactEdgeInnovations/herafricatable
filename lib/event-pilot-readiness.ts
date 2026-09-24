export type PilotEvent = {
  capacity: number | null;
  ends_at: string;
  format: "in_person" | "virtual" | "hybrid";
  registration_mode: "automatic" | "manual_review" | "closed" | "waitlist";
  starts_at: string;
  status: "draft" | "published" | "suspended" | "cancelled" | "completed";
  summary: string | null;
  venues: { city: string; country: string; name: string } | null;
};

export type PilotTicket = {
  inventory_quantity: number | null;
  price_minor: number;
  status: string;
};

export type PilotReadinessInput = {
  event: PilotEvent;
  hasSafetyContact: boolean;
  hostActive: boolean;
  hostDraftStatus: string | null;
  onlineLinkReady: boolean;
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
  const hasVenue = Boolean(event.venues?.name?.trim() && event.venues?.city?.trim() && event.venues?.country?.trim());
  const hasFreeTicket = input.tickets.some((ticket) =>
    ticket.price_minor === 0 && ["draft", "on_sale"].includes(ticket.status) &&
    (ticket.inventory_quantity === null || ticket.inventory_quantity > 0));

  return [
    {
      label: "Event basics",
      ready: Boolean(event.summary && event.summary.trim().length >= 40 && event.capacity && event.capacity > 0 &&
        Number.isFinite(startsAt) && Number.isFinite(endsAt) &&
        startsAt > now.getTime() + (event.status === "draft" ? 48 * 60 * 60 * 1000 : 0) && endsAt > startsAt),
      guidance: "Add a clear introduction, a capacity and a future date at least two days away.",
      href: "/admin/events?view=edit",
    },
    {
      label: "Place and joining details",
      ready: (!requiresVenue || hasVenue) && (!requiresOnlineLink || input.onlineLinkReady),
      guidance: requiresVenue && !hasVenue
        ? "Add the venue and city."
        : "Add the private online joining link in Event details, not in public arrival notes.",
      href: "/admin/events?view=edit",
    },
    {
      label: "Free place with private review",
      ready: event.registration_mode === "manual_review" && hasFreeTicket,
      guidance: "Use Manual review and add a free ticket for the first pilot. Keep automatic payments closed.",
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
  ];
}
