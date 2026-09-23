"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import type { AdminEvent } from "@/components/admin/event-manager";

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

export function EventHostReviewManager({ events, workspaces, migrationReady }: {
  events: AdminEvent[];
  workspaces: AdminEventHostWorkspace[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function assign() {
    if (!eventId || !email.trim()) return;
    if (!window.confirm("Give this member private Host access to the selected event? This replaces any existing Host.")) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("assign_event_host", { p_event_id: eventId, p_email: email.trim() });
    setBusy(false);
    setMessage(error ? adminErrorMessage(error, "assign the Event Host") : "Host assigned. Their private workspace is ready.");
    if (!error) { setEmail(""); router.refresh(); }
  }

  async function review(item: AdminEventHostWorkspace, action: "approve" | "request_changes") {
    const note = notes[item.event_id] ?? "";
    if (action === "request_changes" && note.trim().length < 10) {
      setMessage("Write at least 10 characters explaining what the Host should change.");
      return;
    }
    if (!window.confirm(action === "approve"
      ? `Approve ${item.event_title}? This publishes the reviewed content and may make a draft event public.`
      : `Send ${item.event_title} back to its Host with your note?`)) return;
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

  return <div className="focused-admin-tool">
    <section className="admin-section">
      <p className="eyebrow">Event Hosts</p>
      <h1>Prepare, review, then publish</h1>
      <p>Hosts can prepare event words, arrival notes, programme moments and partners. They cannot see guest lists, payments or check-in. You make the final publication decision.</p>
      {!migrationReady ? <p role="alert">Apply the scoped Event Host migration before using this workspace.</p> : null}
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
      {workspaces.length === 0 ? <p>No Event Hosts have been assigned yet.</p> : workspaces.map((item) => <article className="admin-section" key={item.event_id}>
        <p className="eyebrow">{item.workspace_status.replaceAll("_", " ")} · {item.event_status}</p>
        <h3>{item.event_title}</h3>
        <p>Host: {item.host_name || item.host_email} · {item.host_email}</p>
        <p>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.starts_at))}</p>
        {item.workspace_status === "submitted" ? <div>
          <h4>Event introduction</h4><p>{item.summary}</p>
          <h4>Arrival details</h4><p>{item.arrival_info}</p>
          <h4>Programme</h4><ul>{item.programme.map((entry, index) => <li key={index}><strong>{entry.title}</strong> · {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.starts_at))}{entry.speaker_name ? ` · ${entry.speaker_name}` : ""}<p>{entry.description}</p></li>)}</ul>
          <h4>Partners</h4>{item.partners.length ? <ul>{item.partners.map((entry, index) => <li key={index}>{entry.name}{entry.website_url ? ` · ${entry.website_url}` : ""}</li>)}</ul> : <p>None listed.</p>}
          <label>Note to Host<textarea rows={3} value={notes[item.event_id] ?? ""} onChange={(event) => setNotes((all) => ({ ...all, [item.event_id]: event.target.value }))} placeholder="Explain what needs to change, if anything." /></label>
          <div className="portal-actions"><button className="button button-primary" type="button" disabled={busy} onClick={() => void review(item, "approve")}>Approve and publish</button><button className="button button-outline" type="button" disabled={busy} onClick={() => void review(item, "request_changes")}>Ask for changes</button></div>
        </div> : item.review_note ? <p>Last review note: {item.review_note}</p> : null}
        {item.event_status === "published" ? <Link href={`/events/${item.event_slug}`}>View public page</Link> : null}
      </article>)}
    </section>
    {message ? <p className="manager-message" role="status">{message}</p> : null}
  </div>;
}
