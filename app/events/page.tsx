import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MemberHeader } from "@/components/member/member-header";
import {
  MemberEventProposalPanel,
  type HostedCommunity,
  type MemberEventProposal,
} from "@/components/events/member-event-proposal";
import type { ApplicationProposalMedia } from "@/lib/application-proposal-media";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata("Upcoming Gatherings & Events", "Discover Her Africa Table gatherings for African women. Explore upcoming events, useful conversations and opportunities to connect in Nairobi and beyond.", "/events");

type PublicEvent = {
  audience: "community" | "public";
  ends_at: string;
  format: string;
  id: string;
  registration_mode: string;
  slug: string;
  starts_at: string;
  summary: string | null;
  timezone: string;
  title: string;
  venues: { city: string; country: string; name: string } | null;
};

type PublicTicket = { event_id: string; price_minor: number; currency: string; sales_start_at: string | null; sales_end_at: string | null };
type MyRegistration = { event_id: string; status: string };
type MyMembership = { event_id: string; status: string };
type MyEvent = Pick<PublicEvent, "id" | "slug" | "starts_at" | "ends_at" | "timezone" | "title" | "venues">;

function eventPrice(tickets: PublicTicket[]) {
  if (!tickets.length) return "Price to be announced";
  const lowest = [...tickets].sort((a, b) => a.price_minor - b.price_minor)[0];
  if (lowest.price_minor === 0) return "Free";
  return `From ${lowest.currency} ${new Intl.NumberFormat("en-KE").format(lowest.price_minor / 100)}`;
}

