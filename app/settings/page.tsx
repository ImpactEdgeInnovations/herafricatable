import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AccountSettings,
  type ConnectionPreference,
  type PrivacyRequest,
  type TableGuidePreference,
} from "@/components/member/account-settings";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [
    profileResult,
    requestResult,
    connectionPreferenceResult,
    tableGuidePreferenceResult,
  ] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("visibility_paused")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("privacy_requests")
        .select(
          "id,reference,request_type,reason,status,scheduled_for,reviewer_note,created_at",
        )
        .order("created_at", { ascending: false }),
      supabase.rpc("get_my_connection_preferences"),
      supabase.rpc("get_my_table_guide_access"),
    ]);

  return (
    <main className="settings-page">
      <MemberHeader
        accountHref="/settings"
        accountLabel="Account"
        active="account"
        label="Account settings"
      />
      {profileResult.error ||
      requestResult.error ||
      connectionPreferenceResult.error ? (
        <section className="admin-empty network-error">
          <strong>Account settings are temporarily unavailable</strong>
          <p>Please try again or contact support if the problem continues.</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/settings">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <AccountSettings
          connectionPreference={
            (
              connectionPreferenceResult.data as
                | ConnectionPreference[]
                | null
            )?.[0] ?? { request_mode: "open", updated_at: null }
          }
          tableGuidePreference={
            (
              tableGuidePreferenceResult.data as
                | TableGuidePreference[]
                | null
            )?.[0] ?? null
          }
          tableGuideReady={!tableGuidePreferenceResult.error}
          email={user.email ?? ""}
          visibilityPaused={Boolean(
            profileResult.data?.visibility_paused,
          )}
          requests={
            (requestResult.data as PrivacyRequest[] | null) ?? []
          }
        />
      )}
    </main>
  );
}
