import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import {
  TableInvitationManager,
  type AdminTableInvitation,
} from "@/components/admin/table-invitation-manager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminInvitationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) redirect("/admin");

  const result = await supabase.rpc("list_admin_table_invitations");

  return (
    <main className="admin-command-center">
      <AdminHeader
        active="invitations"
        label="Invitation review"
        role="super_admin"
      />
      {result.error ? (
        <section className="admin-empty network-error" role="alert">
          <strong>Invitation review is being prepared</strong>
          <p>Apply the latest invitation migration, then reload this page.</p>
        </section>
      ) : (
        <TableInvitationManager
          invitations={(result.data as AdminTableInvitation[] | null) ?? []}
        />
      )}
    </main>
  );
}
