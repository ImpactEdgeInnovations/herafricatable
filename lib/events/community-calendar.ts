/** Calendar dates are civil dates, never browser-local midnight timestamps. */
export function calendarDay(value: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(date);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}

export function shiftCalendarMonth(month: string, offset: number): string {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}

export function calendarMonthDays(month: string): string[] {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first.
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const cells = Math.ceil((offset + count) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => new Date(Date.UTC(year, number - 1, index - offset + 1)).toISOString().slice(0, 10));
}

export function eventsForCalendarDay<T extends { starts_at: string; ends_at: string }>(events: T[], day: string, timeZone: string): T[] {
  return events.filter(event => {
    const start = calendarDay(event.starts_at, timeZone);
    const endTime = new Date(event.ends_at).getTime();
    if (!start || !Number.isFinite(endTime) || endTime <= new Date(event.starts_at).getTime()) return false;
    // An event finishing at midnight does not occupy the following day.
    const end = calendarDay(new Date(endTime - 1).toISOString(), timeZone);
    return start <= day && end >= day;
  }).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}
