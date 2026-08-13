import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, type AdminRole } from "@/components/admin/admin-header";
import {
  EventCommandCentre,
  type EventLifecycleState,
} from "@/components/admin/event-command-centre";
import { EventManager, type AdminEvent } from "@/components/admin/event-manager";
import {
  RegistrationManager,
  type AdminPaymentAttempt,
  type AdminRefund,
  type AdminRegistration,
  type AdminTicket,
} from "@/components/admin/registration-manager";
import {
  MemberEventProposalManager,
  type MemberEventProposalAdmin,
} from "@/components/admin/member-event-proposal-manager";
import {
  CommunityEventProposalManager,
  type CommunityEventProposalAdmin,
} from "@/components/admin/community-event-proposal-manager";
import {
  EventCheckinConsole,
  type CheckinAttendee,
} from "@/components/admin/event-checkin-console";
import {
  MemberEventArchiveManager,
  type EventMediaSubmissionAdmin,
  type MemberEventArchiveAdmin,
} from "@/components/admin/member-event-archive-manager";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationProposalMedia } from "@/lib/application-proposal-media";

type ManagedEventRow = Omit<AdminEvent, "id" | "venues"> & {
  address_line: string | null;
  city: string | null;
  country: string | null;
  event_id: string;
  map_url: string | null;
  online_url: string | null;
  venue_name: string | null;
};

type EventView = "arrival" | "edit" | "overview" | "proposals" | "registrations" | "stories";

