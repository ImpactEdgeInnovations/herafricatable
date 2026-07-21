"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AdminEvent } from "@/components/admin/event-manager";

export type AdminSession = {
  description: string | null;
  ends_at: string;
  event_id: string;
  id: string;
  room: string | null;
  starts_at: string;
  status: "draft" | "published" | "cancelled";
  title: string;
};

export type AdminAnnouncement = {
  body: string;
  event_id: string;
  id: string;
  published_at: string | null;
  status: "draft" | "published" | "archived";
  title: string;
};

export type AdminSponsor = {
  event_id: string;
  id: string;
  is_published: boolean;
  logo_url: string | null;
  name: string;
  sort_order: number;
  tier: string | null;
  website_url: string | null;
};

type SpeakerLink = {
  session_id: string;
  event_speakers: { company: string | null; job_title: string | null; name: string } | null;
};

type EventStaff = { display_name: string | null; email: string; granted_at: string; user_id: string };
type Panel = "programme" | "announcements" | "sponsors" | "staff";

function localDateTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function defaultSession(event: AdminEvent) {
  const start = new Date(event.starts_at);
  const end = new Date(Math.min(start.getTime() + 60 * 60 * 1000, new Date(event.ends_at).getTime()));
  return { id: null as string | null, title: "", description: "", startsAt: localDateTime(start.toISOString()), endsAt: localDateTime(end.toISOString()), room: "", status: "draft" as AdminSession["status"], dayLabel: "", speakerName: "", speakerJobTitle: "", speakerCompany: "" };
}

const blankAnnouncement = { id: null as string | null, title: "", body: "", status: "draft" as AdminAnnouncement["status"] };
const blankSponsor = { id: null as string | null, name: "", tier: "", websiteUrl: "", logoUrl: "", isPublished: false, sortOrder: "0" };

