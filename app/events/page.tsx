import Link from "next/link";
import { EventDiscovery } from "@/components/events/event-discovery";
import { createClient } from "@/lib/supabase/server";
import { MemberHeader } from "@/components/member/member-header";
import {
  MemberEventProposalPanel,
  type HostedCommunity,
  type MemberEventProposal,
} from "@/components/events/member-event-proposal";
import type { ApplicationProposalMedia } from "@/lib/application-proposal-media";
import { publicPageMetadata } from "@/lib/seo";
import { loadEventBookingAvailabilityBatch, type EventBookingAvailability } from "@/lib/events/server-booking-availability";
import type { BookingTicket } from "@/lib/events/booking-availability";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata("Upcoming Gatherings & Events", "Discover Her Africa Table gatherings for African women. Explore upcoming events, useful conversations and opportunities to connect in Nairobi and beyond.", "/events");

type PublicEvent = {
  audience: "community" | "public";
  capacity: number | null;
  ends_at: string;
  format: string;
  free_instant_booking: boolean;
  id: string;
  registration_mode: string;
  slug: string;
  starts_at: string;
  summary: string | null;
  timezone: string;
  title: string;
  venues: { city: string; country: string; name: string } | null;
};

type PublicTicket = BookingTicket & { event_id: string };
type MyRegistration = { event_id: string; status: string };
type MyMembership = { event_id: string; status: string };
type MyEvent = Pick<PublicEvent, "id" | "slug" | "starts_at" | "ends_at" | "timezone" | "title" | "venues">;

function eventPrice(tickets: PublicTicket[], lookupFailed = false) {
  if (lookupFailed) return "See event for price";
  if (!tickets.length) return "Price to be announced";
  const lowest = [...tickets].sort((a, b) => a.price_minor - b.price_minor)[0];
  if (lowest.price_minor === 0) return "Free";
  return `From ${lowest.currency} ${new Intl.NumberFormat("en-KE").format(lowest.price_minor / 100)}`;
}

function eventFormatLabel(format: string) {
  return format === "hybrid" ? "In person & online" : format === "online" ? "Online" : "In person";
}

function bookingLabel(
  event: PublicEvent,
  availability: EventBookingAvailability | undefined,
  instantBooking = false,
) {
  if (event.registration_mode === "closed") return "Bookings closed";
  if (event.registration_mode === "waitlist") return "Waiting list";
  if (!availability || availability.checkFailed) return "Check availability";
  if (availability.eventFull || (availability.tickets.length > 0 && availability.tickets.every((ticket) => ticket.bookingState === "event_full" || ticket.bookingState === "ticket_full"))) return "Fully booked";
  if (availability.tickets.some((ticket) => ticket.bookingState === "available")) return instantBooking ? "Book a free place" : event.registration_mode === "manual_review" ? "Requests open" : "Check booking details";
  if (availability.tickets.some((ticket) => ticket.bookingState === "not_open")) return "Bookings open soon";
  return "Bookings unavailable";
}

type ProposalCommunityContext = {
  community_id: string | null;
  community_name: string | null;
  community_slug: string | null;
  community_type: string | null;
  proposal_id: string;
};

type CommunityDirectoryRow = HostedCommunity & {
  membership_role: string | null;
  membership_status: string | null;
};

