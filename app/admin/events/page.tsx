import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminHeader, type AdminRole } from "@/components/admin/admin-header";
import {
  EventCommandCentre,
  type EventLifecycleState,
  type EventWorkCounts,
} from "@/components/admin/event-command-centre";
import { EventManager, type AdminEvent } from "@/components/admin/event-manager";
import {
  RegistrationManager,
  type AdminPaymentAttempt,
  type AdminRefund,
  type AdminRegistration,
  type AdminTicket,
  type AdminWaitlistEntry,
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
import { EventDoorStaffControl, type DoorStaff } from "@/components/admin/event-door-staff-control";
import {
  MemberEventArchiveManager,
  type EventMediaSubmissionAdmin,
  type MemberEventArchiveAdmin,
} from "@/components/admin/member-event-archive-manager";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationProposalMedia } from "@/lib/application-proposal-media";
import { EventGuestAccessControl } from "@/components/admin/event-guest-access-control";
import { EventAutomaticCheckoutControl } from "@/components/admin/event-automatic-checkout-control";
import { EventFreeBookingControl } from "@/components/events/event-free-booking-control";
import { EventHostReviewManager, type AdminEventHostCover, type AdminEventHostWorkspace, type EventHostReviewContext } from "@/components/admin/event-host-review-manager";
import { EventFollowUpInvitations, type EventFollowUpCandidate } from "@/components/admin/event-follow-up-invitations";
import { eventPilotReadiness, type PilotOrder, type PilotReadinessStep } from "@/lib/event-pilot-readiness";

type ManagedEventRow = Omit<AdminEvent, "id" | "venues"> & {
  address_line: string | null;
  city: string | null;
  country: string | null;
  event_id: string;
  map_url: string | null;
  online_url: string | null;
  venue_name: string | null;
};

type EventView = "arrival" | "edit" | "follow-up" | "host" | "overview" | "proposals" | "registrations" | "stories";

