import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MemberHeader } from "@/components/member/member-header";

export const dynamic = "force-dynamic";

type PublicEvent = {
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

export default async function EventsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, slug, title, summary, format, starts_at, ends_at, registration_mode, venues(name, city, country)")
    .eq("status", "published")
    .order("starts_at", { ascending: true });
  const events = (data as unknown as PublicEvent[] | null) ?? [];
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

  return (
    <main className="events-page">
      {isActiveMember ? (
        <MemberHeader active="events" label="Events" />
      ) : (
        <header className="legal-header">
          <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>
          <div className="event-header-actions"><Link href="/events/past">Past events</Link><Link className="button button-small button-outline" href="/sign-in">Member sign in</Link></div>
        </header>
      )}
      <section className="events-intro">
        <div>
          <p className="eyebrow">Gather with intention</p>
          <h1>Upcoming tables.</h1>
        </div>
        <div className="events-intro-guide">
          <p>
            Discover the next gathering, request your place, and keep every
            event detail in one calm, dependable place.
          </p>
          {isActiveMember ? (
            <div>
              <Link href="/events/past">Past events</Link>
              <Link href="/home">Member home</Link>
            </div>
          ) : null}
        </div>
      </section>
      <section className="public-event-list" aria-label="Published events">
        {events.length ? events.map((event) => (
          <article key={event.id}>
            <div className="public-event-date"><strong>{new Intl.DateTimeFormat("en-KE", { day: "2-digit" }).format(new Date(event.starts_at))}</strong><span>{new Intl.DateTimeFormat("en-KE", { month: "short", year: "numeric" }).format(new Date(event.starts_at))}</span></div>
            <div className="public-event-copy"><span>{event.format.replace("_", " ")} · {event.venues ? `${event.venues.city}, ${event.venues.country}` : "Online"}</span><h2>{event.title}</h2><p>{event.summary || "Event details will be shared with approved members."}</p></div>
            <Link href={`/events/${event.slug}`}>View event <span aria-hidden="true">→</span></Link>
          </article>
        )) : <div className="events-empty"><span className="events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg></span><div><p className="eyebrow">Nothing to book yet</p><strong>The next table is being prepared.</strong><p>{isActiveMember ? "We will alert you as soon as the date, venue, and registration window are ready." : "Published event details will appear here. Join the founding network to hear first."}</p><div className="events-empty-actions"><Link className="button button-primary" href={isActiveMember ? "/events/past" : "/sign-in"}>{isActiveMember ? "View past events" : "Request membership"}</Link>{isActiveMember ? <Link className="button button-outline" href="/network">Meet members</Link> : null}</div></div></div>}
      </section>
    </main>
  );
}
