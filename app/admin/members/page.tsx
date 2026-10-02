import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import {
  MemberCommandCentre,
} from "@/components/admin/member-command-centre";
import type { AdminMember } from "@/components/admin/member-review";
import type { MembershipIntakeAdmin } from "@/components/admin/membership-intake-control";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
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

  const [memberApplicationResult, intakeResult] = await Promise.all([
    supabase.rpc("list_admin_members_v3"),
    supabase.rpc("get_membership_intake_admin"),
  ]);
  const fallbackResult = memberApplicationResult.error
    ? await supabase.rpc("list_admin_members_v2")
    : null;
  const memberResult = fallbackResult ?? memberApplicationResult;
  const memberRows = (memberResult.data as AdminMember[] | null) ?? [];
  const memberIds = [...new Set(memberRows.map((member) => member.user_id))];
  const testFlagsResult = memberIds.length
    ? await supabase.from("profiles").select("id,is_test_account").in("id", memberIds)
    : { data: [], error: null };
  const testFlagsReady = !testFlagsResult.error && testFlagsResult.data?.length === memberIds.length;
  const testFlagById = new Map((testFlagsResult.data ?? [])
    .map((profile) => [profile.id, profile.is_test_account === true] as const));
  const members = memberRows.map((member) => ({
    ...member,
    is_test_account: testFlagById.get(member.user_id) === true,
  }));

  return (
    <main className="admin-command-center member-command-page">
      <AdminHeader active="members" label="Member oversight" role="super_admin" />
      <MemberCommandCentre
        applicationJourneyReady={!memberApplicationResult.error}
        currentUserId={user.id}
        intake={
          ((intakeResult.data as MembershipIntakeAdmin[] | null) ?? [])[0] ?? null
        }
        intakeReady={!intakeResult.error}
        members={testFlagsReady ? members : []}
        migrationReady={!memberResult.error && testFlagsReady}
      />
    </main>
  );
}
