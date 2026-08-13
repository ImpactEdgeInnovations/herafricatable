"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import type { AdminMember } from "@/components/admin/member-review";
import type { MembershipIntakeAdmin } from "@/components/admin/membership-intake-control";

const intakeChoices = {
  manual_review: {
    label: "Review every request",
    summary: "Every completed application waits for your decision.",
  },
  trusted_auto: {
    label: "Welcome verified invitations automatically",
    summary: "Only a valid, unexpired invitation can skip manual review.",
  },
  closed: {
    label: "Pause new requests",
    summary: "Existing members can sign in, but new applications cannot be sent.",
  },
} as const;

const accessLabels: Record<string, string> = {
  active: "Active member",
  deleted: "Account closed",
  dormant: "Inactive",
  onboarding: "Completing profile",
  pending: "Not yet approved",
  suspended: "Access paused",
};

function firstName(member: AdminMember) {
  return member.display_name?.trim().split(/\s+/)[0] || member.email;
}

export function MemberCommandCentre({
  applicationJourneyReady,
  currentUserId,
  intake,
  intakeReady,
  members: initialMembers,
  migrationReady,
}: {
  applicationJourneyReady: boolean;
  currentUserId: string;
  intake: MembershipIntakeAdmin | null;
  intakeReady: boolean;
  members: AdminMember[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [members, setMembers] = useState(initialMembers);
  const [selected, setSelected] = useState(
    initialMembers.find((member) => member.access_status === "active")?.user_id ??
      initialMembers[0]?.user_id ??
      "",
  );
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const requests = members.filter(
    (member) =>
      member.access_status === "pending" &&
      ["submitted", "in_review"].includes(member.application_status ?? ""),
  );
  const activeCount = members.filter((member) => member.access_status === "active").length;
  const onboardingCount = members.filter((member) => member.access_status === "onboarding").length;
  const pausedCount = members.filter((member) => member.access_status === "suspended").length;
  const visibleMembers = members.filter((member) => {
    if (member.access_status === "deleted") return false;
    const haystack = [member.display_name, member.email, member.company, member.job_title, member.city, member.country]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const selectedMember = members.find((member) => member.user_id === selected) ?? visibleMembers[0];

  async function changeAccess(
    member: AdminMember,
    decision: "approve" | "decline" | "suspend" | "restore",
  ) {
    const copy = {
      approve: {
        confirm: "Approve and welcome",
        description: "This opens private profile setup. Member-only areas remain closed until she completes onboarding.",
        title: `Welcome ${firstName(member)}?`,
      },
      decline: {
        confirm: "Decline request",
        description: "Member access remains closed. Record a clear reason for the private audit history.",
        title: `Decline ${firstName(member)}'s request?`,
      },
      suspend: {
        confirm: "Pause access",
        description: "The member will lose access immediately. Her account and contributions remain preserved for review.",
        title: `Pause ${firstName(member)}'s access?`,
      },
      restore: {
        confirm: "Restore access",
        description: "The member can sign in and return to the areas she was previously allowed to use.",
        title: `Restore ${firstName(member)}'s access?`,
      },
    }[decision];
    const noteRequired = ["decline", "suspend"].includes(decision);
    const result = await ask({
      confirmLabel: copy.confirm,
      description: copy.description,
      fields: [{
        help: "Keep this factual and do not include unnecessary private information.",
        label: noteRequired ? "Reason" : "Internal note (optional)",
        maxLength: 1200,
        minLength: noteRequired ? 10 : undefined,
        name: "note",
        required: noteRequired,
        type: "textarea",
      }],
      title: copy.title,
      tone: ["decline", "suspend"].includes(decision) ? "danger" : "default",
    });
    if (!result) return;
    setBusy(member.user_id);
    setMessage("");
    const { data, error } = await supabase.rpc("review_member", {
      p_decision: decision,
      p_member_id: member.user_id,
      p_note: String(result.note ?? "Updated from Member oversight"),
    });
    if (error) {
      setMessage(adminErrorMessage(error, "update this member's access"));
      setBusy("");
      return;
    }
    setMembers((current) => current.map((item) => item.user_id === member.user_id ? {
      ...item,
      access_status: data as AdminMember["access_status"],
      application_status: decision === "approve" ? "approved" : decision === "decline" ? "declined" : item.application_status,
    } : item));
    if (decision === "approve") {
      try {
        const response = await fetch("/api/admin/notifications/process", {
          body: JSON.stringify({ dedupeKey: `member-approved:${member.user_id}` }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const delivery = (await response.json().catch(() => ({}))) as { sent?: number };
        setMessage(response.ok && Number(delivery.sent) > 0
          ? "Membership approved and the welcome email was sent."
          : "Membership approved. The welcome email is safely queued under Message delivery.");
      } catch {
        setMessage("Membership approved. The welcome email is safely queued under Message delivery.");
      }
    } else {
      setMessage(`${copy.confirm} completed and recorded.`);
    }
    setBusy("");
  }

  async function changeIntake() {
    if (!intakeReady || !intake) return;
    const result = await ask({
      confirmLabel: "Save joining setting",
      description: "Email verification alone never grants member access. Existing members and completed requests are not removed.",
      fields: [{
        initialValue: intake.mode,
        label: "How new members join",
        name: "mode",
        options: Object.entries(intakeChoices).map(([value, choice]) => ({ label: choice.label, value })),
        required: true,
        type: "select",
      }],
      title: "Change the joining setting?",
    });
    if (!result) return;
    const mode = String(result.mode) as keyof typeof intakeChoices;
    setBusy("intake");
    const { error } = await supabase.rpc("set_membership_intake_mode", {
      p_mode: mode,
      p_reason: `Membership intake changed to ${mode} from Member oversight`,
    });
    setBusy("");
    setMessage(error ? adminErrorMessage(error, "change how members join") : "Joining setting saved and recorded.");
    if (!error) router.refresh();
  }

  if (!migrationReady) return <section className="oversight-unavailable"><h1>Member oversight is temporarily unavailable.</h1><p>No access was changed. Reload after checking the latest database updates.</p></section>;

  return (
    <>
      <section className="oversight-hero member-oversight-hero">
        <div><p className="eyebrow">Member oversight</p><h1>Welcome carefully. Support quietly.</h1><p>Start with people waiting for a decision. Once approved, members manage their own profiles and participation; Admin steps in only for access, safety or support.</p></div>
        <div className="oversight-metrics"><article className={requests.length ? "has-work" : ""}><strong>{requests.length}</strong><span>requests waiting</span></article><article><strong>{activeCount}</strong><span>active members</span></article><article><strong>{onboardingCount}</strong><span>setting up profiles</span></article><article className={pausedCount ? "has-concern" : ""}><strong>{pausedCount}</strong><span>access paused</span></article></div>
      </section>

      {message ? <p className="oversight-message" role="status">{message}</p> : null}

      <section className="member-intake-summary">
        <div><p className="eyebrow">Joining setting</p><strong>{intake ? intakeChoices[intake.mode].label : "Review every request"}</strong><span>{intake ? intakeChoices[intake.mode].summary : "New requests remain under private review."}</span></div>
        <div><strong>{intake?.pending_applications ?? requests.length}</strong><span>waiting now</span></div>
        <button className="button button-outline" disabled={busy === "intake" || !intakeReady} onClick={() => void changeIntake()} type="button">Change setting</button>
      </section>

      <section className="member-request-desk" id="membership-requests">
        <header className="oversight-heading"><div><p className="eyebrow">Needs your decision</p><h2>Membership requests</h2><p>Review only completed applications. A verified email without an application never becomes a member automatically.</p></div><span>{requests.length} waiting</span></header>
        {!applicationJourneyReady ? <div className="oversight-clear"><strong>Application details need the latest database update.</strong><p>Member access remains protected.</p></div> : requests.length ? <div className="member-request-grid">{requests.map((member) => <article key={member.user_id}><header><div><span>New request</span><h3>{member.display_name || member.email}</h3><p>{[member.city, member.country].filter(Boolean).join(", ") || "Location not supplied"} · {member.email}</p></div><time>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" }).format(new Date(member.application_submitted_at ?? member.created_at))}</time></header><blockquote>{member.application_reason || "No membership reason supplied."}</blockquote><details><summary>Read application details</summary><dl><div><dt>Current focus</dt><dd>{member.application_professional_focus || "Not supplied"}</dd></div><div><dt>How she found us</dt><dd>{member.application_referral_source || "Not supplied"}</dd></div><div><dt>Introduced by</dt><dd>{member.application_referred_by || "Not supplied"}</dd></div></dl></details><footer><button className="button button-primary" disabled={busy === member.user_id} onClick={() => void changeAccess(member, "approve")}>Approve and welcome</button><button className="button button-outline" disabled={busy === member.user_id} onClick={() => void changeAccess(member, "decline")}>Decline</button></footer></article>)}</div> : <div className="oversight-clear"><strong>No membership request needs a decision.</strong><p>New completed requests will appear here automatically.</p></div>}
      </section>

      <section className="member-directory-desk" id="all-members">
        <header className="oversight-heading"><div><p className="eyebrow">Member care</p><h2>All member accounts</h2><p>Find a member, understand where she is in the journey and act only when support or access control is necessary.</p></div><label>Find a member<input onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, company or city" type="search" value={query}/></label></header>
        {visibleMembers.length ? <div className="member-oversight-layout"><nav aria-label="Choose a member">{visibleMembers.map((member) => <button aria-pressed={selectedMember?.user_id === member.user_id} key={member.user_id} onClick={() => setSelected(member.user_id)} type="button"><span className={`member-access-dot is-${member.access_status}`} aria-hidden="true"/><span><strong>{member.display_name || member.email}</strong><small>{member.display_name ? member.email : accessLabels[member.access_status]}</small></span><em>{accessLabels[member.access_status]}</em></button>)}</nav>{selectedMember ? <article className="member-oversight-card"><header><div><span>{accessLabels[selectedMember.access_status]}</span><h3>{selectedMember.display_name || selectedMember.email}</h3><p>{selectedMember.email}</p></div><strong>{selectedMember.profile_completion}%<small>profile complete</small></strong></header><dl><div><dt>Work</dt><dd>{[selectedMember.job_title, selectedMember.company].filter(Boolean).join(" · ") || "Not added yet"}</dd></div><div><dt>Location</dt><dd>{[selectedMember.city, selectedMember.country].filter(Boolean).join(", ") || "Not added yet"}</dd></div><div><dt>Joined</dt><dd>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(selectedMember.created_at))}</dd></div><div><dt>Onboarding</dt><dd>{selectedMember.access_status === "onboarding" ? "Profile setup in progress" : selectedMember.onboarding_completed_at ? "Completed" : "Not completed"}</dd></div></dl><aside><strong>Member-led by default</strong><p>She controls her profile, visibility, Communities and connections. Admin changes access only when there is a clear operational or safety reason.</p></aside><footer>{selectedMember.access_status === "suspended" ? <button className="button button-primary" disabled={busy === selectedMember.user_id} onClick={() => void changeAccess(selectedMember, "restore")}>Restore access</button> : selectedMember.user_id !== currentUserId && !["deleted", "pending"].includes(selectedMember.access_status) ? <button className="button button-outline danger-action" disabled={busy === selectedMember.user_id} onClick={() => void changeAccess(selectedMember, "suspend")}>Pause access</button> : null}<Link className="button button-outline" href="/admin/support">Open member support</Link></footer></article> : null}</div> : <div className="oversight-clear"><strong>No member matches that search.</strong><p>Try a name, email, company or location.</p></div>}
      </section>
      {dialog}
    </>
  );
}
