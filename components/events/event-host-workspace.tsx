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

export type EventHostCover = {
  draft_storage_path: string;
  draft_alt_text: string;
  published_storage_path: string | null;
  draft_url: string | null;
  published_url: string | null;
};

function localDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function EventHostWorkspace({ initial, cover, coverReady }: { initial: EventHostWorkspaceRow; cover: EventHostCover | null; coverReady: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [summary, setSummary] = useState(initial.summary);
  const [arrivalInfo, setArrivalInfo] = useState(initial.arrival_info);
  const [programme, setProgramme] = useState<HostProgrammeItem[]>(initial.programme ?? []);
  const [partners, setPartners] = useState(initial.partners ?? []);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverAlt, setCoverAlt] = useState(cover?.draft_alt_text ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const locked = initial.workspace_status === "submitted";

  function updateProgramme(key: string, field: keyof HostProgrammeItem, value: string) {
    setProgramme((items) => items.map((item) => item.key === key ? { ...item, [field]: value } : item));
  }

  async function uploadCover() {
    if (!coverFile) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(coverFile.type) || coverFile.size > 6 * 1024 * 1024) {
      setMessage("Choose a JPG, PNG or WebP image smaller than 6 MB.");
      return;
    }
    if (coverAlt.trim().length < 10 || coverAlt.trim().length > 240) {
      setMessage("Describe the image in 10 to 240 characters so everyone can understand it.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusy(false); setMessage("Please sign in again before uploading."); return; }
    const extension = coverFile.type === "image/png" ? "png" : coverFile.type === "image/webp" ? "webp" : "jpg";
    const path = `${initial.event_id}/${auth.user.id}/${crypto.randomUUID()}.${extension}`;
    const uploaded = await supabase.storage.from("event-host-covers").upload(path, coverFile, {
      cacheControl: "3600", contentType: coverFile.type, upsert: false,
    });
    if (uploaded.error) {
      setBusy(false);
      setMessage(memberErrorMessage(uploaded.error, "upload the event image"));
      return;
    }
    const saved = await supabase.rpc("save_event_host_cover", {
      p_event_id: initial.event_id, p_storage_path: path, p_alt_text: coverAlt.trim(),
    });
    if (saved.error) {
      await supabase.storage.from("event-host-covers").remove([path]);
      setBusy(false);
      setMessage(memberErrorMessage(saved.error, "save the event image"));
      return;
    }
    if (cover?.draft_storage_path && cover.draft_storage_path !== cover.published_storage_path) {
      await supabase.storage.from("event-host-covers").remove([cover.draft_storage_path]);
    }
    setCoverFile(null);
    setBusy(false);
    setMessage("Image saved privately. Send your event to the team for review before it appears to guests.");
    router.refresh();
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
        <p className="form-hint">For online or hybrid events, the event team adds the private joining link in Event details. Please keep all links out of these public notes.</p>
      </div>

      <div className="admin-section">
        <h2>Event image</h2>
        <p>One clear image helps guests recognise your gathering. Only the event team can approve it. A previously approved image stays live while a replacement is reviewed.</p>
        {!coverReady ? <p role="status">Event image uploads will be available after the latest database update.</p> : <>
          {cover?.draft_url ? <figure className="event-host-cover-preview"><img src={cover.draft_url} alt={cover.draft_alt_text} /><figcaption>{cover.draft_storage_path === cover.published_storage_path ? "Live image" : "Private image awaiting review"}</figcaption></figure> : <p>No image added yet. You can still send your draft without one.</p>}
          {cover?.published_url && cover.draft_storage_path !== cover.published_storage_path ? <p>The last approved image remains on the public event page until this one is approved.</p> : null}
          {!locked ? <div className="event-host-cover-controls">
            <label htmlFor="host-cover-file">Choose an image (JPG, PNG or WebP, under 6 MB)</label>
            <input id="host-cover-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
            <label htmlFor="host-cover-alt">Describe what the image shows</label>
            <input id="host-cover-alt" value={coverAlt} maxLength={240} disabled={busy} onChange={(event) => setCoverAlt(event.target.value)} placeholder="Women gathered around a table in Nairobi" />
            <button className="button button-outline" type="button" disabled={busy || !coverFile} onClick={() => void uploadCover()}>Save image privately</button>
          </div> : null}
        </>}
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
