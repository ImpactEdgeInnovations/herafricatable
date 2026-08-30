import { redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import {
  TableGuide,
  type TableGuideAccess,
  type TableGuideConnection,
} from "@/components/member/table-guide";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TableGuidePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [profileResult, accessResult, connectionPreferenceResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,access_status")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.rpc("get_my_table_guide_access"),
      supabase.rpc("get_my_connection_preferences"),
    ]);

  const profile = profileResult.data;
  if (!profile) redirect("/continue");
  if (profile.access_status === "pending") redirect("/apply");
  if (!["onboarding", "active"].includes(profile.access_status)) redirect("/home");

  const access =
    ((accessResult.data as TableGuideAccess[] | null) ?? [])[0] ?? null;
  const connectionMode =
    (
      connectionPreferenceResult.data as
        | { request_mode: "curated_only" | "open" | "paused" }[]
        | null
    )?.[0]?.request_mode ?? "paused";
  const connectionResult =
    profile.access_status === "active" &&
    access?.feature_enabled &&
    access.assistant_enabled
      ? await supabase.rpc("list_table_guide_connections", { p_limit: 6 })
      : { data: [], error: null };

  return (
    <main className="table-guide-page">
      <MemberHeader active="guide" label="Table Guide" />
      <TableGuide
        access={access}
        connectionMode={connectionMode}
        connections={
          (connectionResult.data as TableGuideConnection[] | null) ?? []
        }
        firstName={profile.display_name?.trim().split(/\s+/)[0] || "Member"}
        profileStatus={profile.access_status}
      />
    </main>
  );
}