export function EventContentManager({
  events,
  initialSessions,
  initialAnnouncements,
  initialSponsors,
  speakerLinks,
  isSuperAdmin,
}: {
  events: AdminEvent[];
  initialSessions: AdminSession[];
  initialAnnouncements: AdminAnnouncement[];
  initialSponsors: AdminSponsor[];
  speakerLinks: SpeakerLink[];
  isSuperAdmin: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [panel, setPanel] = useState<Panel>("programme");
  const selectedEvent = events.find((item) => item.id === eventId) ?? events[0];
  const [sessionForm, setSessionForm] = useState(() => selectedEvent ? defaultSession(selectedEvent) : null);
  const [announcementForm, setAnnouncementForm] = useState(blankAnnouncement);
  const [sponsorForm, setSponsorForm] = useState(blankSponsor);
  const [staffEmail, setStaffEmail] = useState("");
  const [staff, setStaff] = useState<EventStaff[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const sessions = initialSessions.filter((item) => item.event_id === eventId);
  const announcements = initialAnnouncements.filter((item) => item.event_id === eventId);
  const sponsors = initialSponsors.filter((item) => item.event_id === eventId);

  useEffect(() => {
    if (!isSuperAdmin || !eventId) return;
    let current = true;
    void supabase.rpc("list_event_staff", { p_event_id: eventId }).then(({ data, error }) => {
      if (!current) return;
      setStaff(error ? [] : ((data as EventStaff[] | null) ?? []));
    });
    return () => { current = false; };
  }, [eventId, isSuperAdmin, supabase]);

  function changeEvent(nextId: string) {
    const nextEvent = events.find((item) => item.id === nextId);
    setEventId(nextId);
    setSessionForm(nextEvent ? defaultSession(nextEvent) : null);
    setAnnouncementForm(blankAnnouncement);
    setSponsorForm(blankSponsor);
    setMessage("");
  }

  function speakerFor(sessionId: string) {
    return speakerLinks.find((link) => link.session_id === sessionId)?.event_speakers ?? null;
  }

  function handleError(error: { message: string } | null) {
    setBusy(false);
    if (!error) return false;
    setMessage(error.message.includes("schema cache") || error.message.includes("Could not find")
      ? "Apply 20260721200000_event_content_operations.sql in Supabase, then retry."
      : error.message);
    return true;
  }

  async function saveSession(event: FormEvent) {
    event.preventDefault();
    if (!sessionForm || !eventId) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("save_programme_session", {
      p_session_id: sessionForm.id,
      p_event_id: eventId,
      p_title: sessionForm.title,
      p_description: sessionForm.description,
      p_starts_at: new Date(sessionForm.startsAt).toISOString(),
      p_ends_at: new Date(sessionForm.endsAt).toISOString(),
      p_room: sessionForm.room,
      p_status: sessionForm.status,
      p_day_label: sessionForm.dayLabel,
      p_speaker_name: sessionForm.speakerName,
      p_speaker_job_title: sessionForm.speakerJobTitle,
      p_speaker_company: sessionForm.speakerCompany,
    });
    if (handleError(error)) return;
    setMessage("Programme session saved and audit logged.");
    setBusy(false);
    window.location.reload();
  }

  async function saveAnnouncement(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("save_event_announcement", {
      p_announcement_id: announcementForm.id,
      p_event_id: eventId,
      p_title: announcementForm.title,
      p_body: announcementForm.body,
      p_status: announcementForm.status,
    });
    if (handleError(error)) return;
    setMessage("Announcement saved and audit logged.");
    setBusy(false);
    window.location.reload();
  }

  async function saveSponsor(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("save_event_sponsor", {
      p_sponsor_id: sponsorForm.id,
      p_event_id: eventId,
      p_name: sponsorForm.name,
      p_tier: sponsorForm.tier,
      p_website_url: sponsorForm.websiteUrl,
      p_logo_url: sponsorForm.logoUrl,
      p_is_published: sponsorForm.isPublished,
      p_sort_order: Number(sponsorForm.sortOrder) || 0,
    });
    if (handleError(error)) return;
    setMessage("Partner saved and audit logged.");
    setBusy(false);
    window.location.reload();
  }

  async function changeStaff(email: string, action: "assign" | "remove") {
    if (!eventId) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.rpc("manage_event_staff", { p_action: action, p_event_id: eventId, p_staff_email: email });
    if (handleError(error)) return;
    const { data } = await supabase.rpc("list_event_staff", { p_event_id: eventId });
    setStaff((data as EventStaff[] | null) ?? []);
    setStaffEmail(""); setBusy(false);
    setMessage(action === "assign" ? "Event staff access assigned and audit logged." : "Event staff access removed and audit logged.");
  }

  if (!events.length || !selectedEvent || !sessionForm) {
    return <section className="admin-section" id="event-content"><div className="admin-empty"><strong>Create an event first</strong><p>Programme, announcements, partners, and staff scopes attach to an operational event.</p></div></section>;
  }

  return (
    <section className="admin-section event-content-manager" id="event-content" aria-labelledby="event-content-title">
      <div className="admin-section-heading">
        <div><p className="eyebrow">Event content CMS</p><h2 id="event-content-title">Programme and publishing</h2><p>Prepare content as drafts, publish deliberately, and keep staff access limited to an assigned event.</p></div>
        <label className="event-content-select">Working event<select value={eventId} onChange={(event) => changeEvent(event.target.value)}>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      </div>

      <div className="content-tabs" role="tablist" aria-label="Event content sections">
        {(["programme", "announcements", "sponsors"] as Panel[]).map((item) => <button className={panel === item ? "active" : ""} type="button" role="tab" aria-selected={panel === item} onClick={() => { setPanel(item); setMessage(""); }} key={item}>{item}</button>)}
        {isSuperAdmin ? <button className={panel === "staff" ? "active" : ""} type="button" role="tab" aria-selected={panel === "staff"} onClick={() => { setPanel("staff"); setMessage(""); }}>Staff access</button> : null}
      </div>

      {panel === "programme" ? <div className="content-workspace">
        <div className="content-record-list"><div><strong>{sessions.length} sessions</strong><button type="button" onClick={() => setSessionForm(defaultSession(selectedEvent))}>New session</button></div>{sessions.map((item) => { const speaker = speakerFor(item.id); return <button type="button" key={item.id} className={sessionForm.id === item.id ? "selected" : ""} onClick={() => setSessionForm({ id: item.id, title: item.title, description: item.description ?? "", startsAt: localDateTime(item.starts_at), endsAt: localDateTime(item.ends_at), room: item.room ?? "", status: item.status, dayLabel: "", speakerName: speaker?.name ?? "", speakerJobTitle: speaker?.job_title ?? "", speakerCompany: speaker?.company ?? "" })}><span>{item.title}</span><small>{item.status} · {new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: selectedEvent.timezone }).format(new Date(item.starts_at))}</small></button>; })}</div>
        <form className="content-editor" onSubmit={saveSession}><div className="form-grid">
          <label className="form-wide">Session title<input value={sessionForm.title} onChange={(e) => setSessionForm({ ...sessionForm, title: e.target.value })} required /></label>
          <label>Starts<input type="datetime-local" value={sessionForm.startsAt} onChange={(e) => setSessionForm({ ...sessionForm, startsAt: e.target.value })} required /></label>
          <label>Ends<input type="datetime-local" value={sessionForm.endsAt} onChange={(e) => setSessionForm({ ...sessionForm, endsAt: e.target.value })} required /></label>
          <label>Room or stage<input value={sessionForm.room} onChange={(e) => setSessionForm({ ...sessionForm, room: e.target.value })} /></label>
          <label>Status<select value={sessionForm.status} onChange={(e) => setSessionForm({ ...sessionForm, status: e.target.value as AdminSession["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></label>
          <label>Day label<input value={sessionForm.dayLabel} onChange={(e) => setSessionForm({ ...sessionForm, dayLabel: e.target.value })} placeholder="Generated from session date" /></label>
          <label className="form-wide">Description<textarea rows={3} value={sessionForm.description} onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })} /></label>
          <label>Speaker name<input value={sessionForm.speakerName} onChange={(e) => setSessionForm({ ...sessionForm, speakerName: e.target.value })} /></label>
          <label>Speaker title<input value={sessionForm.speakerJobTitle} onChange={(e) => setSessionForm({ ...sessionForm, speakerJobTitle: e.target.value })} /></label>
          <label className="form-wide">Speaker organization<input value={sessionForm.speakerCompany} onChange={(e) => setSessionForm({ ...sessionForm, speakerCompany: e.target.value })} /></label>
        </div><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save session"}</button></form>
      </div> : null}

      {panel === "announcements" ? <div className="content-workspace"><div className="content-record-list"><div><strong>{announcements.length} announcements</strong><button type="button" onClick={() => setAnnouncementForm(blankAnnouncement)}>New update</button></div>{announcements.map((item) => <button type="button" key={item.id} className={announcementForm.id === item.id ? "selected" : ""} onClick={() => setAnnouncementForm({ id: item.id, title: item.title, body: item.body, status: item.status })}><span>{item.title}</span><small>{item.status}</small></button>)}</div><form className="content-editor" onSubmit={saveAnnouncement}><div className="form-grid"><label className="form-wide">Title<input value={announcementForm.title} onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })} required /></label><label className="form-wide">Message<textarea rows={6} value={announcementForm.body} onChange={(e) => setAnnouncementForm({ ...announcementForm, body: e.target.value })} required /></label><label>Status<select value={announcementForm.status} onChange={(e) => setAnnouncementForm({ ...announcementForm, status: e.target.value as AdminAnnouncement["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label></div><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save announcement"}</button></form></div> : null}

      {panel === "sponsors" ? <div className="content-workspace"><div className="content-record-list"><div><strong>{sponsors.length} partners</strong><button type="button" onClick={() => setSponsorForm(blankSponsor)}>New partner</button></div>{sponsors.map((item) => <button type="button" key={item.id} className={sponsorForm.id === item.id ? "selected" : ""} onClick={() => setSponsorForm({ id: item.id, name: item.name, tier: item.tier ?? "", websiteUrl: item.website_url ?? "", logoUrl: item.logo_url ?? "", isPublished: item.is_published, sortOrder: String(item.sort_order) })}><span>{item.name}</span><small>{item.is_published ? "published" : "draft"} · {item.tier || "Partner"}</small></button>)}</div><form className="content-editor" onSubmit={saveSponsor}><div className="form-grid"><label>Sponsor name<input value={sponsorForm.name} onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })} required /></label><label>Tier<input value={sponsorForm.tier} onChange={(e) => setSponsorForm({ ...sponsorForm, tier: e.target.value })} placeholder="Founding partner" /></label><label className="form-wide">Website URL<input type="url" value={sponsorForm.websiteUrl} onChange={(e) => setSponsorForm({ ...sponsorForm, websiteUrl: e.target.value })} placeholder="https://…" /></label><label className="form-wide">Logo URL<input type="url" value={sponsorForm.logoUrl} onChange={(e) => setSponsorForm({ ...sponsorForm, logoUrl: e.target.value })} placeholder="https://…" /></label><label>Display order<input type="number" min="0" value={sponsorForm.sortOrder} onChange={(e) => setSponsorForm({ ...sponsorForm, sortOrder: e.target.value })} /></label><label className="publish-control"><input type="checkbox" checked={sponsorForm.isPublished} onChange={(e) => setSponsorForm({ ...sponsorForm, isPublished: e.target.checked })} /> Visible publicly</label></div><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save partner"}</button></form></div> : null}

      {panel === "staff" && isSuperAdmin ? <div className="staff-access-panel"><form onSubmit={(event) => { event.preventDefault(); void changeStaff(staffEmail, "assign"); }}><label>Existing account email<input type="email" value={staffEmail} onChange={(event) => setStaffEmail(event.target.value)} placeholder="staff@example.com" required /></label><button className="button button-primary" disabled={busy}>{busy ? "Assigning…" : "Assign to this event"}</button></form><div className="staff-access-list">{staff.length ? staff.map((item) => <article key={item.user_id}><div><strong>{item.display_name || item.email}</strong><span>{item.email}</span></div><button type="button" disabled={busy} onClick={() => void changeStaff(item.email, "remove")}>Remove access</button></article>) : <div className="admin-empty"><strong>No event staff assigned</strong><p>Assigned staff can manage this event only. They cannot create events or access member administration.</p></div>}</div></div> : null}

      {message ? <p className="manager-message content-manager-message" role="status">{message}</p> : null}
    </section>
  );
}
