export type GuideEventContext = {
  ends_at: string;
  format: string;
  programme: { description: string | null; starts_at: string; title: string }[];
  registration_mode: string;
  slug: string;
  starts_at: string;
  status: string;
  summary: string | null;
  timezone: string;
  title: string;
  venue: { city: string; country: string; name: string } | null;
};

export type UpcomingGuideEvent = {
  title?: string | null;
};

function eventDate(startsAt: string, timeZone: string) {
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return "a time to be confirmed";
  try {
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "full", timeStyle: "short", timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-KE", {
      dateStyle: "full", timeStyle: "short", timeZone: "Africa/Nairobi",
    }).format(date);
  }
}

export function eventFallbackAnswer({ firstName, currentEvent, upcomingEvents,
  requestedEventSlug }: {
  firstName?: string;
  currentEvent: GuideEventContext | null;
  upcomingEvents: UpcomingGuideEvent[];
  requestedEventSlug: string | null;
}) {
  const hello = firstName ? `${firstName}, ` : "";
  if (currentEvent) {
    const event = currentEvent;
    const place = event.venue
      ? `${event.venue.name}, ${event.venue.city}`
      : "online; confirmed guests receive joining details privately";
    const programme = event.programme.length
      ? `The published programme includes ${event.programme.slice(0, 3).map((item) => item.title).join(", ")}.`
      : "The programme has not been published here yet.";
    const timing = event.status === "completed" ? "was held" : "is scheduled";
    const placeRequest = event.status === "completed"
      ? "This event has ended."
      : event.registration_mode === "manual_review"
        ? "You may request a place on this page; the event team reviews each request."
        : event.registration_mode === "waitlist"
          ? "You may join the waitlist on this page."
          : event.registration_mode === "closed"
            ? "Registration is closed."
            : "Open this page to see whether places are available.";
    return `${hello}${event.title} ${timing} for ${eventDate(event.starts_at, event.timezone)} at ${place}. ${programme} ${placeRequest} I cannot see your private seat, pass or joining link.`;
  }
  if (requestedEventSlug)
    return `${hello}I cannot see published details for that event link. It may be private, unpublished or unavailable. Open Events to see the gatherings available to you. I cannot see a private seat, pass or joining link.`;
  const events = upcomingEvents.filter((event) => event.title).slice(0, 3);
  return events.length
    ? `${hello}these are the next events I can see for you: ${events.map((event) => event.title).join(", ")}. Open Events to see the date, place and request a seat without leaving the event page.`
    : `${hello}there are no published upcoming events in your view right now. You can still open Events to review past gatherings or propose an open event. Member events are free at launch and become public only after Admin approval.`;
}