const views: { href: EventView; label: string }[] = [
  { href: "overview", label: "Overview" },
  { href: "proposals", label: "Proposals" },
  { href: "edit", label: "Event details" },
  { href: "registrations", label: "Registrations" },
  { href: "arrival", label: "Guest arrival" },
  { href: "stories", label: "Stories & media" },
];

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view: requestedView } = await searchParams;
  let view = views.some((item) => item.href === requestedView)
    ? requestedView as EventView
    : "overview";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["super_admin", "event_staff"]);
  const assignedRoles = new Set((roleRows ?? []).map((item) => item.role));
  const role: AdminRole | null = assignedRoles.has("super_admin")
    ? "super_admin"
    : assignedRoles.has("event_staff")
      ? "event_staff"
      : null;
  if (!role) redirect("/admin");
  if (role !== "super_admin" && ["proposals", "stories"].includes(view)) {
    view = "overview";
  }

  const eventResult = await supabase.rpc("list_managed_events");
  const lifecycleResult = await supabase.rpc("list_event_lifecycle_admin");
  const managedRows = (eventResult.data as ManagedEventRow[] | null) ?? [];
  const events: AdminEvent[] = managedRows.map((event) => ({
    capacity: event.capacity,
    ends_at: event.ends_at,
    format: event.format,
    id: event.event_id,
    is_featured: event.is_featured,
    registration_mode: event.registration_mode,
    slug: event.slug,
    starts_at: event.starts_at,
    status: event.status,
    summary: event.summary,
    timezone: event.timezone,
    title: event.title,
    venues: event.venue_name && event.city && event.country ? {
      address_line: event.address_line,
      city: event.city,
      country: event.country,
      map_url: event.map_url,
      name: event.venue_name,
    } : null,
  }));
  const eventIds = events.map((event) => event.id);
  const registrationResults = await Promise.all(
    eventIds.map((eventId) => supabase.rpc("list_event_registrations", { p_event_id: eventId })),
  );
  const refundResults = await Promise.all(
    eventIds.map((eventId) => supabase.rpc("list_event_refund_requests", { p_event_id: eventId })),
  );
  const registrations = registrationResults.flatMap((result) =>
    (result.data as AdminRegistration[] | null) ?? [],
  );
  const refunds = refundResults.flatMap((result) =>
    (result.data as AdminRefund[] | null) ?? [],
  );

  let memberProposals: MemberEventProposalAdmin[] = [];
  let proposalMedia: ApplicationProposalMedia[] = [];
  let communityProposals: CommunityEventProposalAdmin[] = [];
  let proposalReady = true;
  if (role === "super_admin") {
    const [memberResult, contextResult, communityResult, proposalMediaResult] = await Promise.all([
      supabase.rpc("list_admin_member_event_proposals"),
      view === "proposals"
        ? supabase.rpc("list_member_event_proposal_communities")
        : Promise.resolve({ data: [], error: null }),
      supabase.rpc("list_admin_community_event_proposals"),
      supabase.rpc("list_admin_application_proposal_media"),
    ]);
    const contexts = (contextResult.data as {
      community_id: string | null;
      community_name: string | null;
      community_slug: string | null;
      community_type: string | null;
      proposal_id: string;
    }[] | null) ?? [];
    memberProposals = ((memberResult.data as MemberEventProposalAdmin[] | null) ?? []).map((proposal) => {
      const context = contexts.find((item) => item.proposal_id === proposal.proposal_id);
      return { ...proposal, community_id: context?.community_id ?? null, community_name: context?.community_name ?? null, community_slug: context?.community_slug ?? null, community_type: context?.community_type ?? null };
    });
    communityProposals = (communityResult.data as CommunityEventProposalAdmin[] | null) ?? [];
    proposalMedia = await Promise.all(
      (((proposalMediaResult.data as Omit<ApplicationProposalMedia, "image_url">[] | null) ?? [])
        .filter((item) => item.context_type === "member_event_proposal"))
        .map(async (item) => {
          const signed = await supabase.storage.from("proposal-media").createSignedUrl(item.storage_path, 3600);
          return { ...item, image_url: signed.data?.signedUrl ?? null };
        }),
    );
    proposalReady = !memberResult.error && !contextResult.error && !communityResult.error;
  }

  let tickets: AdminTicket[] = [];
  let payments: AdminPaymentAttempt[] = [];
  let registrationReady = registrationResults.every((result) => !result.error);
  if (view === "registrations" && eventIds.length) {
    const ticketResult = await supabase
      .from("ticket_types")
      .select("id,event_id,name,description,price_minor,currency,inventory_quantity,sales_start_at,sales_end_at,status,sort_order")
      .in("event_id", eventIds)
      .order("sort_order");
    tickets = (ticketResult.data as AdminTicket[] | null) ?? [];
    const orderIds = registrations.map((registration) => registration.order_id);
    const paymentResult = orderIds.length
      ? await supabase
          .from("payment_attempts")
          .select("order_id,provider,provider_reference,amount_minor,currency,status,created_at")
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    payments = (paymentResult.data as AdminPaymentAttempt[] | null) ?? [];
    registrationReady = registrationReady && !ticketResult.error && !paymentResult.error;
  }

  let checkinAttendees: CheckinAttendee[] = [];
  let checkinReady = true;
  if (view === "arrival") {
    const checkinResults = await Promise.all(
      eventIds.map((eventId) => supabase.rpc("list_event_checkins", { p_event_id: eventId })),
    );
    checkinAttendees = checkinResults.flatMap((result, index) =>
      ((result.data as Omit<CheckinAttendee, "event_id">[] | null) ?? []).map((attendee) => ({ ...attendee, event_id: eventIds[index] })),
    );
    checkinReady = checkinResults.every((result) => !result.error);
  }

  let archives: MemberEventArchiveAdmin[] = [];
  let media: EventMediaSubmissionAdmin[] = [];
  let storiesReady = true;
  if (view === "stories" && role === "super_admin") {
    const [archiveResult, mediaResult] = await Promise.all([
      supabase.rpc("list_admin_member_event_archives"),
      supabase.rpc("list_admin_event_media_submissions"),
    ]);
    archives = (archiveResult.data as MemberEventArchiveAdmin[] | null) ?? [];
    const rawMedia = (mediaResult.data as EventMediaSubmissionAdmin[] | null) ?? [];
    media = await Promise.all(rawMedia.map(async (item) => {
      const signed = await supabase.storage
        .from("event-media")
        .createSignedUrl(item.storage_path, 3600);
      return { ...item, image_url: signed.data?.signedUrl ?? null };
    }));
    storiesReady = !archiveResult.error && !mediaResult.error;
  }

  const proposalCount =
    memberProposals.filter((proposal) =>
      ["submitted", "under_review"].includes(proposal.status),
    ).length +
    communityProposals.filter((proposal) =>
      ["submitted", "under_review"].includes(proposal.status),
    ).length;

  return (
    <main className="admin-command-center event-command-page">
      <AdminHeader active="events" label="Event oversight" role={role} />
      <section className="oversight-subnav-shell">
        <nav className="oversight-subnav" aria-label="Event work">
          {views.filter((item) => role === "super_admin" || !["proposals", "stories"].includes(item.href)).map((item) => (
            <Link aria-current={view === item.href ? "page" : undefined} href={`/admin/events?view=${item.href}`} key={item.href}>{item.label}</Link>
          ))}
        </nav>
      </section>

      {view === "overview" ? <EventCommandCentre canControlLifecycle={role === "super_admin"} events={events} lifecycleReady={!lifecycleResult.error} lifecycleStates={(lifecycleResult.data as EventLifecycleState[] | null) ?? []} proposalCount={proposalCount} refunds={refunds} registrations={registrations} /> : null}
      {view === "proposals" && role === "super_admin" ? <section className="focused-admin-tool"><MemberEventProposalManager media={proposalMedia} migrationReady={proposalReady} proposals={memberProposals} /><div className="legacy-gathering-note"><strong>Community gathering history</strong><p>Free member-only gatherings are now owner-led. Earlier submissions remain visible here so Admin can understand the complete decision history.</p></div><CommunityEventProposalManager migrationReady={proposalReady} proposals={communityProposals} /></section> : null}
      {view === "edit" ? <section className="focused-admin-tool"><EventManager canCreate={role === "super_admin"} initialEvents={events} migrationReady={!eventResult.error} privateEvents={managedRows.map((event) => ({ event_id: event.event_id, online_url: event.online_url }))} /></section> : null}
      {view === "registrations" ? <section className="focused-admin-tool"><RegistrationManager events={events} initialPayments={payments} initialRefunds={refunds} initialRegistrations={registrations} initialTickets={tickets} migrationReady={registrationReady} paystackConfigured={Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SITE_URL)} /></section> : null}
      {view === "arrival" ? <section className="focused-admin-tool"><EventCheckinConsole events={events.map((event) => ({ id: event.id, title: event.title, starts_at: event.starts_at, ends_at: event.ends_at }))} initialAttendees={checkinAttendees} migrationReady={checkinReady} /></section> : null}
      {view === "stories" && role === "super_admin" ? <section className="focused-admin-tool"><MemberEventArchiveManager archives={archives} media={media} migrationReady={storiesReady} /></section> : null}
    </main>
  );
}
