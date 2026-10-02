export function eventToolHref(href: string, eventId: string): string {
  if (!href.startsWith("/admin/events?")) return href;
  const [route, hash] = href.split("#", 2);
  const joiner = route.includes("?") ? "&" : "?";
  return `${route}${joiner}event=${encodeURIComponent(eventId)}${hash ? `#${hash}` : ""}`;
}
