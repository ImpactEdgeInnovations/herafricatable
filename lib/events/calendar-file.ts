type CalendarEvent = {
  endsAt: string;
  eventId: string;
  location: string;
  slug: string;
  startsAt: string;
  summary: string | null;
  title: string;
  detailsPath?: string;
};

function calendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function calendarText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function eventCalendarFile(event: CalendarEvent, origin: string) {
  const path = event.detailsPath?.startsWith("/") && !event.detailsPath.startsWith("//") ? event.detailsPath : `/events/${encodeURIComponent(event.slug)}`;
  const url = new URL(path, origin);
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
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Event reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function eventGoogleCalendarUrl(event: CalendarEvent, origin: string) {
  const url = new URL("https://calendar.google.com/calendar/r/eventedit");
  const path = event.detailsPath?.startsWith("/") && !event.detailsPath.startsWith("//") ? event.detailsPath : `/events/${encodeURIComponent(event.slug)}`;
  url.search = new URLSearchParams({ action: "TEMPLATE", text: event.title, dates: `${calendarDate(event.startsAt)}/${calendarDate(event.endsAt)}`, details: `${event.summary ?? ""}\n${new URL(path,origin)}`, location: event.location || "See event details" }).toString();
  return url.toString();
}
