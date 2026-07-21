import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MenuFeedbackControls } from "@/components/events/menu-feedback-controls";

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
  const sessionIds = sessions?.map((session) => session.id) ?? [];
  const { data: speakerLinks } = sessionIds.length
    ? await supabase.from("session_speakers").select("session_id, event_speakers(name, job_title, company)").in("session_id", sessionIds).order("sort_order", { ascending: true })
    : { data: [] };

  function speakersFor(sessionId: string) {
    return ((speakerLinks as unknown as { session_id: string; event_speakers: { company: string | null; job_title: string | null; name: string } | null }[] | null) ?? [])
      .filter((link) => link.session_id === sessionId)
      .map((link) => link.event_speakers)
      .filter((speaker): speaker is { company: string | null; job_title: string | null; name: string } => Boolean(speaker));
  }
  const { data: menu } = await supabase.from("event_menus").select("id, title, introduction, embassy_note").eq("event_id", event.id).eq("status", "published").maybeSingle();
  const { data: menuCourses } = menu
    ? await supabase.from("menu_courses").select("id, name, description, sort_order").eq("menu_id", menu.id).order("sort_order", { ascending: true })
    : { data: [] };
  const menuCourseIds = menuCourses?.map((course) => course.id) ?? [];
  const { data: menuItems } = menuCourseIds.length
    ? await supabase.from("menu_items").select("id, course_id, name, description, cultural_origin, cultural_story, ingredients, dietary_tags, allergen_notes, sort_order").in("course_id", menuCourseIds).eq("status", "published").order("sort_order", { ascending: true })
    : { data: [] };
  const { data: { user } } = await supabase.auth.getUser();
  const { data: memberProfile } = user ? await supabase.from("profiles").select("access_status").eq("id", user.id).maybeSingle() : { data: null };
  const menuItemIds = menuItems?.map((item) => item.id) ?? [];
  const { data: ownFeedback } = user && memberProfile?.access_status === "active" && menuItemIds.length
    ? await supabase.from("menu_item_feedback").select("item_id, rating, is_favorite, comment").eq("user_id", user.id).in("item_id", menuItemIds)
    : { data: [] };

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

      <section className="event-content-section"><div><p className="eyebrow">The gathering</p><h2>Programme</h2></div>{sessions?.length ? <div className="programme-list">{sessions.map((session) => { const speakers = speakersFor(session.id); return <article key={session.id}><time>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(session.starts_at))}</time><div><h3>{session.title}</h3>{speakers.map((speaker) => <p className="programme-speaker" key={`${session.id}-${speaker.name}`}><strong>{speaker.name}</strong>{[speaker.job_title, speaker.company].filter(Boolean).join(" · ") ? ` · ${[speaker.job_title, speaker.company].filter(Boolean).join(" · ")}` : ""}</p>)}<p>{session.description}</p>{session.room ? <span>{session.room}</span> : null}</div></article>; })}</div> : <div className="events-empty"><strong>Programme arriving soon.</strong><p>Confirmed attendees will receive programme updates as they are published.</p></div>}</section>

      {menu ? <section className="event-menu-section"><header><p className="eyebrow">A culinary journey</p><h2>{menu.title}</h2><p>{menu.introduction}</p></header><div className="public-menu-courses">{menuCourses?.map((course) => { const dishes = menuItems?.filter((item) => item.course_id === course.id) ?? []; return dishes.length ? <article className="public-menu-course" key={course.id}><div><span>{String(course.sort_order + 1).padStart(2, "0")}</span><h3>{course.name}</h3><p>{course.description}</p></div><div>{dishes.map((dish) => { const feedback = ownFeedback?.find((entry) => entry.item_id === dish.id); return <section key={dish.id}><div className="dish-heading"><h4>{dish.name}</h4>{dish.cultural_origin ? <span>{dish.cultural_origin}</span> : null}</div><p>{dish.description}</p>{dish.cultural_story ? <blockquote>{dish.cultural_story}</blockquote> : null}{dish.ingredients?.length ? <p className="dish-meta"><strong>Ingredients</strong>{dish.ingredients.join(" · ")}</p> : null}{dish.dietary_tags?.length ? <div className="dish-tags">{dish.dietary_tags.map((tag: string) => <span key={tag}>{tag}</span>)}</div> : null}{dish.allergen_notes ? <p className="allergen-note"><strong>Allergen note:</strong> {dish.allergen_notes}</p> : null}{memberProfile?.access_status === "active" ? <MenuFeedbackControls itemId={dish.id} initialRating={feedback?.rating ?? null} initialFavorite={feedback?.is_favorite ?? false} initialComment={feedback?.comment ?? null} /> : null}</section>; })}</div></article> : null; })}</div>{menu.embassy_note ? <aside className="embassy-note"><span>From the table</span><p>{menu.embassy_note}</p></aside> : null}</section> : null}

      {sponsors?.length ? <section className="event-content-section sponsor-section"><div><p className="eyebrow">With thanks</p><h2>Event partners</h2></div><div>{sponsors.map((sponsor) => <article key={sponsor.id}><span>{sponsor.tier || "Partner"}</span><strong>{sponsor.name}</strong></article>)}</div></section> : null}
    </main>
  );
}
