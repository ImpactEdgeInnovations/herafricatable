import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processNotificationQueue } from "@/lib/notifications/worker";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.invitationId === "string" ? body.invitationId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Choose an invitation." }, { status: 400 });
  }
  const { data, error } = await supabase.from("table_invitations")
    .select("id,status").eq("id", id).eq("inviter_id", user.id).maybeSingle();
  if (error || !data || data.status !== "sent") {
    return NextResponse.json({ error: "This invitation is not ready to send." }, { status: 403 });
  }
  return processNotificationQueue({ dedupeKey: `table-invitation:${id}`, strictTarget: true });
}
