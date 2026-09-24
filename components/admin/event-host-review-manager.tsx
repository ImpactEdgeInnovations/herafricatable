"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import type { AdminEvent } from "@/components/admin/event-manager";
import { useActionDialog } from "@/components/ui/action-dialog";

export type AdminEventHostWorkspace = {
  event_id: string;
  event_slug: string;
  event_title: string;
  event_status: string;
  starts_at: string;
  host_email: string;
  host_name: string | null;
  host_status: string;
  workspace_status: string;
  summary: string;
  arrival_info: string;
  programme: { title: string; description?: string; starts_at: string; ends_at: string; speaker_name?: string }[];
  partners: { name: string; website_url?: string }[];
  review_note: string | null;
  submitted_at: string | null;
};

export type EventHostReviewContext = {
  event_id: string;
  online_link_ready: boolean;
  safety_contact_name: string | null;
  safety_contact_phone: string | null;
};

export function EventHostReviewManager({ events, workspaces, migrationReady, lifecycleReady, reviewContexts, safetyContacts, safetyReady }: {
  events: AdminEvent[];
  workspaces: AdminEventHostWorkspace[];
  migrationReady: boolean;
  lifecycleReady: boolean;
  reviewContexts: EventHostReviewContext[];
  safetyContacts: { event_id: string; contact_name: string; contact_phone: string }[];
  safetyReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [eventId, setEventId] = useState(events.find((event) => ["draft", "published"].includes(event.status))?.id ?? "");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [contactDrafts, setContactDrafts] = useState<Record<string, { name: string; phone: string }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function assign() {
    if (!eventId || !email.trim()) return;
    const existing = workspaces.find((item) => item.event_id === eventId);
    if (existing && !lifecycleReady) {
      setMessage("Apply the Host pause and transfer migration before replacing an existing Host.");
      return;
    }
    if (!await ask({ title: existing ? "Replace this Event Host?" : "Give this member Host access?", description: existing ? `This ends ${existing.host_name || existing.host_email}'s Host access. The new Host inherits the private draft and must review and submit it again. Published content stays live until another approval.` : "This member will prepare this event privately. Guest lists and payments remain with the event team.", confirmLabel: existing ? "Replace Host" : "Assign Host" })) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("assign_event_host", { p_event_id: eventId, p_email: email.trim() });
    setBusy(false);
    setMessage(error ? adminErrorMessage(error, "assign the Event Host") : "Host assigned. Their private workspace is ready.");
    if (!error) { setEmail(""); router.refresh(); }
  }

  async function review(item: AdminEventHostWorkspace, action: "approve" | "request_changes") {
    const note = notes[item.event_id] ?? "";
    if (action === "approve" && (!safetyReady || !safetyContacts.some((entry) => entry.event_id === item.event_id))) {
      setMessage("Save the event safety contact before publishing this event.");
      return;
    }
    if (action === "request_changes" && note.trim().length < 10) {
      setMessage("Write at least 10 characters explaining what the Host should change.");
      return;
    }
    if (!await ask({
      title: action === "approve" ? `Publish ${item.event_title}?` : `Ask the Host to update ${item.event_title}?`,
      description: action === "approve"
        ? "The reviewed content goes live. If this event is a draft, guests will be able to discover and request places. Check venue, capacity, safety contact and private joining link before continuing."
        : "Your note will return the draft to the Host. The event stays as it is until you approve a revised draft.",
      confirmLabel: action === "approve" ? "Approve and publish" : "Send guidance",
    })) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("review_event_host_workspace", {
      p_event_id: item.event_id,
      p_action: action,
      p_note: note,
    });
    setBusy(false);
    setMessage(error ? adminErrorMessage(error, "review the Host draft") : action === "approve" ? "Reviewed content published." : "Your guidance was sent to the Host.");
    if (!error) router.refresh();
  }

  async function saveSafetyContact(item: AdminEventHostWorkspace) {
    if (!safetyReady) return;
    const existing = safetyContacts.find((entry) => entry.event_id === item.event_id);
    const draft = contactDrafts[item.event_id] ?? { name: existing?.contact_name ?? "", phone: existing?.contact_phone ?? "" };
    if (draft.name.trim().length < 2 || draft.phone.trim().length < 7) {
      setMessage("Add the full name and a reachable phone number for the event safety contact.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_event_safety_contact", {
      p_event_id: item.event_id,
      p_name: draft.name,
      p_phone: draft.phone,
    });
    setBusy(false);
    setMessage(error ? adminErrorMessage(error, "save the event safety contact") : "Safety contact saved privately for the event team.");
    if (!error) router.refresh();
  }

  async function changeHostStatus(item: AdminEventHostWorkspace) {
    if (!lifecycleReady) return;
    const pausing = item.host_status === "active";
    const result = await ask({
      title: pausing ? `Pause ${item.host_name || item.host_email}'s Host access?` : `Restore ${item.host_name || item.host_email}'s Host access?`,
      description: pausing
        ? "The Host immediately loses access to this private workspace. The event and any published guest information remain unchanged. You can restore or replace the Host later."
        : "The Host may return to this private workspace. You still make all publication decisions.",
      confirmLabel: pausing ? "Pause Host access" : "Restore Host access",
      tone: pausing ? "danger" : "default",
      fields: pausing ? [{ name: "reason", label: "Reason sent to the Host", type: "textarea", required: true, minLength: 10, maxLength: 500, placeholder: "Explain the pause clearly." }] : [],
    });
    if (!result) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_event_host_status", {
      p_event_id: item.event_id,
      p_status: pausing ? "paused" : "active",
      p_note: pausing ? String(result.reason ?? "") : "",
    });
    setBusy(false);
    setMessage(error ? adminErrorMessage(error, "change Host access") : pausing ? "Host access paused. The event itself is unchanged." : "Host access restored.");
    if (!error) router.refresh();
  }

  return <div className="focused-admin-tool">
    <section className="admin-section">
      <p className="eyebrow">Event Hosts</p>
      <h1>Prepare, review, then publish</h1>
      <p>Hosts can prepare event words, arrival notes, programme moments and partners. They cannot see guest lists, payments or check-in. You make the final publication decision.</p>
      {!migrationReady ? <p role="alert">Apply the scoped Event Host migration before using this workspace.</p> : null}
      {migrationReady && !lifecycleReady ? <p role="status">Host pause and safe replacement controls become available after the Host lifecycle migration.</p> : null}
      {migrationReady && !safetyReady ? <p role="alert">Apply the event safety contact migration before publishing Host-reviewed events.</p> : null}
    </section>
    {migrationReady ? <section className="admin-section">
      <h2>Give a member Host access</h2>
      <p>Choose an existing event and an active member’s email. Replacing a Host ends the former Host’s access.</p>
      <label>Event<select value={eventId} onChange={(event) => setEventId(event.target.value)}>{events.filter((event) => ["draft", "published"].includes(event.status)).map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></label>
      <label>Member email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
      <button className="button button-outline" type="button" disabled={busy || !eventId || !email.trim()} onClick={() => void assign()}>Assign Event Host</button>
    </section> : null}
    <section className="admin-section">
      <h2>Host drafts</h2>
      {workspaces.length === 0 ? <p>No Event Hosts have been assigned yet.</p> : workspaces.map((item) => {
        const event = events.find((candidate) => candidate.id === item.event_id);
        const context = reviewContexts.find((candidate) => candidate.event_id === item.event_id);
        const savedContact = safetyContacts.find((candidate) => candidate.event_id === item.event_id);
        const contact = contactDrafts[item.event_id] ?? { name: savedContact?.contact_name ?? context?.safety_contact_name ?? "", phone: savedContact?.contact_phone ?? context?.safety_contact_phone ?? "" };
        return <article className="admin-section" key={item.event_id}>
        <p className="eyebrow">{item.workspace_status.replaceAll("_", " ")} · {item.event_status}</p>
        <h3>{item.event_title}</h3>
        <p>Host: {item.host_name || item.host_email} · {item.host_email} · {item.host_status === "paused" ? "Access paused" : "Access active"}</p>
        {lifecycleReady ? <button className="button button-outline" type="button" disabled={busy} onClick={() => void changeHostStatus(item)}>{item.host_status === "paused" ? "Restore Host access" : "Pause Host access"}</button> : null}
        <p>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.starts_at))}</p>
        {item.workspace_status === "submitted" ? <div>
          <h4>Before you decide</h4>
          <dl>
            <div><dt>Format and capacity</dt><dd>{event?.format.replaceAll("_", " ") ?? "Not available"} · {event?.capacity ?? "No capacity set"} places</dd></div>
            <div><dt>Venue</dt><dd>{event?.venues ? `${event.venues.name}, ${event.venues.city}` : event?.format === "virtual" ? "Online" : "Venue missing"}</dd></div>
            {event?.format !== "in_person" ? <div><dt>Private online link</dt><dd>{context?.online_link_ready ? "Ready; shared privately with confirmed guests" : "Missing — add it before publishing"}</dd></div> : null}
            <div><dt>Guest requests</dt><dd>{event?.registration_mode.replaceAll("_", " ") ?? "Not available"}</dd></div>
            <div><dt>Safety contact</dt><dd>{savedContact ? `${savedContact.contact_name} · ${savedContact.contact_phone}` : "Not saved for this event yet"}</dd></div>
          </dl>
          {safetyReady ? <div className="admin-section">
            <h4>On-the-day safety contact</h4>
            <p>Private to the event team. Save a reachable person before publication.</p>
            <label>Name<input maxLength={120} value={contact.name} onChange={(event) => setContactDrafts((all) => ({ ...all, [item.event_id]: { ...contact, name: event.target.value } }))} /></label>
            <label>Phone<input maxLength={40} type="tel" value={contact.phone} onChange={(event) => setContactDrafts((all) => ({ ...all, [item.event_id]: { ...contact, phone: event.target.value } }))} /></label>
            <button className="button button-outline" disabled={busy} onClick={() => void saveSafetyContact(item)} type="button">Save safety contact</button>
          </div> : null}
          <Link href="/admin/events?view=edit">Review event details</Link>
          <h4>Event introduction</h4><p>{item.summary}</p>
          <h4>Arrival details</h4><p>{item.arrival_info}</p>
          <h4>Programme</h4><ul>{item.programme.map((entry, index) => <li key={index}><strong>{entry.title}</strong> · {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.starts_at))}{entry.speaker_name ? ` · ${entry.speaker_name}` : ""}<p>{entry.description}</p></li>)}</ul>
          <h4>Partners</h4>{item.partners.length ? <ul>{item.partners.map((entry, index) => <li key={index}>{entry.name}{entry.website_url ? ` · ${entry.website_url}` : ""}</li>)}</ul> : <p>None listed.</p>}
          <label>Note to Host<textarea rows={3} value={notes[item.event_id] ?? ""} onChange={(event) => setNotes((all) => ({ ...all, [item.event_id]: event.target.value }))} placeholder="Explain what needs to change, if anything." /></label>
          <div className="portal-actions"><button className="button button-primary" type="button" disabled={busy || item.host_status !== "active" || !safetyReady || !savedContact} onClick={() => void review(item, "approve")}>Approve and publish</button><button className="button button-outline" type="button" disabled={busy || item.host_status !== "active"} onClick={() => void review(item, "request_changes")}>Ask for changes</button></div>
        </div> : item.review_note ? <p>Last review note: {item.review_note}</p> : null}
        {item.event_status === "published" ? <Link href={`/events/${item.event_slug}`}>View public page</Link> : null}
      </article>})}
    </section>
    {message ? <p className="manager-message" role="status">{message}</p> : null}
    {dialog}
  </div>;
}
