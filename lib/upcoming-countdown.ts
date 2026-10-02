export type CountdownEvent = {
  city: string;
  event_name: string;
  slug?: string;
  starts_at: string;
};

export function upcomingCountdown(
  event: CountdownEvent | null | undefined,
  now = Date.now(),
): CountdownEvent | null {
  if (!event?.event_name?.trim() || !event.city?.trim()) return null;
  const startsAt = Date.parse(event.starts_at);
  return Number.isFinite(startsAt) && startsAt > now ? event : null;
}
