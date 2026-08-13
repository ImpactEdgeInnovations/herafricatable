"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";
import { ApplicationImageField } from "@/components/applications/application-image-field";
import { ApplicationImageQuickEdit } from "@/components/applications/application-image-quick-edit";
import {
  applicationMediaStatus,
  removeApplicationProposalMedia,
  type ApplicationProposalMedia,
  uploadApplicationProposalMedia,
} from "@/lib/application-proposal-media";

export type MemberEventProposal = {
  accessibility_notes: string | null;
  address_line: string | null;
  canonical_event_id: string | null;
  canonical_event_slug: string | null;
  capacity: number;
  city: string | null;
  community_after_event: boolean;
  community_id: string | null;
  community_idea: string | null;
  community_name: string | null;
  community_slug: string | null;
  community_type: string | null;
  country: string;
  created_at: string;
  ends_at: string;
  format: "hybrid" | "in_person" | "virtual";
  host_experience: string;
  host_note: string | null;
  map_url: string | null;
  online_url: string | null;
  proposal_id: string;
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
};

export type HostedCommunity = {
  community_id: string;
  community_type: string;
  name: string;
  slug: string;
};

const steps = ["Your idea", "Time & place", "Hosting safely", "What comes next"];
const statusLabels: Record<MemberEventProposal["status"], string> = {
  approved: "Approved and public",
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
  const starts = new Date(Date.now() + 21 * 86_400_000);
  starts.setHours(10, 0, 0, 0);
  const ends = new Date(starts.getTime() + 3 * 3_600_000);
  return {
    accessibilityNotes: "",
    addressLine: "",
    capacity: "30",
    city: "Nairobi",
    communityAfterEvent: false,
    communityId: "",
    communityIdea: "",
    country: "Kenya",
    endsAt: localDateTimeValue(ends),
    format: "in_person" as MemberEventProposal["format"],
    hostExperience: "",
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
  };
}

