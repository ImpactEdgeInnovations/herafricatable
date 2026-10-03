const internalOrigin = "https://herafricatable.invalid";

export function safeInternalDestination(
  value: string | null | undefined,
  { allowAdmin = false }: { allowAdmin?: boolean } = {},
): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return null;
  const path = value.split(/[?#]/, 1)[0];
  if (/%(?:2f|5c|25)/i.test(path)) return null;

  try {
    const destination = new URL(value, internalOrigin);
    if (destination.origin !== internalOrigin) return null;
    if (!allowAdmin &&
      (destination.pathname === "/admin" || destination.pathname.startsWith("/admin/"))) {
      return null;
    }
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return null;
  }
}
