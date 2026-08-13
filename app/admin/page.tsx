import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminActionCentre } from "@/components/admin/admin-action-centre";
import {
  AdminHeader,
  type AdminRole,
} from "@/components/admin/admin-header";
import { createClient } from "@/lib/supabase/server";

type MemberRow = {
  access_status: string;
  application_status?: string | null;
};

type EventRow = {
  event_id: string;
  status: string;
};

type ReportRow = {
  status: string;
};

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["super_admin", "event_staff", "moderator"])
    .limit(1)
    .maybeSingle();

  if (!roleRow) {
    return (
      <main className="portal-page">
        <section className="portal-card">
          <p className="eyebrow">Member account</p>
          <h1>This email opens the member space.</h1>
          <p>
            You are signed in successfully, but this email is not set up to
            manage the platform.
          </p>
          <div className="portal-actions">
            <Link className="button button-primary" href="/home">
              Continue as a member
            </Link>
            <Link className="button button-outline" href="/">
              Return home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const role = roleRow.role as AdminRole;
  const canManageEvents = role === "super_admin" || role === "event_staff";
  const canModerate = role === "super_admin" || role === "moderator";

  const [
    memberApplicationResult,
    eventResult,
    memberReports,
    marketplaceReports,
    communityReports,
  ] = await Promise.all([
    role === "super_admin"
      ? supabase.rpc("list_admin_members_v3")
      : Promise.resolve({ data: [], error: null }),
    canManageEvents
      ? supabase.rpc("list_managed_events")
      : Promise.resolve({ data: [], error: null }),
    canModerate
      ? supabase.rpc("list_member_reports")
      : Promise.resolve({ data: [], error: null }),
    canModerate
      ? supabase.rpc("list_marketplace_reports")
      : Promise.resolve({ data: [], error: null }),
    canModerate
      ? supabase.rpc("list_community_safety_reports")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const memberFallbackResult =
    role === "super_admin" && memberApplicationResult.error
      ? await supabase.rpc("list_admin_members_v2")
      : null;
  const memberResult = memberFallbackResult ?? memberApplicationResult;

  const members = (memberResult.data as MemberRow[] | null) ?? [];
  const events = (eventResult.data as EventRow[] | null) ?? [];
  const eventIds = events.map((event) => event.event_id);

  const [registrationResult, refundResult] =
    canManageEvents && eventIds.length
      ? await Promise.all([
          supabase
            .from("registration_requests")
            .select("id", { count: "exact", head: true })
            .in("event_id", eventIds)
            .eq("status", "pending_review"),
          supabase
            .from("refund_requests")
            .select("id,orders!inner(event_id)", { count: "exact", head: true })
            .in("orders.event_id", eventIds)
            .eq("status", "requested"),
        ])
      : [
          { count: 0, error: null },
          { count: 0, error: null },
        ];

  const communityReportsFallback = communityReports.error
    ? await supabase.rpc("list_community_reports")
    : null;
  const effectiveCommunityReports = communityReports.error
    ? communityReportsFallback
    : communityReports;
  const reports = [
    ...((memberReports.data as ReportRow[] | null) ?? []),
    ...((marketplaceReports.data as ReportRow[] | null) ?? []),
    ...((effectiveCommunityReports?.data as ReportRow[] | null) ?? []),
  ];
  const pendingMembers = members.filter(
    (member) =>
      member.access_status === "pending" &&
      ["submitted", "in_review"].includes(member.application_status ?? ""),
  ).length;
  const activeMembers = members.filter(
    (member) => member.access_status === "active",
  ).length;
  const draftEvents = events.filter((event) => event.status === "draft").length;
  const openReports = reports.filter((report) =>
    ["open", "reviewing"].includes(report.status),
  ).length;

  return (
    <main className="admin-command-center admin-cockpit">
      <AdminHeader active="today" label="Admin workspace" role={role} />

      <section className="admin-hero" id="overview">
        <div>
          <p className="eyebrow">Today at Her Africa Table</p>
          <h1>
            Today, at a glance.
          </h1>
          <p>
            Begin with anything waiting for your decision. Open All tools when
            you need to manage something in more detail.
          </p>
        </div>
        <div className="admin-metrics">
          {role === "super_admin" ? (
            <>
              <article>
                <strong>{members.length}</strong>
                <span>Member accounts</span>
              </article>
              <article>
                <strong>{activeMembers}</strong>
                <span>Active members</span>
              </article>
            </>
          ) : null}
          {canManageEvents ? (
            <>
              <article>
                <strong>{events.length}</strong>
                <span>Events</span>
              </article>
              <article>
                <strong>{draftEvents}</strong>
                <span>Draft events</span>
              </article>
            </>
          ) : null}
          {role === "moderator" ? (
            <article>
              <strong>{openReports}</strong>
              <span>Open safety reports</span>
            </article>
          ) : null}
        </div>
      </section>

      <AdminActionCentre
        draftEvents={draftEvents}
        hasEvents={events.length > 0}
        openReports={openReports}
        pendingMembers={pendingMembers}
        pendingRefunds={refundResult.count ?? 0}
        pendingRegistrations={registrationResult.count ?? 0}
        role={role}
      />

      <section className="admin-workspaces" aria-labelledby="workspaces-title">
        <header>
          <p className="eyebrow">Work areas</p>
          <h2 id="workspaces-title">Choose what you need to manage.</h2>
          <p>
            Each area opens with the controls and information needed for that
            job, while this page stays quick and calm.
          </p>
        </header>
        <div>
          {role === "super_admin" ? (
            <Link href="/admin/members">
              <small>People</small>
              <strong>Membership and access</strong>
              <span>Review applications and member readiness →</span>
            </Link>
          ) : null}
          {canManageEvents ? (
            <Link href="/admin/events">
              <small>Gatherings</small>
              <strong>Events and registrations</strong>
              <span>Plan, publish, take payment and check in →</span>
            </Link>
          ) : null}
          {canModerate ? (
            <Link href="/admin/safety">
              <small>Trust</small>
              <strong>Safety and member concerns</strong>
              <span>Help members and review private reports →</span>
            </Link>
          ) : null}
          {role === "super_admin" ? (
            <Link href="/admin/cohort">
              <small>Founding members</small>
              <strong>Activate the Nairobi community</strong>
              <span>Invite members and see who may need help →</span>
            </Link>
          ) : null}
          {role === "super_admin" ? (
            <Link href="/admin/programs">
              <small>Member value</small>
              <strong>Programmes and benefits</strong>
              <span>Manage optional post-launch experiences →</span>
            </Link>
          ) : null}
          <Link href="/admin/release">
            <small>Launch control</small>
            <strong>Readiness and public countdown</strong>
            <span>Review delivery and update the next-event timer →</span>
          </Link>
        </div>
      </section>

      <footer className="admin-footer">
        <span>Her Africa Table · Production workspace</span>
        <Link href="/">View public site</Link>
      </footer>
    </main>
  );
}
