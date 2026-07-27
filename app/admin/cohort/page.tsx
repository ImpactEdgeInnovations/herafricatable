import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CohortActivationManager,
  type CohortEvent,
  type CohortHealthMember,
  type CohortOverview,
} from "@/components/admin/cohort-activation-manager";
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

  const [eventResult, overviewResult] = await Promise.all([
    supabase.rpc("list_managed_events"),
    supabase.rpc("list_cohort_overview"),
  ]);
  const cohorts = (overviewResult.data as CohortOverview[] | null) ?? [];
  const selectedId = cohorts.some(
    (cohort) => cohort.community_id === requestedCommunity,
  )
    ? requestedCommunity!
    : (cohorts[0]?.community_id ?? null);
  const healthResult = selectedId
    ? await supabase.rpc("list_cohort_health", {
        p_community_id: selectedId,
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
      <header className="admin-header">
        <Link className="brand" href="/admin">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            Her Africa Table<small>Founding cohort</small>
          </span>
        </Link>
        <nav className="admin-primary-nav" aria-label="Admin navigation">
          <Link href="/admin">Today</Link>
          <Link href="/admin/members">Members</Link>
          <Link href="/admin/events">Events</Link>
          <Link aria-current="page" href="/admin/cohort">
            Cohort
          </Link>
          <Link href="/admin/safety">Safety</Link>
        </nav>
        <span className="admin-role">super admin</span>
      </header>
      <CohortActivationManager
        cohorts={cohorts}
        events={events}
        health={(healthResult.data as CohortHealthMember[] | null) ?? []}
        migrationReady={!overviewResult.error}
        selectedId={selectedId}
      />
      <footer className="admin-footer">
        <span>Consent-based cohort operations</span>
        <Link href="/communities">View member communities</Link>
      </footer>
    </main>
  );
}
