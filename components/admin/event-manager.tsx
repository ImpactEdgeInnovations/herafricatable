"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AdminEvent = {
  capacity: number | null;
  ends_at: string;
  format: "in_person" | "virtual" | "hybrid";
  id: string;
  is_featured: boolean;
  registration_mode: "automatic" | "manual_review" | "closed" | "waitlist";
  slug: string;
  starts_at: string;
  status: "draft" | "published" | "cancelled" | "completed";
  summary: string | null;
  timezone: string;
  title: string;
  venues: { address_line: string | null; city: string; country: string; map_url: string | null; name: string } | null;
};

type PrivateEvent = { event_id: string; online_url: string | null };

type EventForm = {
  addressLine: string;
  capacity: string;
  city: string;
  country: string;
  endsAt: string;
  format: AdminEvent["format"];
  id: string | null;
  isFeatured: boolean;
  mapUrl: string;
  onlineUrl: string;
  registrationMode: AdminEvent["registration_mode"];
  slug: string;
  startsAt: string;
  status: AdminEvent["status"];
  summary: string;
  timezone: string;
  title: string;
  venueName: string;
};

function toLocalInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function blankForm(): EventForm {
  const start = new Date();
  start.setDate(start.getDate() + 60);
  start.setHours(18, 0, 0, 0);
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000);
  return {
    addressLine: "", capacity: "", city: "Nairobi", country: "Kenya",
    endsAt: toLocalInput(end.toISOString()), format: "in_person", id: null,
    isFeatured: false, mapUrl: "", onlineUrl: "", registrationMode: "manual_review",
    slug: "", startsAt: toLocalInput(start.toISOString()), status: "draft", summary: "",
    timezone: "Africa/Nairobi", title: "", venueName: "",
  };
}

function formFromEvent(event: AdminEvent, privateEvents: PrivateEvent[]): EventForm {
  const privateEvent = privateEvents.find((item) => item.event_id === event.id);
  return {
    addressLine: event.venues?.address_line ?? "",
    capacity: event.capacity?.toString() ?? "",
    city: event.venues?.city ?? "",
    country: event.venues?.country ?? "Kenya",
    endsAt: toLocalInput(event.ends_at),
    format: event.format,
    id: event.id,
    isFeatured: event.is_featured,
    mapUrl: event.venues?.map_url ?? "",
    onlineUrl: privateEvent?.online_url ?? "",
    registrationMode: event.registration_mode,
    slug: event.slug,
    startsAt: toLocalInput(event.starts_at),
    status: event.status,
    summary: event.summary ?? "",
    timezone: event.timezone,
    title: event.title,
    venueName: event.venues?.name ?? "",
  };
}

