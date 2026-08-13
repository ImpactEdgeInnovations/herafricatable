import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/worker";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  }

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) {
    return NextResponse.json(
      { error: "Super Admin access is required." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    dedupeKey?: unknown;
  } | null;
  const requestedKey =
    typeof body?.dedupeKey === "string" ? body.dedupeKey.trim() : "";
  const dedupeKey = /^(?:referral-invite|table-invitation|member-approved):[0-9a-f-]{36}$/i.test(
    requestedKey,
  )
    ? requestedKey
    : undefined;

  return processNotificationQueue({ dedupeKey });
}
