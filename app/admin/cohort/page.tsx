import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import {
  CohortActivationManager,
  type CohortEvent,
  type CohortHealthMember,
  type CohortOverview,
} from "@/components/admin/cohort-activation-manager";
import {
  CommunityReleaseGate,
  type CommunityReleaseCheck,
} from "@/components/admin/community-release-gate";
import type { CommunitySummary } from "@/components/member/community-directory";
import { createClient } from "@/lib/supabase/server";

type ManagedEvent = {
  event_id: string;
  starts_at: string;
  status: string;
  title: string;
};

export const dynamic = "force-dynamic";

export default async function AdminCohortPage({
  searchParams,
}: {
  searchParams: Promise<{ community?: string }>;
}) {
  const { community: requestedCommunity } = await searchParams;
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

  const [eventResult, overviewResult, communityResult] = await Promise.all([
    supabase.rpc("list_managed_events"),
    supabase.rpc("list_cohort_overview"),
    supabase.rpc("list_communities"),
  ]);
  const cohorts = (overviewResult.data as CohortOverview[] | null) ?? [];
  const communities =
    (communityResult.data as CommunitySummary[] | null) ?? [];
  const selectedCohortId = cohorts.some(
    (cohort) => cohort.community_id === requestedCommunity,
  )
    ? requestedCommunity!
    : (cohorts[0]?.community_id ?? null);
  const selectedReleaseId = communities.some(
    (community) => community.community_id === requestedCommunity,
  )
    ? requestedCommunity!
    : (selectedCohortId ?? communities[0]?.community_id ?? null);
  const healthResult = selectedCohortId
    ? await supabase.rpc("list_cohort_health", {
        p_community_id: selectedCohortId,
      })
    : { data: [], error: null };
  const releaseResult = selectedReleaseId
    ? await supabase.rpc("list_community_release_checks", {
        p_community_id: selectedReleaseId,
      })
    : { data: [], error: null };
  const events: CohortEvent[] = (
    (eventResult.data as ManagedEvent[] | null) ?? []
  ).map((event) => ({
    id: event.event_id,
    starts_at: event.starts_at,
    status: event.status,
    title: event.title,
  }));

  return (
    <main className="admin-command-center cohort-admin-page">
      <AdminHeader
        active="cohort"
        label="Founding cohort"
        role="super_admin"
      />
      <CohortActivationManager
        cohorts={cohorts}
        events={events}
        health={(healthResult.data as CohortHealthMember[] | null) ?? []}
        migrationReady={!overviewResult.error}
        selectedId={selectedCohortId}
      />
      {communities.length > 1 ? (
        <nav
          aria-label="Choose Community release checklist"
          className="community-release-community-picker"
        >
          <span>Release checklist</span>
          {communities.map((community) => (
            <Link
              aria-current={
                community.community_id === selectedReleaseId
                  ? "page"
                  : undefined
              }
              href={`/admin/cohort?community=${community.community_id}#community-release-title`}
              key={community.community_id}
            >
              {community.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <CommunityReleaseGate
        checks={
          (releaseResult.data as CommunityReleaseCheck[] | null) ?? []
        }
        communityId={selectedReleaseId}
        communityName={
          communities.find(
            (community) => community.community_id === selectedReleaseId,
          )?.name ?? null
        }
        migrationReady={!communityResult.error && !releaseResult.error}
      />
      <footer className="admin-footer">
        <span>Consent-based cohort operations</span>
        <Link href="/communities">View member communities</Link>
      </footer>
    </main>
  );
}
