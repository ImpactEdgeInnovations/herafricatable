// Presentation only. Database operations keep their own authoritative checks.
export function eventViewerMode(input: {
  creator: boolean;
  host: boolean;
  manager: boolean;
  previewRequested: boolean;
  checksReady: boolean;
  slug: string;
  eventId: string;
}) {
  const creator = input.checksReady && input.creator;
  const host = input.checksReady && input.host;
  const manager = input.checksReady && input.manager;
  const mayPreview = creator || host || manager;
  const memberPreview = mayPreview && input.previewRequested;
  const hostHref = `/events/${encodeURIComponent(input.slug)}/host`;
  const adminHref = `/admin/events?event=${encodeURIComponent(input.eventId)}&view=overview`;
  return {
    creator,
    host,
    manager,
    mayPreview,
    memberPreview,
    viewingAsHost: host && !memberPreview,
    viewingAsAdmin: manager && !host && !memberPreview,
    controlsHref: host ? hostHref : manager ? adminHref : null,
    identity: creator ? "You created this event." : host ? "You are hosting this event." : manager ? "You have Admin access to this event." : null,
    showBooking: input.checksReady && !memberPreview && !host && !manager,
  };
}
