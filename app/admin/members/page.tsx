import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import {
  MemberCommandCentre,
  type PilotMemberInvite,
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

  const [memberApplicationResult, intakeResult, pilotWindowResult, pilotInvitesResult, pilotEventResult, pilotFreeEventResult, communityPilotResult] = await Promise.all([
    supabase.rpc("list_admin_members_v3"),
    supabase.rpc("get_membership_intake_admin"),
    supabase.rpc("get_membership_pilot_window"),
    supabase.from("beta_invites")
      .select("id,email,status,expires_at,created_at")
      .eq("source", "admin_pilot")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("get_invited_pilot_event_setting"),
    supabase.rpc("get_pilot_free_event_setting"),
    supabase.rpc("get_community_pilot_admin"),
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
        communityPilot={communityPilotResult.error ? null : ((communityPilotResult.data as { enabled: boolean; cohort_count: number; capacity: number; ends_at: string | null }[] | null) ?? [])[0] ?? null}
        applicationJourneyReady={!memberApplicationResult.error}
        currentUserId={user.id}
        intake={
          ((intakeResult.data as MembershipIntakeAdmin[] | null) ?? [])[0] ?? null
        }
        intakeReady={!intakeResult.error}
        pilotEndsAt={pilotWindowResult.error ? null : pilotWindowResult.data as string | null}
        pilotInvitations={(pilotInvitesResult.data as PilotMemberInvite[] | null) ?? []}
        pilotReady={!pilotWindowResult.error && !pilotInvitesResult.error}
        pilotEventAutoDrafts={pilotEventResult.error ? null : pilotEventResult.data as boolean}
        pilotFreeEventPublishing={pilotFreeEventResult.error ? null : pilotFreeEventResult.data as boolean}
        members={testFlagsReady ? members : []}
        migrationReady={!memberResult.error && testFlagsReady}
      />
    </main>
  );
}
