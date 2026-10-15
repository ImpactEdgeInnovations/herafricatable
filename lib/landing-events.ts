import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/env";

export type LandingEvent = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  format: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venues: { name: string; city: string; country: string } | null;
  image: { url: string; alt: string } | null;
};
export type LandingEvents = { events: LandingEvent[]; unavailable: boolean };
type PublicRow = Omit<LandingEvent, "image"> & { status: string; audience: string };
type Cover = { event_id: string; storage_path: string; alt_text: string };

export async function loadLandingEvents(client: SupabaseClient, now = new Date()): Promise<LandingEvents> {
  try {
    const result = await client.from("events")
      .select("id,slug,title,summary,format,status,audience,starts_at,ends_at,timezone,venues(name,city,country)")
      .eq("status", "published").eq("audience", "public")
      .gte("ends_at", now.toISOString()).order("starts_at", { ascending: true }).limit(3);
    if (result.error || !Array.isArray(result.data)) return { events: [], unavailable: true };
    const rows = (result.data as unknown as PublicRow[]).filter(event =>
      event.status === "published" && event.audience === "public"
      && typeof event.id === "string" && Boolean(event.id)
      && typeof event.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(event.slug)
      && typeof event.title === "string" && event.title.trim()
      && Number.isFinite(Date.parse(event.starts_at)) && Date.parse(event.ends_at) >= now.getTime()
      && Date.parse(event.ends_at) > Date.parse(event.starts_at),
    ).slice(0, 3);
    if (!rows.length) return { events: [], unavailable: false };
    // These existing RPCs expose only approved public-event artwork. Never use
    // a member session or a server secret for a cached public landing page.
    const ids = rows.map(event => event.id);
    const readCovers = async (rpc: string): Promise<Cover[]> => {
      try {
        const { data, error } = await client.rpc(rpc, { p_event_ids: ids });
        return error || !Array.isArray(data) ? [] : (data as Cover[]).filter(item => ids.includes(item.event_id));
      } catch { return []; }
    };
    const [covers, posters] = await Promise.all([
      readCovers("list_public_event_host_covers"), readCovers("list_public_event_proposal_posters"),
    ]);
    const events = await Promise.all(rows.map(async row => {
      let image: LandingEvent["image"] = null;
      for (const [bucket, items] of [["event-host-covers", covers], ["proposal-media", posters]] as const) {
        const artwork = items.find(item => item.event_id === row.id);
        if (!artwork?.storage_path) continue;
        try {
          const { data, error } = await client.storage.from(bucket).createSignedUrl(artwork.storage_path, 3600);
          if (!error && data?.signedUrl) { image = { url: data.signedUrl, alt: artwork.alt_text || `${row.title} event poster` }; break; }
        } catch { /* Optional artwork must not hide the event. */ }
      }
      const { status: _status, audience: _audience, ...event } = row;
      return { ...event, image };
    }));
    return { events, unavailable: false };
  } catch { return { events: [], unavailable: true }; }
}

export async function getLandingEvents(): Promise<LandingEvents> {
  try {
    const { url, publishableKey } = getSupabasePublicEnv();
    const client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(4500), next: { revalidate: 60 } }) },
    });
    return await loadLandingEvents(client);
  } catch { return { events: [], unavailable: true }; }
}
