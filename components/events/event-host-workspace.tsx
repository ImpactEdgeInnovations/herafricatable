"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type HostProgrammeItem = {
  key: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  room: string;
  speaker_name: string;
};

export type EventHostWorkspaceRow = {
  event_id: string;
  event_slug: string;
  event_title: string;
  event_status: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  workspace_status: string;
  summary: string;
  arrival_info: string;
  programme: HostProgrammeItem[];
  partners: { key: string; name: string; tier: string; website_url: string; logo_url: string }[];
  review_note: string | null;
};

function localDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function EventHostWorkspace({ initial }: { initial: EventHostWorkspaceRow }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState(initial.summary);
  const [arrivalInfo, setArrivalInfo] = useState(initial.arrival_info);
  const [programme, setProgramme] = useState<HostProgrammeItem[]>(initial.programme ?? []);
  const [partners, setPartners] = useState(initial.partners ?? []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = initial.workspace_status === "submitted";

  function updateProgramme(key: string, field: keyof HostProgrammeItem, value: string) {
    setProgramme((items) => items.map((item) => item.key === key ? { ...item, [field]: value } : item));
  }

  async function save(sendForReview: boolean) {
    setMessage("");
    if (sendForReview && (summary.trim().length < 40 || arrivalInfo.trim().length < 20 || programme.length === 0)) {
      setMessage("Please add a clear event introduction, arrival details and at least one programme item.");
      return;
    }
    if (programme.some((item) => !item.title.trim() || !item.starts_at || !item.ends_at || Number.isNaN(new Date(item.starts_at).getTime()) || Number.isNaN(new Date(item.ends_at).getTime()))) {
      setMessage("Each programme item needs a title, start time and end time.");
      return;
    }
    setBusy(true);
    const payload = programme.map((item) => ({
      ...item,
      starts_at: new Date(item.starts_at).toISOString(),
      ends_at: new Date(item.ends_at).toISOString(),
    }));
    const saved = await supabase.rpc("save_event_host_workspace", {
      p_event_id: initial.event_id,
      p_summary: summary,
      p_arrival_info: arrivalInfo,
      p_programme: payload,
      p_partners: partners,
    });
    if (saved.error) {
      setBusy(false);
      setMessage(memberErrorMessage(saved.error, "save your event draft"));
      return;
    }
    if (sendForReview) {
      const sent = await supabase.rpc("submit_event_host_workspace", { p_event_id: initial.event_id });
      if (sent.error) {
        setBusy(false);
        setMessage(memberErrorMessage(sent.error, "send your event for review"));
        router.refresh();
        return;
      }
    }
    setBusy(false);
    setMessage(sendForReview ? "Sent to the event team for review. Your changes are not public yet." : "Draft saved privately.");
    router.refresh();
  }

  return (
    <section className="focused-admin-tool" aria-labelledby="host-workspace-heading">
      <div className="admin-section">
        <p className="eyebrow">Your event</p>
        <h1 id="host-workspace-heading">{initial.event_title}</h1>
        <p>Prepare the words and programme guests will see. The Her Africa Table team reviews every change before it goes live.</p>
        <p><strong>{initial.workspace_status === "submitted" ? "With the event team" : initial.workspace_status === "changes_requested" ? "Changes requested" : initial.workspace_status === "approved" ? "Published" : "Private draft"}</strong> · {new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: initial.timezone }).format(new Date(initial.starts_at))}</p>
        {initial.review_note ? <p role="status"><strong>From the event team:</strong> {initial.review_note}</p> : null}
        {initial.event_status === "published" ? <Link href={`/events/${initial.event_slug}`}>View public event</Link> : null}
      </div>

      <div className="admin-section">
        <h2>Introduce the gathering</h2>
        <label htmlFor="host-summary">What is this gathering about?</label>
        <textarea id="host-summary" value={summary} disabled={locked || busy} maxLength={2000} rows={5} onChange={(event) => setSummary(event.target.value)} />
        <label htmlFor="host-arrival">What should guests know before they arrive?</label>
        <textarea id="host-arrival" value={arrivalInfo} disabled={locked || busy} maxLength={2000} rows={4} onChange={(event) => setArrivalInfo(event.target.value)} placeholder="Arrival time, what to bring and any useful access information. Do not include a private online link here." />
      </div>

      <div className="admin-section">
        <h2>Programme</h2>
        <p>Add the moments guests can look forward to. Times below follow your device’s local timezone; the event page displays them in {initial.timezone}.</p>
        {programme.map((item, index) => <fieldset key={item.key} className="admin-section">
          <legend>Moment {index + 1}</legend>
          <label>Title<input value={item.title} maxLength={160} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "title", event.target.value)} /></label>
          <label>Starts<input type="datetime-local" value={localDateTime(item.starts_at)} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "starts_at", event.target.value)} /></label>
          <label>Ends<input type="datetime-local" value={localDateTime(item.ends_at)} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "ends_at", event.target.value)} /></label>
          <label>Speaker, if confirmed<input value={item.speaker_name ?? ""} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "speaker_name", event.target.value)} /></label>
          <label>A few words about this moment<textarea rows={2} value={item.description ?? ""} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "description", event.target.value)} /></label>
          {!locked ? <button className="button button-outline" type="button" disabled={busy} onClick={() => setProgramme((items) => items.filter((entry) => entry.key !== item.key))}>Remove moment</button> : null}
        </fieldset>)}
        {!locked ? <button className="button button-outline" type="button" disabled={busy || programme.length >= 30} onClick={() => setProgramme((items) => [...items, { key: crypto.randomUUID(), title: "", description: "", starts_at: initial.starts_at, ends_at: initial.ends_at, room: "", speaker_name: "" }])}>Add a programme moment</button> : null}
      </div>

      <div className="admin-section">
        <h2>Partners</h2>
        <p>Only list partners who have agreed to be named. The event team will review them before publication.</p>
        {partners.map((partner) => <div key={partner.key} className="admin-section">
          <label>Name<input value={partner.name} disabled={locked || busy} onChange={(event) => setPartners((items) => items.map((item) => item.key === partner.key ? { ...item, name: event.target.value } : item))} /></label>
          <label>Website (optional)<input type="url" value={partner.website_url ?? ""} disabled={locked || busy} onChange={(event) => setPartners((items) => items.map((item) => item.key === partner.key ? { ...item, website_url: event.target.value } : item))} /></label>
          {!locked ? <button className="button button-outline" type="button" disabled={busy} onClick={() => setPartners((items) => items.filter((item) => item.key !== partner.key))}>Remove partner</button> : null}
        </div>)}
        {!locked ? <button className="button button-outline" type="button" disabled={busy || partners.length >= 20} onClick={() => setPartners((items) => [...items, { key: crypto.randomUUID(), name: "", tier: "", website_url: "", logo_url: "" }])}>Add a partner</button> : null}
      </div>

      {!locked ? <div className="admin-section portal-actions"><button className="button button-outline" disabled={busy} onClick={() => void save(false)} type="button">Save private draft</button><button className="button button-primary" disabled={busy} onClick={() => void save(true)} type="button">Send to event team</button></div> : null}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );
}
