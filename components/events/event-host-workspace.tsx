"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { formatEventTimeInput, parseEventTimeInput } from "@/lib/events/zoned-datetime";
import { EventHostPublicDetails } from "@/components/events/event-host-public-details";
import { useCommunityDraft } from "@/lib/use-community-draft";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityFileGuard } from "@/lib/use-community-file-guard";
import { useActionDialog } from "@/components/ui/action-dialog";
import { saveHostPoster } from "@/lib/events/save-host-poster";

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

export type EventHostOutcomes = {
  report_ready: boolean;
  confirmed_places: number | null;
  checked_in: number | null;
  feedback_responses: number | null;
  community_interest: number | null;
  accepted_introductions: number | null;
};

export type EventHostCommunity = {
  community_id: string;
  community_name: string;
  community_slug: string;
  community_status: "draft" | "published";
  public_preview_enabled: boolean;
  linked_to_event: boolean;
  can_select: boolean;
};

export function EventHostWorkspace({ currentUserId, initial, cover, coverReady, outcomes, communities, communityLinksReady, selfPublish = false }: { currentUserId: string; initial: EventHostWorkspaceRow; cover: EventHostCover | null; coverReady: boolean; outcomes: EventHostOutcomes | null; communities: EventHostCommunity[]; communityLinksReady: boolean; selfPublish?: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const initialDraft = { summary: initial.summary, arrivalInfo: initial.arrival_info, programme:
    (initial.programme ?? []).map((item) => ({
      ...item,
      starts_at: formatEventTimeInput(item.starts_at, initial.timezone),
      ends_at: formatEventTimeInput(item.ends_at, initial.timezone),
    })), partners: initial.partners ?? [] };
  const [draft,setDraft,clearDraft,restoredDraft] = useCommunityDraft(communityDraftKey(currentUserId,"event-host",initial.event_id),initialDraft);
  const [savedDraft,setSavedDraft] = useState(initialDraft);
  const {summary,arrivalInfo,programme,partners} = draft;
  const dirty = JSON.stringify(draft)!==JSON.stringify(savedDraft);
  const setSummary=(value:string)=>setDraft(current=>({...current,summary:value}));
  const setArrivalInfo=(value:string)=>setDraft(current=>({...current,arrivalInfo:value}));
  const setProgramme=(next:HostProgrammeItem[]|((items:HostProgrammeItem[])=>HostProgrammeItem[]))=>setDraft(current=>({...current,programme:typeof next==="function"?next(current.programme):next}));
  const setPartners=(next:typeof initial.partners|((items:typeof initial.partners)=>typeof initial.partners))=>setDraft(current=>({...current,partners:typeof next==="function"?next(current.partners):next}));
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverAlt, setCoverAlt] = useState(cover?.draft_alt_text ?? "");
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<"draft" | "publish" | "image" | "community" | null>(null);
  const [message, setMessage] = useState("");
  const [chosenCommunity, setChosenCommunity] = useState("");
  const [section, setSection] = useState("introduction");
  const [coverPreview,setCoverPreview] = useState<string|null>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const {ask,dialog} = useActionDialog();
  useEffect(()=>{
    if(!coverFile){setCoverPreview(null);return;}
    const url=URL.createObjectURL(coverFile);setCoverPreview(url);
    return()=>URL.revokeObjectURL(url);
  },[coverFile]);
  useCommunityFileGuard(Boolean(coverFile),{ask,busy,discard:()=>{setCoverFile(null);if(coverInput.current)coverInput.current.value="";},blocked:()=>setMessage("Please wait for your poster to finish saving.")});
  useEffect(() => {
    const openLinkedSection = () => {
      const linked = window.location.hash.replace("#host-", "");
      if (["introduction", "image", "programme", "community", "partners", "host"].includes(linked)) setSection(linked);
    };
    openLinkedSection();
    window.addEventListener("hashchange", openLinkedSection);
    return () => window.removeEventListener("hashchange", openLinkedSection);
  }, []);
  const hasEnded = new Date(initial.ends_at).getTime() < Date.now();
  const locked = initial.workspace_status === "submitted" || hasEnded;
  const linkedCommunity = communities.find((community) => community.linked_to_event);
  const primarySections = [["introduction", "Event details"], ["image", "Poster"], ["programme", "Schedule"]];
  const optionalSections = [["host", "Host details"], ["community", "Community"], ["partners", "Partners"]];
  function chooseSection(next: string) { if (busy) return; setSection(next); setMessage(""); }

  async function linkCommunity() {
    if (!chosenCommunity || busy) return;
    setBusy(true);
    setBusyAction("community");
    setMessage("");
    try {
      const {error}=await supabase.rpc("link_my_host_event_community",{p_event_id:initial.event_id,p_community_id:chosenCommunity});
      if(error)throw error;
      setMessage("Community connected. Guests will see it when its public page is ready.");router.refresh();
    } catch(error){setMessage(memberErrorMessage(error,"connect your Community"));}
    finally{setBusy(false);setBusyAction(null);}
  }

  function updateProgramme(key: string, field: keyof HostProgrammeItem, value: string) {
    setProgramme((items) => items.map((item) => item.key === key ? { ...item, [field]: value } : item));
  }

  async function uploadCover() {
    if (!coverFile || busy) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(coverFile.type) || coverFile.size > 6 * 1024 * 1024) {
      setMessage("Choose a JPG, PNG or WebP image smaller than 6 MB.");
      return;
    }
    if (coverAlt.trim().length < 10 || coverAlt.trim().length > 240) {
      setMessage("Describe the image in 10 to 240 characters so everyone can understand it.");
      return;
    }
    setBusy(true);
    setBusyAction("image");
    setMessage("");
    try {
      const {data:auth}=await supabase.auth.getUser();
      if(!auth.user)throw new Error("Please sign in again before uploading.");
      const extension=coverFile.type==="image/png"?"png":coverFile.type==="image/webp"?"webp":"jpg";
      const path=`${initial.event_id}/${auth.user.id}/${crypto.randomUUID()}.${extension}`;
      const result=await saveHostPoster(supabase,{eventId:initial.event_id,path,file:coverFile,alt:coverAlt.trim(),previousDraft:cover?.draft_storage_path??null,previousPublished:cover?.published_storage_path??null});
      setCoverFile(null);if(coverInput.current)coverInput.current.value="";
      setMessage((result.status==="live"?"Poster saved and visible to guests.":result.status==="private"?"Poster saved privately. Send your event to the team for review before it appears to guests.":"Your poster was saved. Reopen this tab to check its latest display status.")+(result.cleanupPending?" Your saved poster is safe, but the team may need to clear the previous private image.":""));
      router.refresh();
    }catch(error){setMessage(memberErrorMessage(error,"save the event image"));}
    finally{setBusy(false);setBusyAction(null);}
  }

  async function save(sendForReview: boolean) {
    if(busy)return;
    setMessage("");
    if (sendForReview && (summary.trim().length < 40 || arrivalInfo.trim().length < 20 || programme.length === 0)) {
      setMessage("Please add a clear event introduction, arrival details and at least one programme item.");
      return;
    }
    if (programme.some((item) => !item.title.trim() || !item.starts_at || !item.ends_at)) {
      setMessage("Each programme item needs a title, start time and end time.");
      return;
    }
    let payload: HostProgrammeItem[];
    try {
      payload = programme.map((item) => ({
        ...item,
        starts_at: parseEventTimeInput(item.starts_at, initial.timezone),
        ends_at: parseEventTimeInput(item.ends_at, initial.timezone),
      }));
    } catch {
      setMessage("Check each programme time. Use the event's timezone shown below.");
      return;
    }
    if (payload.some((item) => new Date(item.ends_at).getTime() <= new Date(item.starts_at).getTime())) {
      setMessage("Each programme moment must end after it starts.");
      return;
    }
    setBusy(true);
    setBusyAction(sendForReview ? "publish" : "draft");
    let savedPrivately=false;
    try {
      const saved=await supabase.rpc("save_event_host_workspace",{p_event_id:initial.event_id,p_summary:summary,p_arrival_info:arrivalInfo,p_programme:payload,p_partners:partners});
      if(saved.error)throw saved.error;
      savedPrivately=true;setSavedDraft(draft);clearDraft(draft);
      if(sendForReview){const sent=await supabase.rpc(selfPublish?"publish_my_pilot_event_updates":"submit_event_host_workspace",{p_event_id:initial.event_id});if(sent.error)throw sent.error;}
      setMessage(sendForReview?selfPublish?"Your changes are live. Open the guest view to see them.":"Sent to the event team for review. Your changes are not public yet.":"Draft saved privately.");router.refresh();
    }catch(error){setMessage(`${savedPrivately?"Your draft was saved. ":""}${memberErrorMessage(error,savedPrivately?"publish these changes":"save your event draft")}`);}
    finally{setBusy(false);setBusyAction(null);}
  }

  function communityPanel() {
    return <div className="host-workspace-panel" id="host-community" hidden={!hasEnded && section !== "community"}>
      <div className="host-workspace-panel-heading"><div><h2>Related Community</h2><p>Optional. Choose a Community you own, or start one first.</p></div></div>
      <p>The same Community can connect to this event and future events. Guests choose whether to join.</p>
      {!communityLinksReady ? <p role="status">Community linking will be available after the latest database update.</p>
        : linkedCommunity ? <div className="host-workspace-community-choice"><strong>{linkedCommunity.community_name}</strong><span>{linkedCommunity.community_status === "published" && linkedCommunity.public_preview_enabled ? "Visible to guests" : "Linked privately; guests will see it when its public page is ready"}</span><Link href={`/communities/${linkedCommunity.community_slug}`}>Open Community</Link></div>
        : <div className="host-workspace-community-choice">
            <p>You do not need a Community to run this event. Would you like to connect one?</p>
            {communities.some((community) => community.can_select) ? <><label htmlFor="host-community-select">Choose a Community you own</label><select id="host-community-select" value={chosenCommunity} disabled={busy} onChange={(event) => setChosenCommunity(event.target.value)}><option value="">Choose a Community</option>{communities.filter((community) => community.can_select).map((community) => <option key={community.community_id} value={community.community_id}>{community.community_name}{community.community_status === "draft" ? " (being prepared)" : ""}</option>)}</select><button className="button button-primary" type="button" disabled={busy || !chosenCommunity} onClick={() => void linkCommunity()}>{busyAction === "community" ? "Connecting…" : "Connect to this event"}</button></> : null}
            <Link className="button button-outline" href="/communities#create-community">Start a new Community</Link>
            <p className="form-hint">Start the Community, then come back here to connect it. A private Community will not appear on the guest page until its public page is approved.</p>
          </div>}
    </div>;
  }

  if (hasEnded) return (
    <section className="host-workspace" aria-labelledby="host-workspace-heading">
      <div className="host-workspace-panel">
        <p className="eyebrow">After your event</p>
        <h1 id="host-workspace-heading">{initial.event_title}</h1>
        <p>Your event details are now read-only. You can still connect a Community for future gatherings. The team reviews and publishes the public recap; private guest feedback stays with the event team.</p>
        <Link className="button button-outline" href={`/events/${initial.event_slug}`}>View event page</Link>
      </div>
      <div className="host-workspace-panel">
        <p className="eyebrow">The group picture</p>
        <h2>How the gathering went</h2>
        {!outcomes ? <p role="status">The after-event report is not available yet. Your event details and guest records have not changed.</p>
          : !outcomes.report_ready ? <p role="status">Group figures will appear when at least five real guests have checked in. Test accounts are not counted.</p>
          : <>
            <div className="feedback-admin-metrics">
              <article><strong>{outcomes.confirmed_places ?? "Under 5"}</strong><span>Confirmed places</span></article>
              <article><strong>{outcomes.checked_in ?? "Under 5"}</strong><span>Guests checked in</span></article>
              <article><strong>{outcomes.feedback_responses ?? "Under 5"}</strong><span>Private responses received</span></article>
              <article><strong>{outcomes.community_interest ?? "Under 5"}</strong><span>Asked about a future Community</span></article>
              <article><strong>{outcomes.accepted_introductions ?? "Under 5"}</strong><span>Introductions accepted</span></article>
            </div>
            <p className="form-hint">A figure under five is hidden to protect individual choices. These totals exclude test accounts and do not identify any guest. An accepted introduction is not a confirmed ongoing connection.</p>
          </>}
      </div>
      {communityPanel()}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );

  return (
    <section className="host-workspace" aria-labelledby="host-workspace-heading">
      <header className="host-workspace-hero">
        <p className="eyebrow">Your event</p>
        <h1 id="host-workspace-heading">{initial.event_title}</h1>
        <p className="host-workspace-intro">{selfPublish ? "Your event is public. Save privately while you prepare, then publish your changes when ready." : initial.event_status === "published" ? "Your event is public. Prepare changes here, then send them to the team to publish." : "Prepare the details guests will see when your event opens."}</p>
        <div className="host-workspace-status"><span className="host-workspace-state">{initial.event_status === "published" ? "Event is public" : "Event is private"}</span><span>{initial.workspace_status === "submitted" ? "Updates with the team" : initial.workspace_status === "changes_requested" ? "Updates need changes" : initial.workspace_status === "approved" ? "Latest updates are live" : "Updates not published yet"}</span></div>
        <p className="host-workspace-date">{new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: initial.timezone }).format(new Date(initial.starts_at))}</p>
        {initial.review_note ? <p className="host-workspace-review-note" role="status"><strong>From the event team:</strong> {initial.review_note}</p> : null}
        <div className="host-workspace-top-actions">{initial.event_status === "published" ? <><Link className="button button-outline" href={`/events/${initial.event_slug}`}>View guest page</Link><a className="button button-outline" href="#host-invites">Invite people</a><details><summary>More event tools</summary><Link href={`/events/${initial.event_slug}/rounds/host`}>Plan table conversations</Link></details></> : null}</div>
      </header>

      <nav className="host-workspace-nav" aria-label="Event preparation sections">
        <div className="host-workspace-primary-tabs">{primarySections.map(([key, label]) => <button key={key} type="button" disabled={busy} aria-pressed={section === key} aria-controls={`host-${key}`} onClick={() => chooseSection(key)}>{label}</button>)}</div>
        <label className="host-workspace-more"><span>More</span><select aria-label="More event sections" disabled={busy} value={optionalSections.some(([key]) => key === section) ? section : ""} onChange={event => { if(event.target.value) chooseSection(event.target.value); }}><option value="">Choose a section</option>{optionalSections.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </nav>

      {dirty && !locked ? <div className="host-workspace-draft-note" role="status"><span>{restoredDraft ? "Your unfinished changes are back." : "You have unsaved changes."} Text stays in this tab until you save, discard or sign out.</span><button type="button" disabled={busy} onClick={()=>clearDraft(savedDraft)}>Discard text changes</button></div> : null}

      {section === "host" ? <div className="host-workspace-panel" id="host-host"><EventHostPublicDetails eventId={initial.event_id} currentUserId={currentUserId}/></div> : null}

      <div className="host-workspace-panel" id="host-introduction" hidden={section !== "introduction"}>
        <div className="host-workspace-panel-heading"><div><h2>Event details</h2><p>Tell guests what to expect and how to arrive.</p></div></div>
        <label htmlFor="host-summary">What is this gathering about?</label>
        <textarea id="host-summary" value={summary} disabled={locked || busy} maxLength={2000} rows={5} onChange={(event) => setSummary(event.target.value)} />
        <label htmlFor="host-arrival">What should guests know before they arrive?</label>
        <textarea id="host-arrival" value={arrivalInfo} disabled={locked || busy} maxLength={2000} rows={4} onChange={(event) => setArrivalInfo(event.target.value)} placeholder="Arrival time, what to bring and any useful access information. Do not include a private online link here." />
        <p className="form-hint">For online or hybrid events, the event team adds the private joining link in Event details. Please keep all links out of these public notes.</p>
      </div>

      <div className="host-workspace-panel" id="host-image" hidden={section !== "image"}>
        <div className="host-workspace-panel-heading"><div><h2>Event poster</h2><p>One optional image for your event page and event listing.</p></div></div>
        <p>{selfPublish ? "Choose an image you have permission to share. It will appear on your event page when saved." : "One clear image helps guests recognise your gathering. A previous image stays live while the team reviews its replacement."}</p>
        {!coverReady ? <p role="status">Event image uploads will be available after the latest database update.</p> : <>
          {coverPreview ? <figure className="event-host-cover-preview"><img src={coverPreview} alt={coverAlt||"Selected event poster"}/><figcaption>Selected image — not saved yet</figcaption></figure> : cover?.draft_url ? <figure className="event-host-cover-preview"><img src={cover.draft_url} alt={cover.draft_alt_text} /><figcaption>{cover.draft_storage_path === cover.published_storage_path ? "Live image" : "Private image awaiting review"}</figcaption></figure> : <p>No image added yet. You can still send your draft without one.</p>}
          {cover?.published_url && cover.draft_storage_path !== cover.published_storage_path ? <p>The last approved image remains on the public event page until this one is approved.</p> : null}
          {!locked ? <div className="event-host-cover-controls">
            <label htmlFor="host-cover-file">Choose an image (JPG, PNG or WebP, under 6 MB)</label>
            <input ref={coverInput} id="host-cover-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)} />
            <label htmlFor="host-cover-alt">Describe what the image shows <small>(10–240 characters)</small></label>
            <input id="host-cover-alt" value={coverAlt} maxLength={240} disabled={busy} onChange={(event) => setCoverAlt(event.target.value)} placeholder="Women gathered around a table in Nairobi" />
            <button className="button button-primary" type="button" disabled={busy || !coverFile} onClick={() => void uploadCover()}>{busyAction === "image" ? "Saving poster…" : selfPublish ? "Save poster" : "Save poster privately"}</button>
            {coverFile ? <button className="button button-outline" type="button" disabled={busy} onClick={()=>{setCoverFile(null);if(coverInput.current)coverInput.current.value="";}}>Discard selected image</button> : null}
          </div> : null}
        </>}
      </div>

      <div className="host-workspace-panel" id="host-programme" hidden={section !== "programme"}>
        <div className="host-workspace-panel-heading"><div><h2>Schedule</h2><p>Add the main activities and their times.</p></div></div>
        <p>Add the moments guests can look forward to. All times below use {initial.timezone}, even if your device is elsewhere.</p>
        {programme.map((item, index) => <fieldset key={item.key} className="host-workspace-item">
          <legend>Activity {index + 1}</legend>
          <label>Title<input value={item.title} maxLength={160} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "title", event.target.value)} /></label>
          <label>Starts<input type="datetime-local" value={item.starts_at} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "starts_at", event.target.value)} /></label>
          <label>Ends<input type="datetime-local" value={item.ends_at} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "ends_at", event.target.value)} /></label>
          <label>Speaker, if confirmed<input value={item.speaker_name ?? ""} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "speaker_name", event.target.value)} /></label>
          <label>Description (optional)<textarea rows={2} value={item.description ?? ""} disabled={locked || busy} onChange={(event) => updateProgramme(item.key, "description", event.target.value)} /></label>
          {!locked ? <button className="button button-outline" type="button" disabled={busy} onClick={() => setProgramme((items) => items.filter((entry) => entry.key !== item.key))}>Remove activity</button> : null}
        </fieldset>)}
        {!locked ? <button className="button button-outline" type="button" disabled={busy || programme.length >= 30} onClick={() => setProgramme((items) => [...items, { key: crypto.randomUUID(), title: "", description: "", starts_at: formatEventTimeInput(initial.starts_at, initial.timezone), ends_at: formatEventTimeInput(initial.ends_at, initial.timezone), room: "", speaker_name: "" }])}>Add activity</button> : null}
      </div>

      {communityPanel()}

      <div className="host-workspace-panel" id="host-partners" hidden={section !== "partners"}>
        <div className="host-workspace-panel-heading"><div><h2>Partners</h2><p>Optional names you have permission to share.</p></div></div>
        <p>Only list partners who have agreed to be named.</p>
        {partners.map((partner) => <div key={partner.key} className="host-workspace-item">
          <label>Name<input value={partner.name} disabled={locked || busy} onChange={(event) => setPartners((items) => items.map((item) => item.key === partner.key ? { ...item, name: event.target.value } : item))} /></label>
          <label>Website (optional)<input type="url" value={partner.website_url ?? ""} disabled={locked || busy} onChange={(event) => setPartners((items) => items.map((item) => item.key === partner.key ? { ...item, website_url: event.target.value } : item))} /></label>
          {!locked ? <button className="button button-outline" type="button" disabled={busy} onClick={() => setPartners((items) => items.filter((item) => item.key !== partner.key))}>Remove partner</button> : null}
        </div>)}
        {!locked ? <button className="button button-outline" type="button" disabled={busy || partners.length >= 20} onClick={() => setPartners((items) => [...items, { key: crypto.randomUUID(), name: "", tier: "", website_url: "", logo_url: "" }])}>Add a partner</button> : null}
      </div>

      {message ? <p className="manager-message" role="status">{message}</p> : null}
      {!locked && ["introduction", "programme", "partners"].includes(section) ? <div className="host-workspace-actions"><p>{busyAction === "draft" ? "Saving your draft…" : busyAction === "publish" ? selfPublish ? "Publishing your changes…" : "Sending to the team…" : dirty ? "Changes not saved yet" : "No unsaved text changes"}</p><div><button className="button button-outline" disabled={busy || !dirty} onClick={() => void save(false)} type="button">{busyAction === "draft" ? "Saving…" : "Save privately"}</button><button className="button button-primary" disabled={busy} onClick={() => void save(true)} type="button">{busyAction === "publish" ? selfPublish ? "Publishing…" : "Sending…" : selfPublish ? "Publish changes" : "Send for review"}</button></div><small>{selfPublish ? "Save privately to keep preparing. Publish changes makes the event details visible to guests." : "Save privately to keep preparing. The team reviews your changes before guests see them."}</small></div> : null}
      {dialog}
    </section>
  );
}