const views: { href: EventView; label: string }[] = [
  { href: "overview", label: "Overview" },
  { href: "proposals", label: "Proposals" },
  { href: "host", label: "Host drafts" },
  { href: "edit", label: "Event details" },
  { href: "registrations", label: "Registrations" },
  { href: "arrival", label: "Guest arrival" },
  { href: "stories", label: "Stories & media" },
  { href: "follow-up", label: "After-event invites" },
];

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; event?: string }>;
}) {
  const { view: requestedView, event: requestedEventId } = await searchParams;
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
  if (role !== "super_admin" && ["proposals", "host", "stories", "follow-up"].includes(view)) {
    view = "overview";
  }

  const guestAccessResult = role === "super_admin" && view === "overview"
    ? await supabase.from("feature_flags").select("enabled")
        .eq("key", "event_guest_access").maybeSingle()
    : { data: null, error: null };
  const guestSafetyResults = role === "super_admin" && view === "overview"
    ? await Promise.all([
        supabase.rpc("event_registration_notification_ready"),
        supabase.rpc("event_single_seat_guard_ready"),
        supabase.rpc("event_capacity_guard_ready"),
        supabase.rpc("event_registration_end_guard_ready"),
      ])
    : null;
  const guestSafetyChecks = [
    { label: "registration emails", ready: guestSafetyResults?.[0].data === true && !guestSafetyResults[0].error },
    { label: "one place per guest", ready: guestSafetyResults?.[1].data === true && !guestSafetyResults[1].error },
    { label: "event capacity protection", ready: guestSafetyResults?.[2].data === true && !guestSafetyResults[2].error },
    { label: "registration closes after the event", ready: guestSafetyResults?.[3].data === true && !guestSafetyResults[3].error },
  ];
  const automaticCheckoutResult = ["overview", "edit"].includes(view)
    ? await supabase.from("feature_flags").select("enabled")
        .eq("key", "event_automatic_checkout").maybeSingle()
    : { data: null, error: null };
  const automaticCheckoutGuardResult = ["overview", "edit"].includes(view)
    ? await supabase.rpc("event_automatic_checkout_guard_ready")
    : { data: false, error: null };
  const automaticCheckoutOpen = automaticCheckoutResult.data?.enabled === true;
  const automaticCheckoutReady = Boolean(automaticCheckoutResult.data)
    && !automaticCheckoutResult.error
    && !automaticCheckoutGuardResult.error
    && automaticCheckoutGuardResult.data === true;

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
  const selectedEventId = requestedEventId && eventIds.includes(requestedEventId) ? requestedEventId : null;
  const freeBookingEvent = role === "super_admin" && view === "overview" && (selectedEventId ?? eventIds[0])
    ? await supabase.from("events").select("id,free_instant_booking,registration_mode,status,title")
        .eq("id", selectedEventId ?? eventIds[0]).maybeSingle()
    : { data: null, error: null };
  // Only selected work areas load guest records. Overview uses an aggregate RPC.
  const detailEventIds = view === "registrations" || view === "arrival"
    ? [selectedEventId ?? eventIds[0]].filter((id): id is string => Boolean(id))
    : [];
  const publicationSources = view === "edit" && eventIds.length
    ? await Promise.all([
        supabase.from("event_hosts").select("event_id").in("event_id", eventIds),
        supabase.from("event_safety_contacts").select("event_id,contact_name,contact_phone").in("event_id", eventIds),
      ])
    : null;
  const hostedEventIds = publicationSources?.[0].error
    ? eventIds : (publicationSources?.[0].data ?? []).map((row) => row.event_id);
  const publicationSafetyContacts = publicationSources?.[1].error
    ? [] : publicationSources?.[1].data ?? [];
  const publicationGuardResult = view === "edit"
    ? await supabase.rpc("event_publication_sequence_ready")
    : { data: false, error: null };
  const arrivalGuardResult = view === "edit"
    ? await supabase.rpc("event_arrival_details_guard_ready")
    : { data: false, error: null };
  const publicationGuardReady = !publicationGuardResult.error && publicationGuardResult.data === true
    && !arrivalGuardResult.error && arrivalGuardResult.data === true;
  const pilotSources = role === "super_admin" && view === "overview" && eventIds.length
    ? await Promise.all([
        supabase.from("ticket_types").select("id,event_id,inventory_quantity,price_minor,sales_start_at,sales_end_at,status").in("event_id", eventIds),
        supabase.from("event_hosts").select("event_id,user_id,status").in("event_id", eventIds),
        supabase.from("event_host_workspaces").select("event_id,status").in("event_id", eventIds),
        supabase.from("event_safety_contacts").select("event_id").in("event_id", eventIds),
        supabase.from("event_staff_scopes").select("event_id,user_id").in("event_id", eventIds),
        supabase.from("orders").select("event_id,status,order_items(ticket_type_id,quantity)", { count: "exact" })
          .in("event_id", eventIds).eq("order_type", "event").range(0, 999),
      ])
    : null;
  const pilotDoorStaff = role === "super_admin" && view === "overview" && eventIds.length
    ? await supabase.from("event_door_staff").select("event_id,user_id").in("event_id", eventIds)
    : { data: [], error: null };
  const scopedStaffIds = [...new Set((pilotSources?.[4].data ?? []).map((row) => row.user_id))];
  const doorStaffIds = [...new Set((pilotDoorStaff.data ?? []).map((row) => row.user_id))];
  const hostIds = (pilotSources?.[1].data ?? []).map((row) => row.user_id);
  const pilotAccountIds = [...new Set([...scopedStaffIds, ...doorStaffIds, ...hostIds])];
  let activeProfileIds = new Set<string>();
  let staffRoleIds = new Set<string>();
  let pilotAccountError = false;
  if (pilotAccountIds.length) {
    const [profilesResult, rolesResult] = await Promise.all([
      supabase.from("profiles").select("id,access_status").in("id", pilotAccountIds),
      scopedStaffIds.length
        ? supabase.from("user_roles").select("user_id,role,expires_at")
            .in("user_id", scopedStaffIds).eq("role", "event_staff")
        : Promise.resolve({ data: [], error: null }),
    ]);
    pilotAccountError = Boolean(profilesResult.error || rolesResult.error);
    activeProfileIds = new Set((profilesResult.data ?? [])
      .filter((row) => row.access_status === "active").map((row) => row.id));
    staffRoleIds = new Set((rolesResult.data ?? [])
      .filter((row) => !row.expires_at || Date.parse(row.expires_at) > Date.now())
      .map((row) => row.user_id));
  }
  const pilotReadiness: Record<string, PilotReadinessStep[]> | null = pilotSources
    && pilotSources.every((result) => !result.error)
    && pilotSources[5].count === (pilotSources[5].data?.length ?? 0)
    && !pilotAccountError
    ? Object.fromEntries(events.map((event) => {
        const [tickets, hosts, drafts, contacts, staffScopes, orders] = pilotSources;
        const privateEvent = managedRows.find((row) => row.event_id === event.id);
        return [event.id, eventPilotReadiness({
          doorStaffActive: (staffScopes.data ?? []).some((row) => row.event_id === event.id
            && activeProfileIds.has(row.user_id) && staffRoleIds.has(row.user_id))
            || (pilotDoorStaff.data ?? []).some((row) => row.event_id === event.id
              && activeProfileIds.has(row.user_id)),
          event,
          hasSafetyContact: (contacts.data ?? []).some((row) => row.event_id === event.id),
          hostActive: (hosts.data ?? []).some((row) => row.event_id === event.id && row.status === "active"
            && activeProfileIds.has(row.user_id)),
          hostDraftStatus: (drafts.data ?? []).find((row) => row.event_id === event.id)?.status ?? null,
          onlineLinkReady: Boolean(privateEvent?.online_url?.trim()),
          orders: ((orders.data as PilotOrder[] | null) ?? []).filter((row) => row.event_id === event.id),
          tickets: (tickets.data ?? []).filter((row) => row.event_id === event.id),
        })];
      }))
    : null;
  const hostResult = role === "super_admin" && view === "host"
    ? await supabase.rpc("list_admin_event_host_workspaces")
    : { data: [], error: null };
  const hostLifecycleResult = role === "super_admin" && view === "host"
    ? await supabase.rpc("event_host_lifecycle_ready")
    : { data: false, error: null };
  const safetyReadyResult = role === "super_admin" && view === "host"
    ? await supabase.rpc("event_safety_contact_ready")
    : { data: false, error: null };
  const safetyContactResult = role === "super_admin" && view === "host" && safetyReadyResult.data === true
    ? await supabase.from("event_safety_contacts").select("event_id,contact_name,contact_phone")
    : { data: [], error: null };
  const hostWorkspaces = (hostResult.data as AdminEventHostWorkspace[] | null) ?? [];
  const hostTicketResult = role === "super_admin" && view === "host" && eventIds.length
    ? await supabase.from("ticket_types")
        .select("event_id,status", { count: "exact" })
        .in("event_id", eventIds)
        .in("status", ["draft", "on_sale"])
        .range(0, 999)
    : { data: [], error: null, count: 0 };
  const hostTicketsReady = !hostTicketResult.error &&
    hostTicketResult.count === (hostTicketResult.data?.length ?? 0);
  const hostTicketEventIds = [...new Set((hostTicketResult.data ?? []).map((ticket) => ticket.event_id))];
  const hostCoverResult = role === "super_admin" && view === "host"
    ? await supabase.from("event_host_covers")
        .select("event_id,draft_storage_path,draft_alt_text,published_storage_path")
    : { data: [], error: null };
  const hostCovers: AdminEventHostCover[] = await Promise.all(
    (((hostCoverResult.data as { event_id: string; draft_storage_path: string; draft_alt_text: string; published_storage_path: string | null }[] | null) ?? []))
      .map(async (cover) => {
        const signed = await supabase.storage.from("event-host-covers").createSignedUrl(cover.draft_storage_path, 3600);
        return { event_id: cover.event_id, draft_alt_text: cover.draft_alt_text,
          draft_url: signed.data?.signedUrl ?? null,
          published: cover.draft_storage_path === cover.published_storage_path };
      }),
  );
  const workCountsResult = view === "overview"
    ? await supabase.rpc("list_event_work_counts")
    : { data: [], error: null };
  const workCounts = (workCountsResult.data as EventWorkCounts[] | null) ?? [];
  const registrationResults = await Promise.all(
    (view === "registrations" ? detailEventIds : [])
      .map((eventId) => supabase.rpc("list_event_registrations", { p_event_id: eventId })),
  );
  const refundResults = await Promise.all(
    (view === "registrations" ? detailEventIds : [])
      .map((eventId) => supabase.rpc("list_event_refund_requests", { p_event_id: eventId })),
  );
  const registrations = registrationResults.flatMap((result) =>
    (result.data as AdminRegistration[] | null) ?? [],
  );
  const waitlistResults = view === "registrations"
    ? await Promise.all(detailEventIds.map((eventId) =>
        supabase.rpc("list_event_waitlist", { p_event_id: eventId })))
    : [];
  const waitlist = waitlistResults.flatMap((result) =>
    (result.data as AdminWaitlistEntry[] | null) ?? [],
  );
  const waitlistReady = waitlistResults.every((result) => !result.error);
  const refunds = refundResults.flatMap((result) =>
    (result.data as AdminRefund[] | null) ?? [],
  );

  let memberProposals: MemberEventProposalAdmin[] = [];
  let proposalMedia: ApplicationProposalMedia[] = [];
  let communityProposals: CommunityEventProposalAdmin[] = [];
  let proposalReady = true;
  let hostHandoffReady = false;
  if (role === "super_admin" && ["overview", "proposals", "host"].includes(view)) {
    const [memberResult, contextResult, communityResult, proposalMediaResult, handoffResult] = await Promise.all([
      supabase.rpc("list_admin_member_event_proposals"),
      view === "proposals"
        ? supabase.rpc("list_member_event_proposal_communities")
        : Promise.resolve({ data: [], error: null }),
      supabase.rpc("list_admin_community_event_proposals"),
      supabase.rpc("list_admin_application_proposal_media"),
      view === "proposals"
        ? supabase.rpc("member_event_host_handoff_ready")
        : Promise.resolve({ data: false, error: null }),
    ]);
    hostHandoffReady = !handoffResult.error && handoffResult.data === true;
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
  if (view === "registrations" && detailEventIds.length) {
    const ticketResult = await supabase
      .from("ticket_types")
      .select("id,event_id,name,description,price_minor,currency,inventory_quantity,sales_start_at,sales_end_at,status,sort_order")
      .in("event_id", detailEventIds)
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
  const arrivalEvent = view === "arrival" ? events.find((event) => event.id === (selectedEventId ?? eventIds[0])) : null;
  const doorStaffResult = role === "super_admin" && arrivalEvent
    ? await supabase.rpc("list_event_door_staff", { p_event_id: arrivalEvent.id })
    : { data: [], error: null };
  if (view === "arrival") {
    const checkinResults = await Promise.all(
      detailEventIds.map((eventId) => supabase.rpc("list_event_checkins", { p_event_id: eventId })),
    );
    checkinAttendees = checkinResults.flatMap((result, index) =>
      ((result.data as Omit<CheckinAttendee, "event_id">[] | null) ?? []).map((attendee) => ({ ...attendee, event_id: detailEventIds[index] })),
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
  const followUpResult = view === "follow-up" && role === "super_admin"
    ? await supabase.rpc("list_event_follow_up_candidates_admin")
    : { data: [], error: null };
  const followUpCandidates = (followUpResult.data as EventFollowUpCandidate[] | null) ?? [];

  const proposalCount =
    memberProposals.filter((proposal) =>
      ["submitted", "under_review"].includes(proposal.status),
    ).length +
    communityProposals.filter((proposal) =>
      ["submitted", "under_review"].includes(proposal.status),
    ).length;
  const hostReviewContexts: EventHostReviewContext[] = managedRows.map((event) => {
    const proposal = memberProposals.find((item) => item.canonical_event_id === event.event_id);
    return {
      event_id: event.event_id,
      online_link_ready: Boolean(event.online_url),
      safety_contact_name: proposal?.safety_contact_name ?? null,
      safety_contact_phone: proposal?.safety_contact_phone ?? null,
    };
  });

  return (
    <main className="admin-command-center event-command-page">
      <AdminHeader active="events" label="Event oversight" role={role} />
      <section className="oversight-subnav-shell">
        <nav className="oversight-subnav" aria-label="Event work">
          {views.filter((item) => role === "super_admin" || !["proposals", "host", "stories", "follow-up"].includes(item.href)).map((item) => (
            <Link aria-current={view === item.href ? "page" : undefined} href={`/admin/events?view=${item.href}${selectedEventId ? `&event=${encodeURIComponent(selectedEventId)}` : ""}`} key={item.href}>{item.label}</Link>
          ))}
        </nav>
      </section>

      {view === "overview" ? <EventCommandCentre canControlLifecycle={role === "super_admin"} events={events} selectedEventId={selectedEventId} lifecycleReady={!lifecycleResult.error} lifecycleStates={(lifecycleResult.data as EventLifecycleState[] | null) ?? []} proposalCount={proposalCount} workCounts={workCounts} countsReady={!workCountsResult.error} pilotReadiness={pilotReadiness} /> : null}
      {view === "overview" && role === "super_admin" ? <EventGuestAccessControl enabled={Boolean(guestAccessResult.data?.enabled)} migrationReady={Boolean(guestAccessResult.data) && !guestAccessResult.error} safetyChecks={guestSafetyChecks} /> : null}
      {view === "overview" && role === "super_admin" ? <EventAutomaticCheckoutControl enabled={automaticCheckoutOpen} migrationReady={automaticCheckoutReady} /> : null}
      {view === "overview" && role === "super_admin" && freeBookingEvent.data?.status === "published" && freeBookingEvent.data.registration_mode === "manual_review" ? <EventFreeBookingControl eventId={freeBookingEvent.data.id} eventTitle={freeBookingEvent.data.title} enabled={Boolean(freeBookingEvent.data.free_instant_booking)} ready={!freeBookingEvent.error} /> : null}
      {view === "proposals" && role === "super_admin" ? <section className="focused-admin-tool"><MemberEventProposalManager media={proposalMedia} hostHandoffReady={hostHandoffReady} migrationReady={proposalReady} proposals={memberProposals} /><div className="legacy-gathering-note"><strong>Community gathering history</strong><p>Free member-only gatherings are now owner-led. Earlier submissions remain visible here so Admin can understand the complete decision history.</p></div><CommunityEventProposalManager migrationReady={proposalReady} proposals={communityProposals} /></section> : null}
      {view === "host" && role === "super_admin" ? <EventHostReviewManager events={events} selectedEventId={selectedEventId} workspaces={hostWorkspaces} reviewContexts={hostReviewContexts} safetyContacts={(safetyContactResult.data as { event_id: string; contact_name: string; contact_phone: string }[] | null) ?? []} safetyReady={!safetyReadyResult.error && safetyReadyResult.data === true && !safetyContactResult.error} ticketEventIds={hostTicketEventIds} ticketsReady={hostTicketsReady} migrationReady={!hostResult.error} lifecycleReady={!hostLifecycleResult.error && hostLifecycleResult.data === true} covers={hostCovers} coversReady={!hostCoverResult.error} /> : null}
      {view === "edit" ? <section className="focused-admin-tool"><EventManager automaticCheckoutOpen={automaticCheckoutOpen} automaticCheckoutReady={automaticCheckoutReady} canCreate={role === "super_admin"} hostedEventIds={hostedEventIds} initialSafetyContacts={publicationSafetyContacts} initialEvents={events} selectedEventId={selectedEventId} migrationReady={!eventResult.error} publicationGuardReady={publicationGuardReady} privateEvents={managedRows.map((event) => ({ event_id: event.event_id, online_url: event.online_url }))} /></section> : null}
      {view === "registrations" ? <section className="focused-admin-tool"><RegistrationManager events={events} selectedEventId={selectedEventId} initialPayments={payments} initialRefunds={refunds} initialRegistrations={registrations} initialTickets={tickets} initialWaitlist={waitlist} waitlistReady={waitlistReady} migrationReady={registrationReady} paystackConfigured={Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SITE_URL)} /></section> : null}
      {view === "arrival" ? <section className="focused-admin-tool">
        {role === "super_admin" && arrivalEvent ? <EventDoorStaffControl eventId={arrivalEvent.id} eventSlug={arrivalEvent.slug} staff={(doorStaffResult.data as DoorStaff[] | null) ?? []} ready={!doorStaffResult.error} /> : null}
        <EventCheckinConsole events={events.map((event) => ({ id: event.id, title: event.title, starts_at: event.starts_at, ends_at: event.ends_at }))} selectedEventId={selectedEventId} initialAttendees={checkinAttendees} migrationReady={checkinReady} />
      </section> : null}
      {view === "stories" && role === "super_admin" ? <section className="focused-admin-tool"><MemberEventArchiveManager archives={archives} media={media} migrationReady={storiesReady} /></section> : null}
      {view === "follow-up" && role === "super_admin" ? <EventFollowUpInvitations candidates={followUpCandidates} ready={!followUpResult.error} /> : null}
    </main>
  );
}
