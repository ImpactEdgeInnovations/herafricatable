import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventDetail = {
  ends_at: string;
  format: string;
  id: string;
  registration_mode: string;
  starts_at: string;
  summary: string | null;
  timezone: string;
  title: string;
  venues: { address_line: string | null; city: string; country: string; map_url: string | null; name: string } | null;
};

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, summary, format, starts_at, ends_at, timezone, registration_mode, venues(name, city, country, address_line, map_url)")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) notFound();
  const event = data as unknown as EventDetail;

  const [{ data: announcements }, { data: sessions }, { data: sponsors }] = await Promise.all([
    supabase.from("event_announcements").select("id, title, body, published_at").eq("event_id", event.id).eq("status", "published").order("published_at", { ascending: false }),
    supabase.from("programme_sessions").select("id, title, description, starts_at, ends_at, room").eq("event_id", event.id).eq("status", "published").order("starts_at", { ascending: true }),
    supabase.from("event_sponsors").select("id, name, tier, website_url, logo_url").eq("event_id", event.id).eq("is_published", true).order("sort_order", { ascending: true }),
  ]);

  const cta = event.registration_mode === "waitlist" ? "Join the waitlist" : event.registration_mode === "closed" ? "Registration closed" : event.registration_mode === "manual_review" ? "Request a seat" : "Register";

  return (
    <main className="event-detail-page">
      <header className="legal-header">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>
        <Link href="/events">All events</Link>
      </header>
      <section className="event-detail-hero">
        <div><p className="eyebrow">{event.format.replace("_", " ")} · {event.venues?.city ?? "Online"}</p><h1>{event.title}</h1><p>{event.summary || "A carefully curated Her Africa Table gathering."}</p></div>
        <aside>
          <dl><div><dt>Date</dt><dd>{new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(event.starts_at))}</dd></div><div><dt>Time</dt><dd>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))} – {new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.ends_at))}</dd></div><div><dt>Venue</dt><dd>{event.venues ? `${event.venues.name}, ${event.venues.city}` : "Online access for confirmed attendees"}</dd></div></dl>
          {event.registration_mode === "closed" ? <span className="button button-outline" aria-disabled="true">{cta}</span> : <Link className="button button-primary" href="/sign-in">{cta}</Link>}
        </aside>
      </section>

      {announcements?.length ? <section className="event-content-section"><div><p className="eyebrow">Latest information</p><h2>Announcements</h2></div><div className="announcement-list">{announcements.map((item) => <article key={item.id}><span>{item.published_at ? new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" }).format(new Date(item.published_at)) : "Update"}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></article>)}</div></section> : null}

      <section className="event-content-section"><div><p className="eyebrow">The gathering</p><h2>Programme</h2></div>{sessions?.length ? <div className="programme-list">{sessions.map((session) => <article key={session.id}><time>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(session.starts_at))}</time><div><h3>{session.title}</h3><p>{session.description}</p>{session.room ? <span>{session.room}</span> : null}</div></article>)}</div> : <div className="events-empty"><strong>Programme arriving soon.</strong><p>Confirmed attendees will receive programme updates as they are published.</p></div>}</section>

      {sponsors?.length ? <section className="event-content-section sponsor-section"><div><p className="eyebrow">With thanks</p><h2>Event partners</h2></div><div>{sponsors.map((sponsor) => <article key={sponsor.id}><span>{sponsor.tier || "Partner"}</span><strong>{sponsor.name}</strong></article>)}</div></section> : null}
    </main>
  );
}
