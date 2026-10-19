import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };

// Never accept a bucket/path/redirect from the caller, and never use a service key.
export async function GET(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  const unavailable = (status: number) => new Response(null, { status, headers });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) return unavailable(404);
  try {
    const supabase = await createClient();
    const access = await supabase.rpc("can_view_event", { p_event_id: eventId });
    if (access.error) return unavailable(503);
    if (access.data !== true) return unavailable(404);
    const [covers, posters] = await Promise.all([
      supabase.rpc("list_public_event_host_covers", { p_event_ids: [eventId] }),
      supabase.rpc("list_public_event_proposal_posters", { p_event_ids: [eventId] }),
    ]);
    const candidates = [
      ...(!covers.error ? covers.data ?? [] : []).map((row: { storage_path: string }) => ({ bucket: "event-host-covers", path: row.storage_path })),
      ...(!posters.error ? posters.data ?? [] : []).map((row: { storage_path: string }) => ({ bucket: "proposal-media", path: row.storage_path })),
    ];
    for (const candidate of candidates) {
      const signed = await supabase.storage.from(candidate.bucket).createSignedUrl(candidate.path, 3600);
      if (!signed.error && signed.data?.signedUrl) return new Response(null, { status: 307, headers: { ...headers, Location: signed.data.signedUrl } });
    }
    return unavailable(candidates.length || covers.error || posters.error ? 503 : 404);
  } catch { return unavailable(503); }
}
