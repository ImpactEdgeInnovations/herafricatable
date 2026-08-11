"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";

export type MemberEventProposal = {
  accessibility_notes: string | null;
  address_line: string | null;
  canonical_event_id: string | null;
  canonical_event_slug: string | null;
  capacity: number;
  city: string | null;
  community_after_event: boolean;
  community_idea: string | null;
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
  migrationReady,
  proposals,
}: {
  migrationReady: boolean;
  proposals: MemberEventProposal[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState(initialValues);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function update(key: keyof ReturnType<typeof initialValues>, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function startNew() {
    setEditingId(null);
    setValues(initialValues());
    setStep(0);
    setMessage("");
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
    setMessage("");
    setExpanded(true);
  }

  function continueForward() {
    if (step === 0 && (values.title.trim().length < 4 || values.summary.trim().length < 40)) {
      setMessage("Add a clear name and explain who this event will help.");
      return;
    }
    if (step === 1) {
      const start = new Date(values.startsAt);
      const end = new Date(values.endsAt);
      if (!values.startsAt || !values.endsAt || end <= start) {
        setMessage("Choose a start and end time for the event.");
        return;
      }
      if (start.getTime() < Date.now() + 7 * 86_400_000) {
        setMessage("Choose a date at least seven days away so there is time for review.");
        return;
      }
      const capacity = Number(values.capacity);
      if (!Number.isInteger(capacity) || capacity < 5 || capacity > 500) {
        setMessage("Choose a guest limit between 5 and 500.");
        return;
      }
      if (values.format !== "virtual" && (!values.venueName.trim() || !values.city.trim())) {
        setMessage("Add the venue and city for this event.");
        return;
      }
      if (values.format !== "in_person" && !values.onlineUrl.startsWith("https://")) {
        setMessage("Add the full private online link, beginning with https://.");
        return;
      }
    }
    if (step === 2 && (
      values.hostExperience.trim().length < 20 ||
      values.safetyContactName.trim().length < 2 ||
      values.safetyContactPhone.trim().length < 7
    )) {
      setMessage("Tell us how you will host responsibly and add the day-of-event contact.");
      return;
    }
    if (step === 3 && values.communityAfterEvent && values.communityIdea.trim().length < 20) {
      setMessage("Briefly describe the Community that might continue after this event.");
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
    setMessage("");
  }

  async function save(submit: boolean) {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_member_event_proposal", {
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
      p_submit: submit,
      p_summary: values.summary.trim(),
      p_timezone: values.timezone,
      p_title: values.title.trim(),
      p_venue_name: values.venueName.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMessage(memberErrorMessage(error, submit ? "send this event for review" : "save this private draft"));
      return;
    }
    setMessage(submit ? "Your event is with the review team." : "Private draft saved.");
    setExpanded(false);
    setEditingId(null);
    router.refresh();
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
        <span><b>2</b> Admin reviews it</span>
        <span><b>3</b> The approved event becomes public</span>
        <span><b>4</b> Attendees choose whether to stay connected</span>
      </div>

      {!migrationReady ? (
        <div className="community-panel-empty"><strong>Member event proposals are almost ready</strong><p>Apply the latest database update first. Existing events are unchanged.</p></div>
      ) : null}

      {expanded && migrationReady ? (
        <form className="community-event-wizard member-event-wizard" onSubmit={submit}>
          <header><div><p className="eyebrow">{editingId ? "Continue your draft" : "New public event"}</p><h3>{steps[step]}</h3></div><span>{step + 1} of {steps.length}</span></header>
          <div className="community-event-wizard-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((label, index) => <span className={index <= step ? "active" : ""} key={label}><i />{label}</span>)}
          </div>

          {step === 0 ? (
            <div className="community-event-wizard-step">
              <label>Event name<input maxLength={140} onChange={(event) => update("title", event.target.value)} placeholder="For example: Women in trade breakfast" value={values.title}/></label>
              <label>What will people gain?<textarea maxLength={2000} minLength={40} onChange={(event) => update("summary", event.target.value)} placeholder="Tell us who the event is for, why it matters and what guests should leave with." rows={5} value={values.summary}/><small>{values.summary.length}/2000 characters</small></label>
              <div className="community-event-fixed-terms"><span>Public after approval</span><span>Free launch tier</span><p>Anyone can see an approved event. Registration remains reviewed by Her Africa Table. Paid member events will open only after settlement and refund checks pass.</p></div>
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
              <div className="community-event-review-note"><strong>What happens next</strong><p>Admin checks the purpose, timing, venue, hosting readiness and safety contact. Approval creates a free public event with reviewed registration. After the event, you may apply to start a Community; interested guests choose whether to receive that invitation.</p></div>
            </div>
          ) : null}

          {message ? <p className="manager-message" role="alert">{message}</p> : null}
          <footer>
            <button className="button button-outline" disabled={busy} onClick={() => step === 0 ? setExpanded(false) : setStep((current) => current - 1)} type="button">{step === 0 ? "Close" : "Back"}</button>
            <div>{step === steps.length - 1 ? <button className="button button-outline" disabled={busy} onClick={() => void save(false)} type="button">Save private draft</button> : null}{step < steps.length - 1 ? <button className="button button-primary" onClick={continueForward} type="button">Continue</button> : <button className="button button-primary" disabled={busy} type="submit">{busy ? "Sending…" : "Send for review"}</button>}</div>
          </footer>
        </form>
      ) : null}

      {proposals.length ? <div className="community-event-proposal-list member-event-proposal-list">{proposals.map((proposal) => (
        <article key={proposal.proposal_id}>
          <header><div><span className={`proposal-state state-${proposal.status}`}>{statusLabels[proposal.status]}</span><h3>{proposal.title}</h3><p>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: proposal.timezone }).format(new Date(proposal.starts_at))} · {proposal.format.replaceAll("_", " ")}</p></div><strong>{proposal.capacity} places</strong></header>
          {proposal.review_note ? <div className="proposal-review-guidance"><strong>Review guidance</strong><p>{proposal.review_note}</p></div> : null}
          {proposal.community_after_event ? <p className="member-event-community-note">A possible follow-up Community is included. Guests must opt in before receiving any invitation.</p> : null}
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
