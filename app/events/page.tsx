import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MemberHeader } from "@/components/member/member-header";
import {
  MemberEventProposalPanel,
  type HostedCommunity,
  type MemberEventProposal,
} from "@/components/events/member-event-proposal";

export const dynamic = "force-dynamic";

type PublicEvent = {
  audience: "community" | "public";
  ends_at: string;
  format: string;
  id: string;
  registration_mode: string;
  slug: string;
  starts_at: string;
  summary: string | null;
  title: string;
  venues: { city: string; country: string; name: string } | null;
};

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
    .select("id, slug, title, summary, format, audience, starts_at, ends_at, registration_mode, venues(name, city, country)")
    .eq("status", "published")
    .gte("ends_at", new Date().toISOString())
    .order("starts_at", { ascending: true });
  const events = (data as unknown as PublicEvent[] | null) ?? [];
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
  const [proposalResult, proposalContextResult, communitiesResult] = isActiveMember
    ? await Promise.all([
        supabase.rpc("list_my_member_event_proposals"),
        supabase.rpc("list_member_event_proposal_communities"),
        supabase.rpc("list_communities"),
      ])
    : [
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

  return (
    <main className="events-page">
      {isActiveMember ? (
        <MemberHeader active="events" label="Events" />
      ) : (
        <header className="legal-header">
          <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>
          <div className="event-header-actions"><Link className="button button-small button-outline" href="/sign-in">Member sign in</Link></div>
        </header>
      )}
      <nav className="event-view-switcher" aria-label="Event views">
        <Link aria-current="page" href="/events">Upcoming</Link>
        <Link href="/events/past">Past events</Link>
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
      <section className="public-event-list" aria-label="Published events">
        {eventsError ? (
          <div className="events-empty">
            <span className="events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span>
            <div><p className="eyebrow">Events are temporarily unavailable</p><strong>We could not open the event calendar.</strong><p>Please try again shortly. Your membership and any existing registration remain unchanged.</p><div className="events-empty-actions"><Link className="button button-primary" href="/events">Try again</Link>{isActiveMember ? <Link className="button button-outline" href="/support">Contact support</Link> : null}</div></div>
          </div>
        ) : events.length ? events.map((event) => {
          const eventCommunity = eventCommunities.find((item) => item.event_id === event.id)?.communities;
          return (
          <article key={event.id}>
            <div className="public-event-date"><strong>{new Intl.DateTimeFormat("en-KE", { day: "2-digit" }).format(new Date(event.starts_at))}</strong><span>{new Intl.DateTimeFormat("en-KE", { month: "short", year: "numeric" }).format(new Date(event.starts_at))}</span></div>
            <div className="public-event-copy"><span>{event.audience === "community" ? "Your Community · " : ""}{event.format.replace("_", " ")} · {event.venues ? `${event.venues.city}, ${event.venues.country}` : "Online"}</span><h2>{event.title}</h2><p>{event.summary || "Event details will be shared with approved members."}</p>{eventCommunity ? <Link className="event-list-community" href={`/communities/${eventCommunity.slug}/about`}>{eventCommunity.name} <i aria-hidden="true">→</i></Link> : <small className="event-list-standalone">Her Africa Table open event</small>}</div>
            <Link href={`/events/${event.slug}`}>See event <span aria-hidden="true">→</span></Link>
          </article>
        );}) : <div className="events-empty"><span className="events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span><div><p className="eyebrow">No upcoming events</p><strong>We’re preparing the next gathering.</strong><p>{isActiveMember ? "We will let you know as soon as the date and place are ready." : "Published event details will appear here. Join the founding network to hear first."}</p><div className="events-empty-actions"><Link className="button button-primary" href={isActiveMember ? "/home" : "/sign-in"}>{isActiveMember ? "Back home" : "Request membership"}</Link>{isActiveMember ? <Link className="button button-outline" href="/network">Meet members</Link> : null}</div></div></div>}
      </section>
      {isActiveMember ? (
        <MemberEventProposalPanel
          hostedCommunities={hostedCommunities}
          migrationReady={!proposalResult.error && !proposalContextResult.error}
          proposals={proposals}
        />
      ) : null}
    </main>
  );
}
