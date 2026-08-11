"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";

export type MemberEventProposalAdmin = {
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
  follow_up_interest_count: number;
  format: string;
  host_experience: string;
  host_note: string | null;
  map_url: string | null;
  online_url: string | null;
  proposal_id: string;
  proposed_by: string;
  proposer_email: string;
  proposer_name: string | null;
  review_note: string | null;
  safety_contact_name: string;
  safety_contact_phone: string;
  starts_at: string;
  status: string;
  submitted_at: string | null;
  summary: string;
  timezone: string;
  title: string;
  updated_at: string;
  venue_name: string | null;
};

const openStatuses = new Set(["submitted", "under_review"]);
const labels: Record<string, string> = {
  approved: "Approved",
  cancelled: "Cancelled by member",
  changes_requested: "Waiting for member update",
  declined: "Declined",
  draft: "Private member draft",
  submitted: "New",
  under_review: "In review",
};

export function MemberEventProposalManager({
  migrationReady,
  proposals,
}: {
  migrationReady: boolean;
  proposals: MemberEventProposalAdmin[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [filter, setFilter] = useState<"open" | "closed" | "all">("open");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const visible = proposals.filter((proposal) =>
    filter === "all" ? true : filter === "open" ? openStatuses.has(proposal.status) : !openStatuses.has(proposal.status),
  );
  const openCount = proposals.filter((proposal) => openStatuses.has(proposal.status)).length;

  async function review(
    proposal: MemberEventProposalAdmin,
    action: "approve" | "decline" | "request_changes" | "start_review",
  ) {
    let note = "";
    if (action !== "start_review") {
      const result = await ask({
        confirmLabel: action === "approve" ? "Approve and publish" : action === "request_changes" ? "Send guidance" : "Decline proposal",
        description:
          action === "approve"
            ? "This creates a free public event with manually reviewed registration. The member cannot publish, charge guests or access private attendee data directly."
            : action === "request_changes"
              ? "The member can update her private proposal and return it for review."
              : "This closes the proposal without creating an event. The decision remains in the audit record.",
        fields: [{
          help: action === "approve" ? "Optional internal context for the audit record." : "The member will see this guidance under Events.",
          label: action === "approve" ? "Approval note" : "Clear guidance for the member",
          maxLength: 1200,
          minLength: action === "approve" ? undefined : 10,
          name: "note",
          placeholder: action === "approve" ? "Optional note" : "Explain what should change or why this cannot proceed.",
          required: action !== "approve",
          type: "textarea",
        }],
        title: action === "approve" ? `Publish ${proposal.title}?` : action === "request_changes" ? `Ask ${proposal.proposer_name || "the member"} for an update?` : `Decline ${proposal.title}?`,
        tone: action === "decline" ? "danger" : "default",
      });
      if (!result) return;
      note = String(result.note ?? "");
    }

    setBusy(proposal.proposal_id);
    setMessage("");
    const { error } = await supabase.rpc("review_member_event_proposal", {
      p_action: action,
      p_proposal_id: proposal.proposal_id,
      p_review_note: note || null,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "review this public event proposal")
        : action === "approve"
          ? "Event approved and published with manual registration review."
          : action === "request_changes"
            ? "Guidance sent to the member."
            : action === "decline"
              ? "Proposal declined."
              : "Proposal marked as in review.",
    );
    if (!error) router.refresh();
  }

  return (
    <section className="admin-section community-event-review member-event-review" id="member-event-review" aria-labelledby="member-event-review-title">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Member-proposed public events</p>
          <h2 id="member-event-review-title">Review events from members</h2>
          <p>Check the idea, host readiness, venue and safety contact. This launch tier is free, public only after approval and uses manual registration review.</p>
        </div>
        <span className="status-count">{openCount} need review</span>
      </div>
      {!migrationReady ? (
        <div className="admin-empty"><strong>Public event proposals need their database update</strong><p>No member can submit or publish through this journey until the migration is applied.</p></div>
      ) : (
        <>
          <nav className="admin-filter-tabs" aria-label="Filter member event proposals">
            {(["open", "closed", "all"] as const).map((value) => <button aria-pressed={filter === value} key={value} onClick={() => setFilter(value)} type="button">{value === "open" ? "Needs a decision" : value === "closed" ? "Reviewed" : "All proposals"}</button>)}
          </nav>
          {visible.length ? <div className="community-event-review-list">{visible.map((proposal) => (
            <article key={proposal.proposal_id}>
              <header><div><span className={`proposal-state state-${proposal.status}`}>{labels[proposal.status] ?? proposal.status.replaceAll("_", " ")}</span><h3>{proposal.title}</h3><p>Public event · Proposed by {proposal.proposer_name || proposal.proposer_email}{proposal.community_name ? ` · Connected to ${proposal.community_name}` : " · Stands alone"}</p></div><time dateTime={proposal.submitted_at ?? proposal.created_at}>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(proposal.submitted_at ?? proposal.created_at))}</time></header>
              <p className="community-event-review-summary">{proposal.summary}</p>
              <dl>
                <div><dt>When</dt><dd>{new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: proposal.timezone }).format(new Date(proposal.starts_at))}</dd></div>
                <div><dt>Format</dt><dd>{proposal.format.replaceAll("_", " ")} · {proposal.capacity} places</dd></div>
                <div><dt>Place</dt><dd>{proposal.format === "virtual" ? "Online" : [proposal.venue_name, proposal.city, proposal.country].filter(Boolean).join(", ")}</dd></div>
                <div><dt>Access</dt><dd>Public · Free · Manual registration review</dd></div>
                <div><dt>Community</dt><dd>{proposal.community_name ? <><Link href={`/communities/${proposal.community_slug}/about`}>{proposal.community_name}</Link><small>{proposal.community_type === "private" ? "Private Community; event remains public" : "Open Community"}</small></> : "No Community attached"}</dd></div>
                <div><dt>Responsible person</dt><dd>{proposal.safety_contact_name}<small>{proposal.safety_contact_phone}</small></dd></div>
                <div><dt>Accessibility</dt><dd>{proposal.accessibility_notes || "No information supplied"}</dd></div>
                <div className="wide"><dt>Hosting readiness</dt><dd>{proposal.host_experience}</dd></div>
                {proposal.community_after_event ? <div className="wide"><dt>Possible Community afterwards</dt><dd>{proposal.community_idea}<small>{proposal.follow_up_interest_count} confirmed guests currently interested</small></dd></div> : null}
                {proposal.host_note ? <div className="wide"><dt>Private member note</dt><dd>{proposal.host_note}</dd></div> : null}
                {proposal.review_note ? <div className="wide review"><dt>Review note</dt><dd>{proposal.review_note}</dd></div> : null}
              </dl>
              <footer>
                {proposal.status === "submitted" ? <button className="button button-outline" disabled={busy === proposal.proposal_id} onClick={() => void review(proposal, "start_review")} type="button">Begin review</button> : null}
                {openStatuses.has(proposal.status) ? <><button className="button button-primary" disabled={busy === proposal.proposal_id} onClick={() => void review(proposal, "approve")} type="button">Approve free public event</button><button className="button button-outline" disabled={busy === proposal.proposal_id} onClick={() => void review(proposal, "request_changes")} type="button">Request changes</button><button className="button button-outline danger-action" disabled={busy === proposal.proposal_id} onClick={() => void review(proposal, "decline")} type="button">Decline</button></> : null}
                {proposal.canonical_event_slug ? <Link className="button button-outline" href={`/events/${proposal.canonical_event_slug}`}>View event</Link> : null}
              </footer>
            </article>
          ))}</div> : <div className="admin-empty admin-empty-compact"><strong>No proposals in this view</strong><p>New member event ideas will appear here with their private hosting and safety details.</p></div>}
        </>
      )}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
      {dialog}
    </section>
  );
}
