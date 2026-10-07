import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new Response(null, { status: 404, headers });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401, headers });
  const report = new URL(request.url).searchParams.get("report");
  if (report && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(report)) return new Response(null, { status: 404, headers });
  const permission = () => report ? supabase.rpc("get_community_reported_photo_file", { p_report_id: report, p_photo_id: id }) : supabase.rpc("get_community_photo_file", { p_photo_id: id });
  const { data: path, error } = await permission();
  if (error || typeof path !== "string") return new Response(null, { status: 404, headers });
  const variant = new URL(request.url).searchParams.get("size") === "original" ? "original" : "thumbnail";
  const { data, error: fileError } = await createAdminClient().storage.from("community-photos").download(`${path}/${variant}.webp`);
  if (fileError || !data) return new Response(null, { status: 404, headers });
  const { data: currentPath, error: recheckError } = await permission();
  if (recheckError || currentPath !== path) return new Response(null, { status: 404, headers });
  return new Response(new Uint8Array(await data.arrayBuffer()), { headers: { ...headers, "Content-Type": "image/webp" } });
}
