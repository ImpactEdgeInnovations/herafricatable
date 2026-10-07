import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanCommunityPhotos } from "@/lib/community-photo-cleanup";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Use the Admin photo controls." }, { status: 403 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { error } = await supabase.rpc("get_admin_community_photo_operations");
  if (error) return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
  try {
    const result = await cleanCommunityPhotos();
    return NextResponse.json(result, { status: result.failed ? 503 : 200 });
  } catch { return NextResponse.json({ error: "Cleanup could not run. Existing storage allowance is retained." }, { status: 503 }); }
}
