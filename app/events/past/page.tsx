import Link from "next/link";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PastEvent = {
  city: string | null;
  country: string | null;
  ends_at: string;
  event_id: string;
  format: string;
  highlights: string[];
  recap_summary: string | null;
  recap_title: string | null;
  slug: string;
  starts_at: string;
  summary: string | null;
  timezone: string;
  title: string;
  venue_name: string | null;
};

type Testimonial = {
  attribution: string;
  quote: string;
};

export default async function PastEventsPage() {
  const supabase = await createClient();
  const [
    { data: past, error: pastError },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase.rpc("list_public_past_events", { p_limit: 30, p_offset: 0 }),
    supabase.auth.getUser(),
  ]);
  const { data: mine } = user
    ? await supabase.rpc("list_my_past_events")
    : { data: [] };
  const eligible = new Map(
    (
      (mine as { feedback_id: string | null; slug: string }[] | null) ?? []
    ).map((item) => [item.slug, item.feedback_id]),
  );
  const events = (past as PastEvent[] | null) ?? [];
  const testimonialResults = await Promise.all(
    events.map((event) =>
      supabase.rpc("list_event_testimonials", {
        p_event_id: event.event_id,
      }),
    ),
  );
  const testimonials = new Map(
    events.map((event, index) => [
      event.event_id,
      (testimonialResults[index].data as Testimonial[] | null) ?? [],
    ]),
  );

  return (
    <main className="past-events-page">
      {user ? (
        <MemberHeader active="events" label="Past events" />
      ) : (
        <header className="legal-header">
          <Link className="brand" href="/">
            <span className="brand-mark">H</span>
            <span>
              Her Africa Table<small>Past tables</small>
            </span>
          </Link>
          <Link href="/events">Upcoming events</Link>
        </header>
      )}
      <nav className="event-view-switcher" aria-label="Event views">
        <Link href="/events">Upcoming</Link>
        <Link aria-current="page" href="/events/past">Past events</Link>
      </nav>
      <section className="past-events-hero">
        <div>
          <p className="eyebrow">The table continues</p>
          <h1>Event archive.</h1>
        </div>
        <div className="past-events-hero-guide">
          <p>Revisit completed gatherings, approved recaps and the connections that continued after the room.</p>
          <span>{events.length} {events.length === 1 ? "gathering" : "gatherings"}</span>
        </div>
      </section>
      <section className="past-event-list">
        {pastError ? (
          <div className="past-events-empty" role="status">
            <span className="past-events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7h14M8 3v4M16 3v4"/><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 12h8M8 16h5"/></svg></span>
            <div><p className="eyebrow">Archive temporarily unavailable</p><h2>We could not open past events.</h2><p>Please try again shortly. Your attendance history and private feedback remain unchanged.</p><div className="past-events-empty-actions"><Link className="button button-primary" href="/events/past">Try again</Link>{user ? <Link className="button button-outline" href="/support">Contact support</Link> : null}</div></div>
          </div>
        ) : events.length ? (
          events.map((event) => (
            <article className="past-event-card" id={event.event_id} key={event.event_id}>
              <div className="past-event-date" aria-label={new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "long", year: "numeric" }).format(new Date(event.starts_at))}>
                <span>
                  {new Intl.DateTimeFormat("en-KE", {
                    month: "short",
                  }).format(new Date(event.starts_at))}
                </span>
                <strong>
                  {new Intl.DateTimeFormat("en-KE", {
                    day: "2-digit",
                  }).format(new Date(event.starts_at))}
                </strong>
                <small>
                  {new Intl.DateTimeFormat("en-KE", {
                    year: "numeric",
                  }).format(new Date(event.starts_at))}
                </small>
              </div>
              <div className="past-event-card-body">
                <div className="past-event-card-meta">
                  <span>Completed</span>
                  <p>{event.format.replace("_", " ")} ·{" "}
                  {[event.venue_name, event.city, event.country]
                    .filter(Boolean)
                    .join(", ") || "Online"}</p>
                </div>
                <h2>{event.title}</h2>
                <p className="past-event-summary">
                  {event.recap_summary ||
                    event.summary ||
                    "A Her Africa Table gathering."}
                </p>
                {event.highlights?.length ? (
                  <details className="past-event-highlights">
                    <summary>View recap highlights</summary>
                    <ul>{event.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
                  </details>
                ) : null}
                {testimonials.get(event.event_id)?.length ? (
                  <div className="past-testimonials">
                    {testimonials.get(event.event_id)?.slice(0, 2).map((item) => (
                      <blockquote
                        key={`${item.attribution}-${item.quote}`}
                      >
                        “{item.quote}”
                        <cite>— {item.attribution}</cite>
                      </blockquote>
                    ))}
                  </div>
                ) : null}
                <footer className="past-event-card-footer">
                  <span>{event.recap_summary ? "Recap published" : "Recap pending"}</span>
                  {eligible.has(event.slug) ? (
                    <div className="past-event-member-actions">
                      <Link href={`/events/${event.slug}/follow-up`}>Continue connections</Link>
                      <Link href={`/events/${event.slug}/feedback`}>{eligible.get(event.slug) ? "Update feedback" : "Share private feedback"}</Link>
                    </div>
                  ) : <span>Public recap</span>}
                </footer>
              </div>
            </article>
          ))
        ) : (
          <div className="past-events-empty">
            <span className="past-events-empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 7h14M8 3v4M16 3v4"/><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 12h8M8 16h5"/></svg></span>
            <div>
              <p className="eyebrow">No completed tables yet</p>
              <h2>Your event history will begin here.</h2>
              <p>After a gathering ends, approved recaps, your private feedback and attendee follow-up will become available in this archive.</p>
              <div className="past-events-empty-actions">
                <Link className="button button-primary" href="/events">View upcoming events</Link>
                {user ? <Link className="button button-outline" href="/home">Return home</Link> : null}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