export function EventManager({ initialEvents, privateEvents, canCreate, migrationReady }: { initialEvents: AdminEvent[]; privateEvents: PrivateEvent[]; canCreate: boolean; migrationReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState(initialEvents);
  const [form, setForm] = useState<EventForm>(() => initialEvents[0] ? formFromEvent(initialEvents[0], privateEvents) : blankForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function update<K extends keyof EventForm>(field: K, value: EventForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function chooseEvent(id: string) {
    const selected = events.find((event) => event.id === id);
    if (selected) {
      setForm(formFromEvent(selected, privateEvents));
      setMessage("");
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.startsAt || !form.endsAt) return;
    setSaving(true);
    setMessage("");

    const { data, error } = await supabase.rpc("save_event", {
      p_event_id: form.id,
      p_title: form.title,
      p_slug: form.slug || slugify(form.title),
      p_summary: form.summary,
      p_format: form.format,
      p_status: form.status,
      p_starts_at: new Date(form.startsAt).toISOString(),
      p_ends_at: new Date(form.endsAt).toISOString(),
      p_timezone: form.timezone,
      p_venue_name: form.venueName,
      p_city: form.city,
      p_country: form.country,
      p_address_line: form.addressLine,
      p_map_url: form.mapUrl,
      p_online_url: form.onlineUrl,
      p_capacity: form.capacity ? Number(form.capacity) : null,
      p_registration_mode: form.registrationMode,
      p_is_featured: form.isFeatured,
    });

    if (error) {
      setMessage(error.message.includes("schema cache") ? "Apply the events foundation migration in Supabase before saving." : error.message);
      setSaving(false);
      return;
    }

    setMessage(form.status === "published" ? "Event saved and published. The public event page is now available." : "Event saved as an operational draft.");
    setSaving(false);
    if (!form.id && data) {
      window.location.reload();
    } else {
      setEvents((current) => current.map((item) => item.id === form.id ? {
        ...item,
        capacity: form.capacity ? Number(form.capacity) : null,
        ends_at: new Date(form.endsAt).toISOString(),
        format: form.format,
        is_featured: form.isFeatured,
        registration_mode: form.registrationMode,
        slug: slugify(form.slug || form.title),
        starts_at: new Date(form.startsAt).toISOString(),
        status: form.status,
        summary: form.summary || null,
        timezone: form.timezone,
        title: form.title,
        venues: form.format === "virtual" ? null : { address_line: form.addressLine || null, city: form.city, country: form.country, map_url: form.mapUrl || null, name: form.venueName },
      } : form.isFeatured ? { ...item, is_featured: false } : item));
    }
  }

  if (!migrationReady) {
    return <section className="admin-section" id="events"><div className="admin-empty"><strong>Events database update required</strong><p>Apply <code>20260721160000_events_foundation.sql</code> before using event operations.</p></div></section>;
  }

  return (
    <section className="admin-section event-manager" id="events" aria-labelledby="event-manager-title">
      <div className="admin-section-heading">
        <div><p className="eyebrow">Event operations</p><h2 id="event-manager-title">Events and access</h2><p>Create operational drafts, control registration mode, and publish only when dates and venue information are confirmed.</p></div>
        {canCreate ? <button className="button button-outline" type="button" onClick={() => { setForm(blankForm()); setMessage(""); }}>New event</button> : null}
      </div>

      <div className="event-admin-layout">
        <aside className="event-admin-list" aria-label="Managed events">
          {events.length ? events.map((event) => <button type="button" className={form.id === event.id ? "selected" : ""} key={event.id} onClick={() => chooseEvent(event.id)}><span>{event.title}</span><small>{event.status} · {new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(event.starts_at))}</small></button>) : <div><strong>No events yet</strong><p>Create the first production event as a draft.</p></div>}
        </aside>

        <form className="event-admin-form" onSubmit={save}>
          <div className="form-grid">
            <label className="form-wide">Event title<input value={form.title} onChange={(event) => { update("title", event.target.value); if (!form.id) update("slug", slugify(event.target.value)); }} required /></label>
            <label>URL slug<input value={form.slug} onChange={(event) => update("slug", slugify(event.target.value))} placeholder="nairobi-2026" required /></label>
            <label>Format<select value={form.format} onChange={(event) => update("format", event.target.value as EventForm["format"])}><option value="in_person">In person</option><option value="hybrid">Hybrid</option><option value="virtual">Virtual</option></select></label>
            <label>Status<select value={form.status} onChange={(event) => update("status", event.target.value as EventForm["status"])}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select></label>
            <label>Registration mode<select value={form.registrationMode} onChange={(event) => update("registrationMode", event.target.value as EventForm["registrationMode"])}><option value="manual_review">Manual review</option><option value="automatic">Automatic payment</option><option value="waitlist">Waitlist</option><option value="closed">Closed</option></select></label>
            <label>Starts<input type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} required /></label>
            <label>Ends<input type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} required /></label>
            <label>Timezone<input value={form.timezone} onChange={(event) => update("timezone", event.target.value)} required /></label>
            <label>Capacity<input type="number" min="1" value={form.capacity} onChange={(event) => update("capacity", event.target.value)} placeholder="Leave blank if unset" /></label>
            <label className="form-wide">Public summary<textarea value={form.summary} onChange={(event) => update("summary", event.target.value)} rows={4} maxLength={1000} /></label>
          </div>

          {form.format !== "virtual" ? <fieldset className="event-fieldset"><legend>Venue</legend><div className="form-grid">
            <label>Venue name<input value={form.venueName} onChange={(event) => update("venueName", event.target.value)} required /></label>
            <label>City<input value={form.city} onChange={(event) => update("city", event.target.value)} required /></label>
            <label>Country<input value={form.country} onChange={(event) => update("country", event.target.value)} required /></label>
            <label>Address<input value={form.addressLine} onChange={(event) => update("addressLine", event.target.value)} /></label>
            <label className="form-wide">Map URL<input type="url" value={form.mapUrl} onChange={(event) => update("mapUrl", event.target.value)} placeholder="https://maps.google.com/…" /></label>
          </div></fieldset> : null}

          {form.format !== "in_person" ? <fieldset className="event-fieldset"><legend>Private online access</legend><div className="form-grid"><label className="form-wide">Meeting or livestream URL<input type="url" value={form.onlineUrl} onChange={(event) => update("onlineUrl", event.target.value)} required /><small>Stored separately and never exposed by the public event API.</small></label></div></fieldset> : null}

          <label className="feature-event-control"><input type="checkbox" checked={form.isFeatured} onChange={(event) => update("isFeatured", event.target.checked)} /><span><strong>Feature on the landing page</strong><small>Synchronizes the public countdown. Draft events remain hidden.</small></span></label>
          <div className="event-form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving event…" : form.id ? "Save event" : "Create event"}</button><span>{form.status === "published" ? "Publishing makes public fields immediately visible." : "Drafts are visible only to authorized event administrators."}</span></div>
          {message ? <p className="manager-message" role="status">{message}</p> : null}
        </form>
      </div>
    </section>
  );
}