function bookingLabel(event: PublicEvent, tickets: PublicTicket[]) {
  if (event.registration_mode === "closed") return "Bookings closed";
  if (event.registration_mode === "waitlist") return "Waiting list";
  const now = Date.now();
  if (tickets.some((ticket) => (!ticket.sales_start_at || Date.parse(ticket.sales_start_at) <= now) && (!ticket.sales_end_at || Date.parse(ticket.sales_end_at) >= now))) return "Check places";
  return tickets.some((ticket) => ticket.sales_start_at && Date.parse(ticket.sales_start_at) > now) ? "Bookings open soon" : "Bookings unavailable";
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
    .select("id, slug, title, summary, format, audience, starts_at, ends_at, timezone, registration_mode, venues(name, city, country)")
    .eq("status", "published")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  const events = (data as unknown as PublicEvent[] | null) ?? [];
  const { data: publicTicketRows } = events.length
    ? await supabase.from("ticket_types")
        .select("event_id,price_minor,currency,sales_start_at,sales_end_at")
        .in("event_id", events.map((event) => event.id))
        .eq("status", "on_sale")
    : { data: [] };
  const publicTickets = (publicTicketRows as PublicTicket[] | null) ?? [];
  const { data: eventCommunityRows } = events.length
    ? await supabase
        .from("community_event_links")
        .select("event_id,communities(name,slug,community_type)")
        .in("event_id", events.map((event) => event.id))
    : { data: [] };
  const eventCommunities = (eventCommunityRows as unknown as {
    communities: { community_type: string; name: string; slug: string } | null;
    event_id: string;
  }[] | null) ?? [];
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
  const [proposalResult, proposalContextResult, communitiesResult, proposalMediaResult] = isActiveMember
    ? await Promise.all([
        supabase.rpc("list_my_member_event_proposals"),
        supabase.rpc("list_member_event_proposal_communities"),
        supabase.rpc("list_communities"),
        supabase.rpc("list_my_application_proposal_media"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
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
        <Link aria-current="page" href="/events">Upcoming</Link>
        <Link href="/events/past">Past events</Link>
        {user ? <Link href="/events#my-events">My events</Link> : null}
      </nav>
      <section className="events-intro">
        <div>
          <p className="eyebrow">Gatherings</p>
          <h1>What’s coming up</h1>
        </div>
        <div className="events-intro-guide">
          <p>
            See upcoming events, choose what suits you and keep all the details
            in one place.
          </p>
          {isActiveMember ? (
            <div>
              <Link href="/home">Back home</Link>
            </div>
          ) : null}
        </div>
      </section>
      {user ? <section className="my-events-section" id="my-events" aria-labelledby="my-events-title">
        <div className="my-events-heading"><div><p className="eyebrow">Your plans</p><h2 id="my-events-title">My events</h2></div><p>Requests and confirmed places you can return to.</p></div>
        {myEvents.length ? <div className="my-events-list">{myEvents.map((event) => {
          const membership = myMemberships.find((item) => item.event_id === event.id);
          const registration = myRegistrations.find((item) => item.event_id === event.id);
          const confirmed = membership?.status === "confirmed" || membership?.status === "attended";
          const state = confirmed ? "Place confirmed" : registration?.status === "waitlisted" ? "On the waiting list" : registration?.status === "rejected" ? "Request declined" : registration?.status === "cancelled" || membership?.status === "cancelled" ? "Place cancelled" : registration?.status === "pending_payment" ? "Payment not complete" : registration?.status === "approved" ? "Approved; pass being prepared" : "Request under review";
          return <article key={event.id}>
            <div><small>{state}</small><h3>{event.title}</h3><p>{new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))} · {event.venues ? `${event.venues.name}, ${event.venues.city}` : "Online"}</p></div>
            <Link className="button button-outline" href={confirmed ? `/events/${event.slug}/pass` : `/events/${event.slug}#registration`}>{confirmed ? "Open my pass" : "View my request"}</Link>
          </article>;
        })}</div> : <p className="my-events-empty">No upcoming requests or confirmed places yet. Explore the published events below.</p>}
      </section> : null}
      <section className="public-event-list" aria-label="Published events">
        {eventsError ? (
          <div className="events-empty">
            <span className="events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span>
            <div><p className="eyebrow">Events are temporarily unavailable</p><strong>We could not open the event calendar.</strong><p>Please try again shortly. Your membership and any existing registration remain unchanged.</p><div className="events-empty-actions"><Link className="button button-primary" href="/events">Try again</Link>{isActiveMember ? <Link className="button button-outline" href="/support">Contact support</Link> : null}</div></div>
          </div>
        ) : events.length ? events.map((event) => {
          const eventCommunity = eventCommunities.find((item) => item.event_id === event.id)?.communities;
          const poster = hostCovers.get(event.id)?.url ? hostCovers.get(event.id) : eventPosters.get(event.id);
          const tickets = publicTickets.filter((ticket) => ticket.event_id === event.id);
          return (
          <article key={event.id}>
            {poster?.url ? <img className="public-event-poster" alt={poster.alt} src={poster.url} /> : null}
            <div className="public-event-date"><strong>{new Intl.DateTimeFormat("en-KE", { day: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))}</strong><span>{new Intl.DateTimeFormat("en-KE", { month: "short", year: "numeric", timeZone: event.timezone }).format(new Date(event.starts_at))}</span></div>
            <div className="public-event-copy"><span>{event.audience === "community" ? "Community gathering" : event.format.replace("_", " ")}</span><h2>{event.title}</h2><p className="public-event-facts">{new Intl.DateTimeFormat("en-KE", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))} <span aria-hidden="true">·</span> {event.venues ? `${event.venues.name}, ${event.venues.city}` : "Online"} <span aria-hidden="true">·</span> {eventPrice(tickets)} <span aria-hidden="true">·</span> {bookingLabel(event, tickets)}</p><p className="public-event-summary">{event.summary || "Event details will be shared with approved members."}</p>{eventCommunity ? <Link className="event-list-community" href={`/communities/${eventCommunity.slug}/about`}>{eventCommunity.name} <i aria-hidden="true">→</i></Link> : <small className="event-list-standalone">Her Africa Table open event</small>}</div>
            <Link href={`/events/${event.slug}`}>View event <span aria-hidden="true">→</span></Link>
          </article>
        );}) : <div className="events-empty"><span className="events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span><div><p className="eyebrow">No upcoming events</p><strong>We’re preparing the next gathering.</strong><p>{isActiveMember ? "We will let you know as soon as the date and place are ready." : "Published event details will appear here. Join the founding network to hear first."}</p><div className="events-empty-actions"><Link className="button button-primary" href={isActiveMember ? "/home" : "/sign-in?mode=apply"}>{isActiveMember ? "Back home" : "Request membership"}</Link>{isActiveMember ? <Link className="button button-outline" href="/network">Meet members</Link> : null}</div></div></div>}
      </section>
      {isActiveMember ? (
        <MemberEventProposalPanel
          hostEventIds={((hostAssignmentResult.data as { event_id: string }[] | null) ?? []).map((item) => item.event_id)}
          hostedCommunities={hostedCommunities}
          media={proposalMedia}
          mediaReady={!proposalMediaResult.error}
          migrationReady={!proposalResult.error && !proposalContextResult.error && !hostHandoffResult.error && hostHandoffResult.data === true}
          publishedEventIds={events.map((event) => event.id)}
          proposals={proposals}
        />
      ) : null}
    </main>
  );
}
