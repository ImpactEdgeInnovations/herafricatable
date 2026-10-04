type CalendarEvent = {
  endsAt: string;
  eventId: string;
  location: string;
  slug: string;
  startsAt: string;
  summary: string | null;
  title: string;
};

function calendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function calendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function eventCalendarFile(event: CalendarEvent, origin: string) {
  const url = new URL(`/events/${encodeURIComponent(event.slug)}`, origin);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Her Africa Table//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.eventId}@herafricatable.com`,
    `DTSTAMP:${calendarDate(new Date().toISOString())}`,
    `DTSTART:${calendarDate(event.startsAt)}`,
    `DTEND:${calendarDate(event.endsAt)}`,
    `SUMMARY:${calendarText(event.title)}`,
    `DESCRIPTION:${calendarText(event.summary ?? "Her Africa Table event")}`,
    `LOCATION:${calendarText(event.location || "See event details")}`,
    `URL:${url.toString()}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