export default async function EventsPage() {
  const supabase = await createClient();
  const { data, error: eventsError } = await supabase
    .from("events")
    .select("id, slug, title, summary, format, audience, capacity, starts_at, ends_at, timezone, registration_mode, free_instant_booking, venues(name, city, country)")
    .eq("status", "published")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  const events = (data as unknown as PublicEvent[] | null) ?? [];
  const { data: publicTicketRows, error: publicTicketError } = events.length
    ? await supabase.from("ticket_types")
      .select("event_id,id,name,description,inventory_quantity,price_minor,currency,sales_start_at,sales_end_at")
        .in("event_id", events.map((event) => event.id))
        .eq("status", "on_sale")
    : { data: [], error: null };
  const publicTickets = (publicTicketRows as PublicTicket[] | null) ?? [];
  const ticketsByEvent = new Map(events.map((event) => [
    event.id,
    publicTickets.filter((ticket) => ticket.event_id === event.id),
  ]));
  const bookingAvailability = publicTicketError
    ? new Map<string, EventBookingAvailability>()
    : await loadEventBookingAvailabilityBatch(events, ticketsByEvent);
  const { data: posterRows } = events.length
    ? await supabase.rpc("list_public_event_proposal_posters", { p_event_ids: events.map((event) => event.id) })
    : { data: [] };
  const eventPosters = new Map(
    await Promise.all((((posterRows as { alt_text: string; event_id: string; storage_path: string }[] | null) ?? [])).map(async (poster) => {
      const signed = await supabase.storage.from("proposal-media").createSignedUrl(poster.storage_path, 3600);
      return [poster.event_id, { alt: poster.alt_text, url: signed.data?.signedUrl ?? null }] as const;
    })),
  );
  const { data: hostCoverRows } = events.length
    ? await supabase.rpc("list_public_event_host_covers", { p_event_ids: events.map((event) => event.id) })
    : { data: [] };
  const hostCovers = new Map(
    await Promise.all((((hostCoverRows as { alt_text: string; event_id: string; storage_path: string }[] | null) ?? [])).map(async (cover) => {
      const signed = await supabase.storage.from("event-host-covers").createSignedUrl(cover.storage_path, 3600);
      return [cover.event_id, { alt: cover.alt_text, url: signed.data?.signedUrl ?? null }] as const;
    })),
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: memberProfile } = user
    ? await supabase
        .from("profiles")
        .select("access_status")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const isActiveMember = memberProfile?.access_status === "active";
  const [{ data: intakeMode }, { data: foundingEligible }] = isActiveMember
    ? await Promise.all([supabase.rpc("get_membership_intake_mode"), supabase.rpc("founding_pilot_member_ready")])
    : [{ data: null }, { data: false }];
  const [{ data: myRegistrationRows }, { data: myMembershipRows }] = user
    ? await Promise.all([
        supabase.from("registration_requests").select("event_id,status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("event_memberships").select("event_id,status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
      ])
    : [{ data: [] }, { data: [] }];
  const myRegistrations = (myRegistrationRows as MyRegistration[] | null) ?? [];
  const myMemberships = (myMembershipRows as MyMembership[] | null) ?? [];
  const myEventIds = [...new Set([...myRegistrations, ...myMemberships].map((item) => item.event_id))];
  const { data: myEventRows } = myEventIds.length
    ? await supabase.from("events")
        .select("id,slug,title,starts_at,ends_at,timezone,venues(name,city,country)")
        .in("id", myEventIds)
        .in("status", ["published", "completed"])
        .gte("ends_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
    : { data: [] };
  const myEvents = (myEventRows as unknown as MyEvent[] | null) ?? [];
  const hostHandoffResult = isActiveMember
    ? await supabase.rpc("member_event_host_handoff_ready")
    : { data: false, error: null };
  const hostAssignmentResult = isActiveMember && !hostHandoffResult.error
    ? await supabase.from("event_hosts").select("event_id").eq("user_id", user!.id).eq("status", "active")
    : { data: [], error: null };
  const [proposalResult, proposalContextResult, communitiesResult, proposalMediaResult, pilotFreeEventResult] = isActiveMember
    ? await Promise.all([
        supabase.rpc("list_my_member_event_proposals"),
        supabase.rpc("list_member_event_proposal_communities"),
        supabase.rpc("list_communities"),
        supabase.rpc("list_my_application_proposal_media"),
        supabase.rpc("get_pilot_free_event_setting"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: false, error: null },
      ];
  const proposalContexts = (proposalContextResult.data as ProposalCommunityContext[] | null) ?? [];
  const proposals = (((proposalResult.data as MemberEventProposal[] | null) ?? []).map((proposal) => ({
    ...proposal,
    community_id: proposalContexts.find((item) => item.proposal_id === proposal.proposal_id)?.community_id ?? null,
    community_name: proposalContexts.find((item) => item.proposal_id === proposal.proposal_id)?.community_name ?? null,
    community_slug: proposalContexts.find((item) => item.proposal_id === proposal.proposal_id)?.community_slug ?? null,
    community_type: proposalContexts.find((item) => item.proposal_id === proposal.proposal_id)?.community_type ?? null,
  })));
  const hostedCommunities = (((communitiesResult.data as CommunityDirectoryRow[] | null) ?? [])
    .filter((community) =>
      community.membership_status === "active" &&
      ["owner", "moderator", "host"].includes(community.membership_role ?? ""),
    )
    .map(({ community_id, community_type, name, slug }) => ({ community_id, community_type, name, slug })));
  const proposalMedia = await Promise.all(
    (((proposalMediaResult.data as Omit<ApplicationProposalMedia, "image_url">[] | null) ?? [])
      .filter((item) => item.context_type === "member_event_proposal"))
      .map(async (item) => {
        const signed = await supabase.storage.from("proposal-media").createSignedUrl(item.storage_path, 3600);
        return { ...item, image_url: signed.data?.signedUrl ?? null };
      }),
  );

  return (
    <main className="events-page">
      {isActiveMember ? (
        <MemberHeader active="events" label="Events" />
      ) : (
        <header className="legal-header">
          <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>
          <div className="event-header-actions"><Link className="button button-small button-outline" href="/sign-in">Sign in</Link></div>
        </header>
      )}
      <nav className="event-view-switcher" aria-label="Event views">
        <Link href={user ? "/home" : "/"} prefetch={false}>← {user ? "Back to home" : "Back to Her Africa Table"}</Link>
        <Link aria-current="page" href="/events">Upcoming</Link>
        <Link href="/events/past">Past events</Link>
        {user && myEvents.length ? <Link href="/events#my-events">My plans</Link> : null}
        {isActiveMember ? <Link href="/events#propose-event">Host an event</Link> : null}
      </nav>
      <section className="events-intro">
        <div>
          <h1>What’s coming up</h1>
        </div>
        <div className="events-intro-guide">
          <p>
            Find an event and book your place.
          </p>
        </div>
      </section>
      <section className="public-event-list" id="upcoming-events" aria-label="Upcoming events">
        {eventsError ? (
          <div className="events-empty">
            <span className="events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span>
            <div><p className="eyebrow">Events are temporarily unavailable</p><strong>We could not open the event calendar.</strong><p>Please try again shortly. Your membership and any existing registration remain unchanged.</p><div className="events-empty-actions"><Link className="button button-primary" href="/events">Try again</Link>{isActiveMember ? <Link className="button button-outline" href="/support">Contact support</Link> : null}</div></div>
          </div>
        ) : events.length ? <EventDiscovery items={events.map((event) => {
          const poster = hostCovers.get(event.id)?.url ? hostCovers.get(event.id) : eventPosters.get(event.id);
          const tickets = ticketsByEvent.get(event.id) ?? [];
          return { id: event.id, title: event.title, summary: event.summary, location: event.venues?.city ?? "Online", format: `${event.format.replaceAll("_", " ")} ${eventFormatLabel(event.format)}`, content: (
          <article key={event.id} className={poster?.url ? "has-poster" : "without-poster"}>
            {poster?.url ? <Link href={`/events/${event.slug}`} className="public-event-image-link" tabIndex={-1} aria-hidden="true"><img className="public-event-poster" alt="" src={poster.url} loading="lazy" /></Link> : null}
            <div className="public-event-date"><strong>{new Intl.DateTimeFormat("en-KE", { day: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))}</strong><span>{new Intl.DateTimeFormat("en-KE", { month: "short", year: "numeric", timeZone: event.timezone }).format(new Date(event.starts_at))}</span></div>
            <div className="public-event-copy"><span>{event.audience === "community" ? "Community gathering" : eventFormatLabel(event.format)}</span><h2><Link href={`/events/${event.slug}`}>{event.title}</Link></h2><p className="public-event-facts">{new Intl.DateTimeFormat("en-KE", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))} <span aria-hidden="true">·</span> {event.venues ? `${event.venues.name}, ${event.venues.city}` : "Online"} <span aria-hidden="true">·</span> {eventPrice(tickets, Boolean(publicTicketError))}</p><p className="public-event-summary">{event.summary || "Open this event to see the details."}</p><p className="public-event-booking-state">{bookingLabel(event, bookingAvailability.get(event.id), event.free_instant_booking && isActiveMember && intakeMode === "trusted_auto")}</p></div>
            <Link className="public-event-open" href={`/events/${event.slug}`}>View event <span aria-hidden="true">→</span></Link>
          </article>
        ) };})} /> : <div className="events-empty"><span className="events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span><div><p className="eyebrow">No upcoming events</p><strong>We’re preparing the next gathering.</strong><p>{isActiveMember ? "There is no public event just yet. You can be the first to bring people together." : "Published event details will appear here. Join the founding network to hear first."}</p><div className="events-empty-actions"><Link className="button button-primary" href={isActiveMember ? "#propose-event" : "/sign-in?mode=apply"}>{isActiveMember ? "Host an event" : "Request membership"}</Link>{isActiveMember ? <Link className="button button-outline" href="/network">Meet members</Link> : null}</div></div></div>}
      </section>
      {myEvents.length ? <section className="my-events-section" id="my-events" aria-labelledby="my-events-title">
        <div className="my-events-heading"><div><p className="eyebrow">Your plans</p><h2 id="my-events-title">Your places</h2></div><p>Requests and confirmed places you can return to.</p></div>
        <div className="my-events-list">{myEvents.map((event) => {
          const membership = myMemberships.find((item) => item.event_id === event.id);
          const registration = myRegistrations.find((item) => item.event_id === event.id);
          const confirmed = membership?.status === "confirmed" || membership?.status === "attended";
          const state = confirmed ? "Place confirmed" : registration?.status === "waitlisted" ? "On the waiting list" : registration?.status === "rejected" ? "Request declined" : registration?.status === "cancelled" || membership?.status === "cancelled" ? "Place cancelled" : registration?.status === "pending_payment" ? "Payment not complete" : registration?.status === "approved" ? "Approved; pass being prepared" : "Request under review";
          return <article key={event.id}>
            <div><small>{state}</small><h3>{event.title}</h3><p>{new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))} · {event.venues ? `${event.venues.name}, ${event.venues.city}` : "Online"}</p></div>
            <Link className="button button-outline" href={confirmed ? `/events/${event.slug}/pass` : `/events/${event.slug}#registration`}>{confirmed ? "Open my pass" : "View my request"}</Link>
          </article>;
        })}</div>
      </section> : null}
      {isActiveMember ? (
        <MemberEventProposalPanel
          hostEventIds={((hostAssignmentResult.data as { event_id: string }[] | null) ?? []).map((item) => item.event_id)}
          hostedCommunities={hostedCommunities}
          media={proposalMedia}
          mediaReady={!proposalMediaResult.error}
          migrationReady={!proposalResult.error && !proposalContextResult.error && !hostHandoffResult.error && hostHandoffResult.data === true}
          pilotAutoPublish={foundingEligible === true && !pilotFreeEventResult.error && pilotFreeEventResult.data === true}
          publishedEventIds={events.map((event) => event.id)}
          proposals={proposals}
        />
      ) : null}
    </main>
  );
}
