import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import {
  PrivacyOperations,
  type AdminPrivacyRequest,
} from "@/components/admin/privacy-operations";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPrivacyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) redirect("/admin");

  const result = await supabase.rpc("list_admin_privacy_requests");
  return (
    <main className="admin-command-center">
      <AdminHeader
        active="privacy"
        label="Privacy requests"
        role="super_admin"
      />
      {result.error ? (
        <section className="admin-empty network-error" role="alert">
          <strong>Privacy requests are temporarily unavailable</strong>
          <p>
            No account request has been changed. Reload in a moment or check
            platform health from All tools.
          </p>
          <a className="button button-outline" href="/admin/privacy">
            Try again
          </a>
        </section>
      ) : (
        <PrivacyOperations
          requests={(result.data as AdminPrivacyRequest[] | null) ?? []}
        />
      )}
    </main>
  );
}
