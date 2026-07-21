import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

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

  return (
    <main className="events-page">
      <header className="legal-header">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>
        <Link className="button button-small button-outline" href="/sign-in">Member sign in</Link>
      </header>
      <section className="events-intro">
        <p className="eyebrow">Gather with intention</p>
        <h1>Upcoming tables.</h1>
        <p>Curated gatherings where professional trust begins—and where every introduction can continue inside the network.</p>
      </section>
      <section className="public-event-list" aria-label="Published events">
        {events.length ? events.map((event) => (
          <article key={event.id}>
            <div className="public-event-date"><strong>{new Intl.DateTimeFormat("en-KE", { day: "2-digit" }).format(new Date(event.starts_at))}</strong><span>{new Intl.DateTimeFormat("en-KE", { month: "short", year: "numeric" }).format(new Date(event.starts_at))}</span></div>
            <div className="public-event-copy"><span>{event.format.replace("_", " ")} · {event.venues ? `${event.venues.city}, ${event.venues.country}` : "Online"}</span><h2>{event.title}</h2><p>{event.summary || "Event details will be shared with approved members."}</p></div>
            <Link href={`/events/${event.slug}`}>View event <span aria-hidden="true">→</span></Link>
          </article>
        )) : <div className="events-empty"><strong>The next table is being prepared.</strong><p>Published event details will appear here. Join the founding network to hear first.</p><Link className="button button-primary" href="/sign-in">Request membership</Link></div>}
      </section>
    </main>
  );
}
