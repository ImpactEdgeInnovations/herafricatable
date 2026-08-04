import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/worker";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
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

  return processNotificationQueue();
}