export function MemberEventProposalPanel({
  hostedCommunities,
  media,
  mediaReady,
  migrationReady,
  proposals,
}: {
  hostedCommunities: HostedCommunity[];
  media: ApplicationProposalMedia[];
  mediaReady: boolean;
  migrationReady: boolean;
  proposals: MemberEventProposal[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eventPath, setEventPath] = useState<"community" | "public">("public");
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initialValues);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterAltText, setPosterAltText] = useState("");
  const editingMedia = editingId
    ? media.find((item) => item.context_type === "member_event_proposal" && item.context_id === editingId) ?? null
    : null;

  function update(key: keyof ReturnType<typeof initialValues>, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function startNew() {
    setEditingId(null);
    setValues(initialValues());
    setEventPath("public");
    setStep(0);
    setMessage("");
    setPosterFile(null);
    setPosterAltText("");
    setExpanded(true);
  }

  function edit(proposal: MemberEventProposal) {
    setEditingId(proposal.proposal_id);
    setValues({
      accessibilityNotes: proposal.accessibility_notes ?? "",
      addressLine: proposal.address_line ?? "",
      capacity: String(proposal.capacity),
      city: proposal.city ?? "",
      communityAfterEvent: proposal.community_after_event,
      communityId: proposal.community_id ?? "",
      communityIdea: proposal.community_idea ?? "",
      country: proposal.country,
      endsAt: localDateTimeValue(proposal.ends_at),
      format: proposal.format,
      hostExperience: proposal.host_experience,
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
    });
    setStep(0);
    setEventPath("public");
    setMessage("");
    const proposalMedia = media.find((item) => item.context_type === "member_event_proposal" && item.context_id === proposal.proposal_id);
    setPosterFile(null);
    setPosterAltText(proposalMedia?.alt_text ?? "");
    setExpanded(true);
  }

  function currentStepIssue() {
    if (step === 0 && (values.title.trim().length < 4 || values.summary.trim().length < 40)) {
      if (values.title.trim().length < 4) return "Add a clear event name using at least 4 characters.";
      return `Add ${40 - values.summary.trim().length} more character${40 - values.summary.trim().length === 1 ? "" : "s"} about what guests will gain.`;
    }
    if (step === 1) {
      const start = new Date(values.startsAt);
      const end = new Date(values.endsAt);
      if (!values.startsAt || !values.endsAt || end <= start) {
        return "Choose a start and end time for the event.";
      }
      if (start.getTime() < Date.now() + 7 * 86_400_000) {
        return "Choose a date at least seven days away so there is time for review.";
      }
      const capacity = Number(values.capacity);
      if (!Number.isInteger(capacity) || capacity < 5 || capacity > 500) {
        return "Choose a guest limit between 5 and 500.";
      }
      if (values.format !== "virtual" && (!values.venueName.trim() || !values.city.trim())) {
        return "Add the venue and city for this event.";
      }
      if (values.format !== "in_person" && !values.onlineUrl.startsWith("https://")) {
        return "Add the full private online link, beginning with https://.";
      }
    }
    if (step === 2 && (
      values.hostExperience.trim().length < 20 ||
      values.safetyContactName.trim().length < 2 ||
      values.safetyContactPhone.trim().length < 7
    )) {
      return "Tell us how you will host responsibly and add the day-of-event contact.";
    }
    if (step === 3 && values.communityAfterEvent && values.communityIdea.trim().length < 20) {
      return "Briefly describe the Community that might continue after this event.";
    }
    return "";
  }

  function continueForward() {
    const issue = currentStepIssue();
    if (issue) {
      setMessage(issue);
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
    setMessage("");
  }

  async function save(submit: boolean) {
    setBusy(true);
    setMessage("");
    const proposalValues = {
      p_accessibility_notes: values.accessibilityNotes.trim() || null,
      p_address_line: values.addressLine.trim() || null,
      p_capacity: Number(values.capacity),
      p_city: values.city.trim() || null,
      p_community_after_event: values.communityAfterEvent,
      p_community_idea: values.communityIdea.trim() || null,
      p_country: values.country.trim(),
      p_ends_at: new Date(values.endsAt).toISOString(),
      p_format: values.format,
      p_host_experience: values.hostExperience.trim(),
      p_host_note: values.hostNote.trim() || null,
      p_map_url: values.mapUrl.trim() || null,
      p_online_url: values.onlineUrl.trim() || null,
      p_proposal_id: editingId,
      p_safety_contact_name: values.safetyContactName.trim(),
      p_safety_contact_phone: values.safetyContactPhone.trim(),
      p_starts_at: new Date(values.startsAt).toISOString(),
      p_submit: false,
      p_summary: values.summary.trim(),
      p_timezone: values.timezone,
      p_title: values.title.trim(),
      p_venue_name: values.venueName.trim() || null,
    };
    const { data: savedProposalId, error: draftError } = await supabase.rpc(
      "save_member_event_proposal",
      proposalValues,
    );
    if (draftError || !savedProposalId) {
      setBusy(false);
      setMessage(memberErrorMessage(draftError, submit ? "send this event for review" : "save this draft"));
      return;
    }
    setEditingId(String(savedProposalId));
    const { error: contextError } = await supabase.rpc(
      "set_member_event_proposal_community",
      {
        p_community_id: values.communityId || null,
        p_proposal_id: savedProposalId,
      },
    );
    if (contextError) {
      setBusy(false);
      setMessage(`Your draft was saved, but ${memberErrorMessage(contextError, "link its Community")}`);
      router.refresh();
      return;
    }
    if (posterFile) {
      try {
        await uploadApplicationProposalMedia(supabase, {
          altText: posterAltText,
          contextId: String(savedProposalId),
          contextType: "member_event_proposal",
          file: posterFile,
        });
      } catch (posterError) {
        setBusy(false);
        setMessage(`Your private draft was saved, but the poster was not added. ${memberErrorMessage(posterError, "add the poster")}`);
        router.refresh();
        return;
      }
    }
    const { error } = submit
      ? await supabase.rpc("save_member_event_proposal", {
          ...proposalValues,
          p_proposal_id: savedProposalId,
          p_submit: true,
        })
      : { error: null };
    setBusy(false);
    if (error) {
      setMessage(memberErrorMessage(error, submit ? "send this event for review" : "save this draft"));
      return;
    }
    setMessage(submit ? "Your event is with the review team." : "Draft saved. Only you and the review team can see it.");
    setExpanded(false);
    setEditingId(null);
    setPosterFile(null);
    setPosterAltText("");
    router.refresh();
  }

  async function removePoster() {
    if (!editingMedia) return;
    const confirmed = await ask({
      confirmLabel: "Remove poster",
      description: "Your Event proposal and written details will remain in place.",
      title: "Remove this optional poster?",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await removeApplicationProposalMedia(supabase, editingMedia);
      setPosterAltText("");
      setMessage("Poster removed. Your Event proposal is unchanged.");
      router.refresh();
    } catch (removeError) {
      setMessage(memberErrorMessage(removeError, "remove the poster"));
    }
    setBusy(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(true);
  }

  async function cancel(proposal: MemberEventProposal) {
    const confirmed = await ask({
      confirmLabel: "Cancel proposal",
      description: "This closes the proposal. It will not remove an event that has already been approved.",
      title: `Cancel ${proposal.title}?`,
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_member_event_proposal", {
      p_proposal_id: proposal.proposal_id,
    });
    setBusy(false);
    setMessage(error ? memberErrorMessage(error, "cancel this event proposal") : "Proposal cancelled.");
    if (!error) router.refresh();
  }

  return (
    <section className="member-event-proposals" id="propose-event" aria-labelledby="member-event-proposal-title">
      <header>
        <div>
          <p className="eyebrow">Have an idea of your own?</p>
          <h2 id="member-event-proposal-title">Bring women together.</h2>
          <p>You do not need a Community first. Propose a public event, let us review it with you, then decide together whether the relationships should continue as a Community.</p>
        </div>
        {migrationReady ? <button className="button button-primary" onClick={startNew} type="button">Propose an event</button> : null}
      </header>

      <div className="member-event-promise" aria-label="How member events work">
        <span><b>1</b> Share your idea</span>
        <span><b>2</b> Our team reviews it</span>
        <span><b>3</b> The approved event becomes public</span>
        <span><b>4</b> Attendees choose whether to stay connected</span>
      </div>

      {!migrationReady ? (
        <div className="community-panel-empty"><strong>Starting an event is temporarily unavailable</strong><p>Please try again later. Events you already started are safe.</p></div>
      ) : null}

      {expanded && migrationReady ? (
        <form className="community-event-wizard member-event-wizard" onSubmit={submit}>
          <header><div><p className="eyebrow">{editingId ? "Continue your draft" : "New public event"}</p><h3>{steps[step]}</h3></div><span>{step + 1} of {steps.length}</span></header>
          <div className="community-event-wizard-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((label, index) => <span className={index <= step ? "active" : ""} key={label}><i />{label}</span>)}
          </div>

          {step === 0 ? (
            <div className="community-event-wizard-step">
              <fieldset className="member-event-paths">
                <legend>Who are you bringing together?</legend>
                <div>
                  <button
                    aria-pressed={eventPath === "public"}
                    onClick={() => { setEventPath("public"); setMessage(""); }}
                    type="button"
                  >
                    <span>Open event</span>
                    <strong>Everyone can discover it</strong>
                    <small>It becomes public only after our team approves it.</small>
                  </button>
                  <button
                    aria-pressed={eventPath === "community"}
                    onClick={() => { setEventPath("community"); setMessage(""); }}
                    type="button"
                  >
                    <span>Community gathering</span>
                    <strong>For one Community</strong>
                    <small>Private Communities keep the event private too.</small>
                  </button>
                </div>
              </fieldset>

              {eventPath === "community" ? (
                <div className="member-event-community-route">
                  <div>
                    <p className="eyebrow">Plan it with your people</p>
                    <h4>Community gatherings begin inside the Community.</h4>
                    <p>The host can invite the right members, share updates in one place and keep private gatherings out of public discovery.</p>
                  </div>
                  {hostedCommunities.length ? (
                    <div>
                      {hostedCommunities.map((community) => (
                        <Link href={`/communities/${community.slug}/host#event-proposals`} key={community.community_id}>
                          <span>{community.community_type === "private" ? "Private Community" : "Open Community"}</span>
                          <strong>Plan with {community.name}</strong>
                          <i aria-hidden="true">→</i>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="member-event-no-community">
                      <strong>You are not hosting a Community yet.</strong>
                      <p>You can still propose an open event here, or apply to start a Community first.</p>
                      <button onClick={() => setEventPath("public")} type="button">Plan an open event</button>
                      <Link href="/communities#create-community">Start a Community</Link>
                    </div>
                  )}
                </div>
              ) : (
                <>
              <label>Event name<input maxLength={140} onChange={(event) => update("title", event.target.value)} placeholder="For example: Women in trade breakfast" value={values.title}/></label>
              <label className={message && values.summary.trim().length < 40 ? "field-needs-attention" : ""}>What will people gain?<textarea aria-describedby="member-event-summary-help" maxLength={2000} minLength={40} onChange={(event) => update("summary", event.target.value)} placeholder="Tell us who the event is for, why it matters and what guests should leave with." rows={5} value={values.summary}/><small id="member-event-summary-help">{values.summary.trim().length < 40 ? `${40 - values.summary.trim().length} more character${40 - values.summary.trim().length === 1 ? "" : "s"} before you can continue` : "Ready to continue"} · {values.summary.length}/2000</small></label>
              {hostedCommunities.length ? (
                <label>Is this event connected to one of your Communities?
                  <select onChange={(event) => update("communityId", event.target.value)} value={values.communityId}>
                    <option value="">No — it stands on its own</option>
                    {hostedCommunities.map((community) => <option key={community.community_id} value={community.community_id}>{community.name}</option>)}
                  </select>
                  <small>If you choose one, its name and join button will appear on the approved event.</small>
                </label>
              ) : null}
              <div className="community-event-fixed-terms"><span>Public after approval</span><span>Free to attend</span><span>Seats reviewed</span><p>Paid member events will open after payment, refund and settlement checks pass.</p></div>
                </>
              )}
            </div>
          ) : null}

          {step === 1 ? (
            <div className="community-event-wizard-step"><div className="form-grid">
              <label>Format<select onChange={(event) => update("format", event.target.value)} value={values.format}><option value="in_person">In person</option><option value="virtual">Online</option><option value="hybrid">In person and online</option></select></label>
              <label>Maximum guests<input min={5} max={500} onChange={(event) => update("capacity", event.target.value)} type="number" value={values.capacity}/></label>
              <label>Starts<input onChange={(event) => update("startsAt", event.target.value)} type="datetime-local" value={values.startsAt}/></label>
              <label>Ends<input onChange={(event) => update("endsAt", event.target.value)} type="datetime-local" value={values.endsAt}/></label>
              {values.format !== "virtual" ? <><label>Venue name<input maxLength={160} onChange={(event) => update("venueName", event.target.value)} placeholder="Venue or host space" value={values.venueName}/></label><label>City<input maxLength={120} onChange={(event) => update("city", event.target.value)} value={values.city}/></label><label>Country<input maxLength={120} onChange={(event) => update("country", event.target.value)} value={values.country}/></label><label>Address <small>Shown only when appropriate</small><input maxLength={240} onChange={(event) => update("addressLine", event.target.value)} value={values.addressLine}/></label><label className="form-wide">Map link <small>Optional</small><input onChange={(event) => update("mapUrl", event.target.value)} placeholder="https://…" type="url" value={values.mapUrl}/></label></> : null}
              {values.format !== "in_person" ? <label className="form-wide">Private online link<input onChange={(event) => update("onlineUrl", event.target.value)} placeholder="https://…" type="url" value={values.onlineUrl}/><small>Only confirmed guests receive this link.</small></label> : null}
            </div></div>
          ) : null}

          {step === 2 ? (
            <div className="community-event-wizard-step"><div className="form-grid">
              <label className="form-wide">How will you host this well?<textarea maxLength={1200} minLength={20} onChange={(event) => update("hostExperience", event.target.value)} placeholder="Share relevant experience, partners or practical preparation." rows={4} value={values.hostExperience}/></label>
              <label>Responsible person on the day<input maxLength={120} onChange={(event) => update("safetyContactName", event.target.value)} placeholder="Full name" value={values.safetyContactName}/></label>
              <label>Private contact number<input maxLength={40} onChange={(event) => update("safetyContactPhone", event.target.value)} placeholder="+254…" type="tel" value={values.safetyContactPhone}/></label>
              <label className="form-wide">Accessibility or arrival information <small>Optional</small><textarea maxLength={1200} onChange={(event) => update("accessibilityNotes", event.target.value)} placeholder="Access needs, building entrance, transport or useful context." rows={3} value={values.accessibilityNotes}/></label>
              <label className="form-wide">Private note for the review team <small>Optional</small><textarea maxLength={1200} onChange={(event) => update("hostNote", event.target.value)} placeholder="Anything else we should understand." rows={3} value={values.hostNote}/></label>
            </div></div>
          ) : null}

          {step === 3 ? (
            <div className="community-event-wizard-step">
              <label className="member-event-community-choice"><input checked={values.communityAfterEvent} onChange={(event) => update("communityAfterEvent", event.target.checked)} type="checkbox"/><span><strong>This event may grow into a Community</strong><small>Guests will be asked separately whether they want to hear about it. Nobody is added automatically.</small></span></label>
              {values.communityAfterEvent ? <label>What might continue after the event?<textarea maxLength={800} minLength={20} onChange={(event) => update("communityIdea", event.target.value)} placeholder="Describe the shared purpose and what members could do together after meeting." rows={4} value={values.communityIdea}/></label> : null}
              {mediaReady ? <ApplicationImageField altText={posterAltText} existing={editingMedia} file={posterFile} label="Event poster" onAltText={setPosterAltText} onFile={setPosterFile} onRemoveExisting={() => void removePoster()} removing={busy} /> : <p className="application-image-unavailable">Optional poster uploads will appear after the latest database update. You can still send the Event proposal now.</p>}
              <div className="community-event-review-note"><strong>What happens next</strong><p>Our team checks the purpose, time, venue and safety details. If approved, the event appears publicly and guests can request a free place. After the event, you can apply to start a Community; each guest chooses whether to receive that invitation.</p></div>
            </div>
          ) : null}

          {message ? <p className="manager-message member-event-inline-message" role="alert">{message}</p> : null}
          <footer>
            <button className="button button-outline" disabled={busy} onClick={() => step === 0 ? setExpanded(false) : setStep((current) => current - 1)} type="button">{step === 0 ? "Close" : "Back"}</button>
            <div>{step === steps.length - 1 ? <button className="button button-outline" disabled={busy} onClick={() => void save(false)} type="button">Save draft</button> : null}{step < steps.length - 1 && (step !== 0 || eventPath === "public") ? <button className="button button-primary" onClick={continueForward} type="button">Continue</button> : step === steps.length - 1 ? <button className="button button-primary" disabled={busy} type="submit">{busy ? "Sending…" : "Send for review"}</button> : null}</div>
          </footer>
        </form>
      ) : null}

      {proposals.length ? <div className="community-event-proposal-list member-event-proposal-list">{proposals.map((proposal) => (
        <article key={proposal.proposal_id}>
          <header><div><span className={`proposal-state state-${proposal.status}`}>{statusLabels[proposal.status]}</span><h3>{proposal.title}</h3><p>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: proposal.timezone }).format(new Date(proposal.starts_at))} · {proposal.format.replaceAll("_", " ")}</p></div><strong>{proposal.capacity} places</strong></header>
          {proposal.review_note ? <div className="proposal-review-guidance"><strong>Review guidance</strong><p>{proposal.review_note}</p></div> : null}
          {proposal.community_name ? <p className="member-event-community-note">Connected to <Link href={`/communities/${proposal.community_slug}/about`}>{proposal.community_name}</Link>. Its name and join route appear on the approved event.</p> : null}
          {proposal.community_after_event ? <p className="member-event-community-note">A possible follow-up Community is included. Guests must opt in before receiving any invitation.</p> : null}
          {media.filter((item) => item.context_type === "member_event_proposal" && item.context_id === proposal.proposal_id).map((item) => <div className="application-image-member-summary" key={item.media_id}>{item.image_url ? <img alt={item.alt_text} src={item.image_url}/> : null}<div><strong>{applicationMediaStatus(item.status)}</strong><p>{item.alt_text}</p>{item.review_note ? <small>{item.review_note}</small> : null}</div></div>)}
          {mediaReady && !["cancelled", "declined"].includes(proposal.status) ? <ApplicationImageQuickEdit contextId={proposal.proposal_id} contextType="member_event_proposal" existing={media.find((item) => item.context_type === "member_event_proposal" && item.context_id === proposal.proposal_id) ?? null} label="Event poster" /> : null}
          <footer>
            {proposal.status === "approved" && proposal.canonical_event_slug ? <Link className="button button-primary" href={`/events/${proposal.canonical_event_slug}`}>View public event</Link> : null}
            {proposal.status === "approved" && new Date(proposal.ends_at) < new Date() ? <Link className="button button-outline" href="/communities#create-community">Apply for a follow-up Community</Link> : null}
            {["draft", "changes_requested"].includes(proposal.status) ? <button className="button button-primary" onClick={() => edit(proposal)} type="button">{proposal.status === "changes_requested" ? "Update and resend" : "Continue draft"}</button> : null}
            {["draft", "submitted", "changes_requested"].includes(proposal.status) ? <button className="button button-outline" disabled={busy} onClick={() => void cancel(proposal)} type="button">Cancel</button> : null}
          </footer>
        </article>
      ))}</div> : migrationReady && !expanded ? <div className="community-panel-empty"><strong>No event proposals yet</strong><p>Begin with one useful reason for people to meet. The review team will help with the rest.</p></div> : null}
      {message && !expanded ? <p className="manager-message" role="status">{message}</p> : null}
      {dialog}
    </section>
  );
}
