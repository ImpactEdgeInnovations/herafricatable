/** Accept individual video links only; never embed arbitrary user-supplied HTML. */
export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
    else if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
      const parts = url.pathname.split("/");
      id = url.pathname === "/watch" ? url.searchParams.get("v")
        : ["live", "embed", "shorts"].includes(parts[1]) ? parts[2] ?? null : null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
