"use client";

import Link from "next/link";
import { FormEvent, useEffect, useId, useMemo, useRef, useState, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";
import { CommunityRecordingForm } from "./community-recording-form";
import { CommunityGatheringVideo, type GatheringVideo } from "@/components/member/community-gathering-video";
import { CommunityPhotoAlbums } from "./community-photo-albums";
import { youtubeVideoId } from "@/lib/youtube";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";
import { gatheringIntroduction } from "@/lib/gathering-introduction.mjs";
import { gatheringSetup } from "@/lib/gathering-setup.mjs";

export type CommunityEventProposal = {
  accessibility_notes: string | null;
  address_line: string | null;
  canonical_event_id: string | null;
  canonical_event_slug: string | null;
  capacity: number;
  city: string | null;
  country: string;
  created_at: string;
  ends_at: string;
  format: "hybrid" | "in_person" | "virtual";
  host_note: string | null;
  map_url: string | null;
  online_url: string | null;
  pricing_mode: string;
  proposal_id: string;
  proposed_by: string;
  proposer_name: string | null;
  review_note: string | null;
  safety_contact_name: string;
  safety_contact_phone: string;
  starts_at: string;
  status: "approved" | "cancelled" | "changes_requested" | "declined" | "draft" | "submitted" | "under_review";
  submitted_at: string | null;
  summary: string;
  timezone: string;
  title: string;
  updated_at: string;
  venue_name: string | null;
  visibility: string;
};

const steps = ["Details", "Time, link & contact"];
const statusLabels: Record<CommunityEventProposal["status"], string> = {
  approved: "Approved and open",
  cancelled: "Cancelled",
  changes_requested: "Update requested",
  declined: "Not approved",
  draft: "Private draft",
  submitted: "Awaiting review",
  under_review: "Being reviewed",
};

function localDateTimeValue(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function initialValues() {
  const starts = new Date(Date.now() + 60 * 60_000);
  const ends = new Date(starts.getTime() + 2 * 3_600_000);
  return {
    accessibilityNotes: "",
    addressLine: "",
    capacity: "30",
    city: "Nairobi",
    country: "Kenya",
    endsAt: localDateTimeValue(ends),
    format: "virtual" as CommunityEventProposal["format"],
    hostNote: "",
    mapUrl: "",
    onlineUrl: "",
    safetyContactName: "",
    safetyContactPhone: "",
    startsAt: localDateTimeValue(starts),
    summary: "",
    timezone: "Africa/Nairobi",
    title: "",
    venueName: "",
    draftProposalId: null as string | null,
    draftStep: 0,
    videoLink: "",
    mediaChoice: "none",
    gatheringStyle: "video_call",
  };
}

export function CommunityEventProposalPanel({
  communityId,
  communitySlug,
  currentUserId,
  migrationReady,
  proposals,
  startExpanded = false,
  onSaved,
}: {
  communityId: string;
  communitySlug: string;
  currentUserId: string;
  migrationReady: boolean;
  proposals: CommunityEventProposal[];
  startExpanded?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [expanded, setExpanded] = useState(startExpanded);
  const [creationMode, setCreationMode] = useState("scheduled");
  const [shareArea, setShareArea] = useState("video");
  const [openedRoom, setOpenedRoom] = useState<{ roomId: string; slug: string; communitySlug: string; title: string; endsAt: string; video: GatheringVideo | null; videoDraft: string } | null>(null);
  useEffect(() => {
    const reveal = () => { if (window.location.hash === "#community-video") setCreationMode("video"); else if (window.location.hash === "#gathering-proposals") setCreationMode("scheduled"); };
    reveal(); window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  const [values, setValues, clearDraft, restored] = useCommunityDraft(communityDraftKey(currentUserId, "community-gathering-plan", communityId), initialValues);
  const editingId = values.draftProposalId;
  const step = Math.min(values.draftStep, steps.length - 1);
  const setEditingId = (value: string | null) => setValues(current => ({ ...current, draftProposalId: value }));
  const setStep = (next: SetStateAction<number>) => setValues(current => ({ ...current, draftStep: typeof next === "function" ? next(current.draftStep) : next }));
  useEffect(() => { if (restored) setExpanded(true); }, [restored]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [introAttempted,setIntroAttempted] = useState(false);
  const introId=useId();
  const titleInput=useRef<HTMLInputElement>(null);
  const summaryInput=useRef<HTMLTextAreaElement>(null);
  function refreshGatherings() { router.refresh(); onSaved?.(); }
  const introduction=gatheringIntroduction(values.title,values.summary);
  const setup = gatheringSetup(values);

  function chooseGatheringStyle(kind: string) {
    setValues(current => ({ ...current, gatheringStyle: kind, format: kind === "in_person" ? "in_person" : kind === "hybrid" ? "hybrid" : "virtual" }));
    setMessage("");
  }

  function update(key: keyof ReturnType<typeof initialValues>, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function startNew() {
    if (!values.title && !values.summary) clearDraft(initialValues());
    setMessage("");
    setIntroAttempted(false);
    setExpanded(true);
  }

  async function edit(proposal: CommunityEventProposal) {
    if ((values.title || values.summary) && editingId !== proposal.proposal_id) {
      if (!await ask({ title: "Open a different draft?", description: "Your unfinished plan on this screen will be replaced. Choose Cancel to keep working on it.", confirmLabel: "Open draft" })) return;
    }
    setEditingId(proposal.proposal_id);
    setIntroAttempted(false);
    setValues({
      accessibilityNotes: proposal.accessibility_notes ?? "",
      addressLine: proposal.address_line ?? "",
      capacity: String(proposal.capacity),
      city: proposal.city ?? "",
      country: proposal.country,
      endsAt: localDateTimeValue(proposal.ends_at),
      format: proposal.format,
      hostNote: proposal.host_note ?? "",
      mapUrl: proposal.map_url ?? "",
      onlineUrl: proposal.online_url ?? "",
      safetyContactName: proposal.safety_contact_name,
      safetyContactPhone: proposal.safety_contact_phone,
      startsAt: localDateTimeValue(proposal.starts_at),
      summary: proposal.summary,
      timezone: proposal.timezone,
      title: proposal.title,
      venueName: proposal.venue_name ?? "",
      draftProposalId: proposal.proposal_id,
      draftStep: 0,
      videoLink: "",
      mediaChoice: "none",
      gatheringStyle: proposal.format === "in_person" ? "in_person" : proposal.format === "hybrid" ? "hybrid" : "video_call",
    });
    setStep(0);
    setMessage("");
    setExpanded(true);
  }

  function continueForward() {
    if (step === 0) {
      setIntroAttempted(true);
      if(introduction.titleError||introduction.summaryError){
        setMessage("");
        (introduction.titleError?titleInput:summaryInput).current?.focus();
        return;
      }
    }
    if (step === 1) {
      const start = new Date(values.startsAt);
      const end = new Date(values.endsAt);
      if (!values.startsAt || !values.endsAt || end <= start) {
        setMessage("Choose a start and end time for the gathering.");
        return;
      }
      const capacity = Number(values.capacity);
      if (!Number.isInteger(capacity) || capacity < 2 || capacity > 500) {
        setMessage("Choose a guest limit between 2 and 500.");
        return;
      }
      if (
        values.format !== "virtual" &&
        (!values.venueName.trim() || !values.city.trim())
      ) {
        setMessage("Add the venue and city for this gathering.");
        return;
      }
      if ((values.format === "hybrid" || values.onlineUrl.trim()) && !values.onlineUrl.startsWith("https://")) {
        setMessage("Add the full private online link, beginning with https://.");
        return;
      }
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
    setMessage("");
  }

  async function save(submit: boolean) {
    const start = new Date(values.startsAt), end = new Date(values.endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setMessage("Choose a valid start and end time."); return; }
    if (submit && start <= new Date()) { setMessage("Choose a future start time. Online gatherings can start today."); return; }
    if (submit && values.format !== "virtual" && start.getTime() < Date.now() + 24 * 60 * 60_000) { setMessage("In-person gatherings need 24 hours’ notice. Choose Online for a gathering today."); return; }
    if (setup.onlineUrl && !setup.onlineUrl.startsWith("https://")) { setMessage("Use a full meeting link beginning with https://, or leave it empty for text chat."); return; }
    if (setup.kind === "hybrid" && !setup.onlineUrl) { setMessage("Add the video call link for this in-person and online gathering."); return; }
    if (setup.kind === "watch_video" && (submit || setup.videoLink) && !youtubeVideoId(setup.videoLink)) { setMessage("Add a YouTube video or livestream link so members have something to watch. Use a video link, not a channel address."); return; }
    if (!values.safetyContactName.trim() || values.safetyContactPhone.trim().length < 7) {
      setMessage("Add the person responsible on the day and a working phone number.");
      return;
    }
    setBusy(true);
    setMessage("");
    let gatheringOpened = false;
    try {
    const { data: savedProposal, error } = await supabase.rpc("save_community_event_proposal", {
      p_accessibility_notes: values.accessibilityNotes.trim() || null,
      p_address_line: values.addressLine.trim() || null,
      p_capacity: Number(values.capacity),
      p_city: values.city.trim() || null,
      p_community_id: communityId,
      p_country: values.country.trim(),
      p_ends_at: new Date(values.endsAt).toISOString(),
      p_format: setup.format,
      p_host_note: values.hostNote.trim() || null,
      p_map_url: values.mapUrl.trim() || null,
      p_online_url: setup.onlineUrl || null,
      p_proposal_id: editingId,
      p_safety_contact_name: values.safetyContactName.trim(),
      p_safety_contact_phone: values.safetyContactPhone.trim(),
      p_starts_at: new Date(values.startsAt).toISOString(),
      p_submit: false,
      p_summary: values.summary.trim(),
      p_timezone: values.timezone,
      p_title: values.title.trim(),
      p_venue_name: values.venueName.trim() || null,
    });
    if (error) {
      setBusy(false);
      setMessage(memberErrorMessage(error, submit ? "open this gathering" : "save this private draft"));
      return;
    }
    if (typeof savedProposal !== "string") {
      setBusy(false); setMessage("We couldn’t confirm the saved draft. Please try again."); return;
    }
    setEditingId(savedProposal);
    if (submit) {
      const { data: publishedEventId, error: publishError } = await supabase.rpc(
        "publish_community_gathering",
        { p_proposal_id: savedProposal },
      );
      if (publishError) {
        setBusy(false);
        setMessage(memberErrorMessage(publishError, "open this gathering"));
        return;
      }
      gatheringOpened = true;
      const cards = await supabase.rpc("list_community_gathering_cards", { p_community_id: communityId });
      const room = (cards.data as { room_id: string; event_id: string; event_slug: string }[] | null)?.find(item => item.event_id === publishedEventId);
      if (cards.error || !room) { setMessage("Your gathering is open. Its extra media controls could not load; find it in your gatherings below."); setExpanded(false); clearDraft(initialValues()); refreshGatherings(); return; }
      if (room) {
        const opened = { roomId: room.room_id, slug: room.event_slug, communitySlug, title: values.title, endsAt: end.toISOString(), video: null as GatheringVideo | null, videoDraft: setup.videoLink };
        setShareArea(values.mediaChoice === "photos" ? "photos" : "video");
        if (setup.videoLink) {
          try {
            const videoResult = await supabase.rpc("save_community_gathering_video_experience", { p_room_id: room.room_id, p_video_id: youtubeVideoId(setup.videoLink), p_is_visible: true, p_keep_replay: true, p_viewing_mode: "watch_together" });
            if(videoResult.error)throw videoResult.error;
            if(!videoResult.data)throw new Error("Video save was not confirmed");
            opened.video=videoResult.data as GatheringVideo;
            opened.videoDraft="";
          }catch {
            setOpenedRoom(opened);setShareArea("video");setMessage("Your gathering is open, but the video was not saved. Your link is kept below—choose Save video to try again."); setExpanded(false); clearDraft(initialValues()); refreshGatherings(); return;
          }
        }
        setOpenedRoom(opened);
      }
    }
    setMessage(submit ? "Your gathering is open to Community members." : "Private draft saved.");
    setBusy(false);
    setExpanded(false);
    if(submit)clearDraft(initialValues());
    else setValues(current=>({...current,draftProposalId:savedProposal}));
    refreshGatherings();
    } catch (error) { setMessage(gatheringOpened ? "Your gathering is open, but its extra controls could not load. Find it in your gatherings below." : memberErrorMessage(error, "save this gathering")); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length - 1) { continueForward(); return; }
    await save(true);
  }

  async function cancel(proposal: CommunityEventProposal) {
    const confirmed = await ask({
      confirmLabel: "Cancel proposal",
      description: "This closes the proposal. No member invitations or event records will be created.",
      title: `Cancel ${proposal.title}?`,
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.rpc("cancel_community_event_proposal", {
        p_proposal_id: proposal.proposal_id,
      });
      if (error) throw error;
      setMessage("Draft cancelled.");
      refreshGatherings();
    } catch (error) {
      setMessage(memberErrorMessage(error, "cancel this draft"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="community-event-proposals" id="gathering-proposals" aria-labelledby="community-event-proposal-title">
      <header>
        <div>
          <p className="eyebrow">Community gatherings</p>
          <h2 id="community-event-proposal-title">Create a gathering</h2>
          <p>Meet in person, join a video call, or watch a video together. Only your Community members can take part.</p>
        </div>
        {migrationReady && creationMode === "scheduled" && !expanded ? <button className="button button-primary" onClick={startNew} type="button">Create a gathering</button> : null}
      </header>
      {migrationReady ? <div className="community-creation-choice" role="group" aria-label="What would you like to create?"><button type="button" aria-pressed={creationMode === "scheduled"} onClick={() => setCreationMode("scheduled")}>Scheduled gathering</button><button type="button" aria-pressed={creationMode === "video"} onClick={() => setCreationMode("video")}>Watch a video anytime</button></div> : null}
      <div hidden={creationMode !== "video"}>{migrationReady ? <CommunityRecordingForm communityId={communityId} currentUserId={currentUserId} autoOpen={creationMode === "video"} /> : null}</div>

      {!migrationReady ? (
        <div className="community-panel-empty"><strong>Planning a gathering is temporarily unavailable</strong><p>Please try again later. Gatherings you already planned are safe.</p></div>
      ) : null}

      {expanded && migrationReady && creationMode === "scheduled" ? (
        <form className="community-event-wizard" onSubmit={submit}>
          <header>
            <div><p className="eyebrow">{editingId ? "Continue draft" : "New gathering"}</p><h3>{steps[step]}</h3></div>
            <span>{step + 1} of {steps.length}</span>
          </header>
          <div className="community-event-wizard-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((label, index) => <span className={index <= step ? "active" : ""} key={label}><i />{label}</span>)}
          </div>

          {step === 0 ? (
            <div className="community-event-wizard-step">
              <label>Gathering name<input ref={titleInput} aria-invalid={introAttempted&&Boolean(introduction.titleError)} aria-describedby={`${introId}-name-help`} minLength={4} maxLength={140} onChange={(event) => update("title", event.target.value)} placeholder="For example: World Today" value={values.title}/><small id={`${introId}-name-help`}>4–140 characters. Choose any name that suits your gathering.</small></label>
              {introAttempted&&introduction.titleError?<p role="alert" className="manager-message">{introduction.titleError}</p>:null}
              <label>What will you discuss?<textarea ref={summaryInput} aria-invalid={introAttempted&&Boolean(introduction.summaryError)} aria-describedby={`${introId}-summary-help`} maxLength={2000} minLength={40} onChange={(event) => update("summary", event.target.value)} placeholder="For example: A brief overview of the platform and how members can use it." rows={3} value={values.summary}/><small id={`${introId}-summary-help`}>{introduction.summaryLength} characters · {introduction.summaryLength<40?`add at least ${40-introduction.summaryLength} more`:"minimum length reached"}. Keep it within 2,000 characters.</small></label>
              {introAttempted&&introduction.summaryError?<p role="alert" className="manager-message">{introduction.summaryError}</p>:null}
              <div className="community-event-fixed-terms"><span>Members only</span><span>Free</span><p>Only members of your Community can take part.</p></div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="community-event-wizard-step">
              <div className="form-grid">
                <label>How will you gather?<select onChange={(event) => chooseGatheringStyle(event.target.value)} value={setup.kind}><option value="in_person">In person</option><option value="video_call">Video call</option><option value="watch_video">Watch a video together</option>{setup.kind === "hybrid" ? <option value="hybrid">In person and online (existing draft)</option> : null}</select></label>
                <label>Maximum guests<input min={2} max={500} onChange={(event) => update("capacity", event.target.value)} type="number" value={values.capacity}/></label>
                <label>Starts<input onChange={(event) => update("startsAt", event.target.value)} type="datetime-local" value={values.startsAt}/></label>
                <label>Ends<input onChange={(event) => update("endsAt", event.target.value)} type="datetime-local" value={values.endsAt}/></label>
                {values.format !== "virtual" ? <><label>Venue name<input maxLength={160} onChange={(event) => update("venueName", event.target.value)} placeholder="Venue or host space" value={values.venueName}/></label><label>City<input maxLength={120} onChange={(event) => update("city", event.target.value)} value={values.city}/></label><label>Country<input maxLength={120} onChange={(event) => update("country", event.target.value)} value={values.country}/></label><label>Address <small>Shared only with eligible members</small><input maxLength={240} onChange={(event) => update("addressLine", event.target.value)} value={values.addressLine}/></label><label className="form-wide">Map link <small>Optional</small><input onChange={(event) => update("mapUrl", event.target.value)} placeholder="https://…" type="url" value={values.mapUrl}/></label></> : null}
                {setup.kind === "video_call" || setup.kind === "hybrid" ? <label className="form-wide">Video call link <small>{setup.kind === "hybrid" ? "Required" : "Optional"}</small><input onChange={(event) => update("onlineUrl", event.target.value)} placeholder="Google Meet or Zoom link" type="url" value={values.onlineUrl}/><small>Members open the call in Meet or Zoom. Leave empty if you only want text chat.</small></label> : null}
                {setup.kind === "watch_video" ? <label className="form-wide">YouTube video or livestream<input type="url" required value={values.videoLink} onChange={event => update("videoLink", event.target.value)} placeholder="https://www.youtube.com/watch?v=…" /><small>Use a recorded video or a livestream. Members watch and discuss here. Anyone with the YouTube link may also watch outside this platform.</small></label> : null}
                <label className="form-wide community-gathering-photo-choice"><input type="checkbox" checked={values.mediaChoice === "photos"} onChange={event => update("mediaChoice", event.target.checked ? "photos" : "none")} /><span>Add photos after opening</span><small>Optional. Photos stay in this gathering’s album; no poster is required.</small></label>
                {values.mediaChoice === "photos" ? <p className="form-wide">Open the gathering first, then upload your photos below into an album linked to this gathering. No page change is needed.</p> : null}
                <label>Host contact name<input maxLength={120} onChange={(event) => update("safetyContactName", event.target.value)} placeholder="Full name" value={values.safetyContactName}/></label>
                <label>Private contact number<input maxLength={40} onChange={(event) => update("safetyContactPhone", event.target.value)} placeholder="+254…" type="tel" value={values.safetyContactPhone}/></label>
              </div>
              <details className="community-gathering-extra"><summary>Extra details (optional)</summary><label>Access or arrival information<textarea maxLength={1200} rows={2} value={values.accessibilityNotes} onChange={event => update("accessibilityNotes", event.target.value)} /></label><label>Private Host note<textarea maxLength={1200} rows={2} value={values.hostNote} onChange={event => update("hostNote", event.target.value)} /></label></details>
              <div className="community-event-review-note"><p>Online gatherings can start today. Opening lets your Community know; only active members can take part.</p></div>
            </div>
          ) : null}

          {message ? <p className="manager-message" role="alert">{message}</p> : null}
          <footer>
            <button className="button button-outline" disabled={busy} onClick={() => step === 0 ? setExpanded(false) : setStep((current) => current - 1)} type="button">{step === 0 ? "Close" : "Back"}</button>
            <div>
              {step === steps.length - 1 ? <button className="button button-outline" disabled={busy} onClick={() => void save(false)} type="button">Save private draft</button> : null}
              {step < steps.length - 1 ? <button key="continue" className="button button-primary" onClick={(event) => { event.preventDefault(); continueForward(); }} type="button">Continue</button> : <button key="publish" className="button button-primary" disabled={busy} type="submit">{busy ? "Opening…" : "Open for members"}</button>}
            </div>
          </footer>
        </form>
      ) : null}

      {openedRoom ? <section className="community-gathering-share"><header><h3>{openedRoom.title} is open</h3><Link href={`/communities/${openedRoom.communitySlug}?view=gatherings&gathering=${encodeURIComponent(openedRoom.slug)}`}>View gathering →</Link></header><div className="community-creation-choice" role="group" aria-label="Add gathering media"><button type="button" aria-pressed={shareArea === "video"} onClick={() => setShareArea("video")}>Video</button><button type="button" aria-pressed={shareArea === "photos"} onClick={() => setShareArea("photos")}>Photos</button></div><div hidden={shareArea !== "video"}><CommunityGatheringVideo roomId={openedRoom.roomId} currentUserId={currentUserId} canManage endsAt={openedRoom.endsAt} title={openedRoom.title} initialVideo={openedRoom.video} initialLink={openedRoom.videoDraft} ready /></div><div hidden={shareArea !== "photos"}><CommunityPhotoAlbums key={openedRoom.roomId} communityId={communityId} currentUserId={currentUserId} presentation="member" initialGatheringId={openedRoom.roomId} /></div></section> : null}

      {proposals.length ? (
        <div className="community-event-proposal-list">
          {proposals.map((proposal) => (
            <article key={proposal.proposal_id}>
              <header><div><span className={`proposal-state state-${proposal.status}`}>{statusLabels[proposal.status]}</span><h3>{proposal.title}</h3><p>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: proposal.timezone }).format(new Date(proposal.starts_at))} · {proposal.format.replaceAll("_", " ")}</p></div><strong>{proposal.capacity} places</strong></header>
              {proposal.review_note ? <div className="proposal-review-guidance"><strong>Review guidance</strong><p>{proposal.review_note}</p></div> : null}
              <footer>
                {proposal.status === "approved" && proposal.canonical_event_slug ? <Link className="button button-primary" href={`/communities/${communitySlug}?view=gatherings&gathering=${encodeURIComponent(proposal.canonical_event_slug)}`}>View gathering</Link> : null}
                {["draft", "changes_requested"].includes(proposal.status) ? <button className="button button-primary" onClick={() => edit(proposal)} type="button">{proposal.status === "changes_requested" ? "Update and resend" : "Continue draft"}</button> : null}
                {["draft", "submitted", "changes_requested"].includes(proposal.status) ? <button className="button button-outline" disabled={busy} onClick={() => void cancel(proposal)} type="button">Cancel</button> : null}
              </footer>
            </article>
          ))}
        </div>
      ) : migrationReady && !expanded ? <div className="community-panel-empty"><strong>No gatherings planned yet</strong><p>Begin with one useful reason for members to meet. You can save privately before opening it.</p></div> : null}
      {message && !expanded ? <p className="manager-message" role="status">{message}</p> : null}
      {dialog}
    </section>
  );
}
