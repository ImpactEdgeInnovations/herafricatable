"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
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
    label: "Open pilot: welcome new members automatically",
    summary: "Anyone can verify her email and finish the short application. The first 20 active non-staff members receive automatic Community and event Host privileges. Automatic membership approval stops after 60 days.",
  },
  closed: {
    label: "Pause new requests",
    summary: "Existing members can sign in, but new applications cannot be sent.",
  },
} as const;

export type PilotMemberInvite = {
  id: string;
  email: string;
  status: string;
  expires_at: string | null;
  created_at: string;
};

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
  pilotEndsAt,
  pilotInvitations,
  pilotReady,
  pilotEventAutoDrafts,
  pilotFreeEventPublishing,
  communityPilot,
  members: initialMembers,
  migrationReady,
}: {
  applicationJourneyReady: boolean;
  currentUserId: string;
  intake: MembershipIntakeAdmin | null;
  intakeReady: boolean;
  pilotEndsAt: string | null;
  pilotInvitations: PilotMemberInvite[];
  pilotReady: boolean;
  pilotEventAutoDrafts: boolean | null;
  pilotFreeEventPublishing: boolean | null;
  communityPilot: { enabled: boolean; cohort_count: number; capacity: number; ends_at: string | null } | null;
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
  const realRequests = requests.filter((member) => !member.is_test_account);
  const testRequests = requests.filter((member) => member.is_test_account);
  const activeCount = members.filter((member) => member.access_status === "active" && !member.is_test_account).length;
  const onboardingCount = members.filter((member) => member.access_status === "onboarding" && !member.is_test_account).length;
  const pausedCount = members.filter((member) => member.access_status === "suspended" && !member.is_test_account).length;
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
    if (mode === "trusted_auto" && !pilotReady) {
      setMessage("Apply the timed invitation database update before opening automatic approval.");
      return;
    }
    setBusy("intake");
    const { error } = await supabase.rpc("set_membership_intake_mode", {
      p_mode: mode,
      p_reason: `Membership intake changed to ${mode} from Member oversight`,
    });
    setBusy("");
    setMessage(error ? adminErrorMessage(error, "change how members join") : "Joining setting saved and recorded.");
    if (!error) router.refresh();
  }

  async function invitePilotMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pilotReady || intake?.mode !== "trusted_auto") return;
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim().toLowerCase();
    if (!email) return;
    const confirmed = await ask({
      title: `Invite ${email}?`,
      description: "An invitation email will be sent. She must verify this address and complete the short application. The invitation does not grant a platform Admin role.",
      confirmLabel: "Send invitation",
    });
    if (!confirmed) return;
    setBusy("pilot-invite");
    setMessage("");
    const { data, error } = await supabase.rpc("invite_pilot_member", {
      p_email: email,
      p_note: null,
    });
    if (error) {
      setBusy("");
      setMessage(adminErrorMessage(error, "invite this person"));
      return;
    }
    form.reset();
    try {
      const response = await fetch("/api/admin/notifications/process", {
        body: JSON.stringify({ dedupeKey: `pilot-member-invite:${data}` }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const delivery = (await response.json().catch(() => ({}))) as { sent?: number };
      setMessage(response.ok && Number(delivery.sent) > 0
        ? "Invitation sent. She can verify her email and complete the short application."
        : "Invitation saved. Check Message delivery to confirm the email reaches her.");
    } catch {
      setMessage("Invitation saved. Check Message delivery to send or retry the email.");
    }
    setBusy("");
    router.refresh();
  }

  async function changePilotEventDrafts() {
    if (pilotEventAutoDrafts === null) return;
    const enabled = !pilotEventAutoDrafts;
    const confirmed = await ask({
      confirmLabel: enabled ? "Allow private event drafts" : "Turn off automatic drafts",
      description: enabled
        ? "Only approved members admitted through a direct pilot invitation can become Host of their own free, private event. Public publication and bookings still need the event team's approval."
        : "New ideas return to event-team review. Existing private events and Host access are unchanged.",
      title: enabled ? "Let founding members prepare their own events?" : "Stop automatic private event drafts?",
    });
    if (!confirmed) return;
    setBusy("pilot-events");
    const { error } = await supabase.rpc("set_invited_pilot_event_setting", {
      p_enabled: enabled,
      p_reason: `Invited pilot private event drafts ${enabled ? "enabled" : "disabled"} from Member oversight`,
    });
    setBusy("");
    setMessage(error ? adminErrorMessage(error, "change the pilot event setting") :
      enabled ? "Invited testers can now start private events. Public launch still needs review." :
        "Automatic private event creation is off. Existing events are unchanged.");
    if (!error) router.refresh();
  }

  async function changePilotFreeEvents() {
    if (pilotFreeEventPublishing === null) return;
    const enabled = !pilotFreeEventPublishing;
    const confirmed = await ask({
      confirmLabel: enabled ? "Allow free public events" : "Pause automatic publishing",
      description: enabled
        ? "The first-20 founding cohort can publish free events and updates immediately. Active members can book available places without review. Existing submitted events stay private until their Host opens them."
        : "New events will wait for review. Founding members may still get a private draft if that separate switch is on. Already published events stay public unless you pause them individually.",
      title: enabled ? "Open free event publishing?" : "Pause free event publishing?",
    });
    if (!confirmed) return;
    setBusy("pilot-public-events");
    const { error } = await supabase.rpc("set_pilot_free_event_setting", {
      p_enabled: enabled,
      p_reason: `Pilot free public events ${enabled ? "enabled" : "paused"} from Member oversight`,
    });
    setBusy("");
    setMessage(error ? adminErrorMessage(error, "change free event publishing") :
      enabled ? "Founding members can now publish free events and updates. Active members can book immediately." :
        "Automatic public publishing is off. Existing public events are unchanged.");
    if (!error) router.refresh();
  }

  async function changeCommunityOpening() {
    if (!communityPilot) return;
    const enabled = !communityPilot.enabled;
    const confirmed = await ask({ title: enabled ? "Allow founding Communities to open?" : "Pause automatic Community opening?", confirmLabel: enabled ? "Allow opening" : "Pause opening", description: "This changes new automatic Community openings and pilot invitations. Existing Communities and memberships remain unchanged; pause them individually when needed." });
    if (!confirmed) return;
    setBusy("pilot-communities");
    const { error } = await supabase.rpc("set_community_pilot_setting", { p_enabled: enabled, p_reason: `Founding Community automatic opening ${enabled ? "enabled" : "paused"} from pilot controls` });
    setBusy("");
    setMessage(error ? adminErrorMessage(error, "change Community opening") : "Community pilot setting saved. Existing Communities are unchanged.");
    if (!error) router.refresh();
  }

  async function revokePilotInvitation(invitation: PilotMemberInvite) {
    const result = await ask({
      title: `Withdraw ${invitation.email}'s invitation?`,
      description: "The invitation will no longer allow automatic approval. A delivered email cannot be recalled.",
      confirmLabel: "Withdraw invitation",
      tone: "danger",
      fields: [{ label: "Reason", name: "reason", type: "textarea", required: true, minLength: 8, maxLength: 500 }],
    });
    if (!result) return;
    setBusy(invitation.id);
    const { error } = await supabase.rpc("revoke_pilot_member_invitation", {
      p_invite_id: invitation.id,
      p_reason: String(result.reason ?? ""),
    });
    setBusy("");
    setMessage(error ? adminErrorMessage(error, "withdraw this invitation") : "Invitation withdrawn and recorded.");
    if (!error) router.refresh();
  }

  function renderRequestCard(member: AdminMember) {
    return <article key={member.user_id}>
      <header><div><span>{member.is_test_account ? "Test application" : "New request"}</span><h3>{member.display_name || member.email}</h3><p>{[member.city, member.country].filter(Boolean).join(", ") || "Location not supplied"} · {member.email}</p></div><time>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" }).format(new Date(member.application_submitted_at ?? member.created_at))}</time></header>
      <blockquote>{member.application_reason || "No membership reason supplied."}</blockquote>
      <details><summary>Read application details</summary><dl><div><dt>Current focus</dt><dd>{member.application_professional_focus || "Not supplied"}</dd></div><div><dt>How she found us</dt><dd>{member.application_referral_source || "Not supplied"}</dd></div><div><dt>Introduced by</dt><dd>{member.application_referred_by || "Not supplied"}</dd></div></dl></details>
      <footer><button className="button button-primary" disabled={busy === member.user_id} onClick={() => void changeAccess(member, "approve")}>Approve and welcome</button><button className="button button-outline" disabled={busy === member.user_id} onClick={() => void changeAccess(member, "decline")}>Decline</button></footer>
    </article>;
  }

  if (!migrationReady) return <section className="oversight-unavailable"><h1>Member oversight is temporarily unavailable.</h1><p>No access was changed. Reload after checking the latest database updates.</p></section>;

  return (
    <>
      <section className="oversight-hero member-oversight-hero">
        <div><p className="eyebrow">Member oversight</p><h1>Welcome carefully. Support quietly.</h1><p>Start with people waiting for a decision. Once approved, members manage their own profiles and participation; Admin steps in only for access, safety or support.</p></div>
        <div className="oversight-metrics"><article className={realRequests.length ? "has-work" : ""}><strong>{realRequests.length}</strong><span>real requests waiting</span></article><article><strong>{activeCount}</strong><span>active members</span></article><article><strong>{onboardingCount}</strong><span>setting up profiles</span></article><article className={pausedCount ? "has-concern" : ""}><strong>{pausedCount}</strong><span>access paused</span></article></div>
      </section>

      {message ? <p className="oversight-message" role="status">{message}</p> : null}

      <section className="member-intake-summary">
        <div><p className="eyebrow">Joining setting</p><strong>{intake ? intakeChoices[intake.mode].label : "Review every request"}</strong><span>{intake ? intakeChoices[intake.mode].summary : "New requests remain under private review."}</span></div>
        <div><strong>{realRequests.length}</strong><span>real requests waiting</span></div>
        <button className="button button-outline" disabled={busy === "intake" || !intakeReady} onClick={() => void changeIntake()} type="button">Change setting</button>
      </section>

      <section className="member-pilot-invite-desk" aria-labelledby="member-pilot-invite-title">
        <header className="oversight-heading"><div><p className="eyebrow">60-day open pilot</p><h2 id="member-pilot-invite-title">Welcome new members</h2><p>Anyone can sign up with a verified email and finish the short application. You may also send a personal invitation. The first 20 active non-staff members get automatic Host privileges; everyone after that can still become a member.</p></div></header>
        {!pilotReady ? <p role="status">The timed pilot controls need the latest database update. Automatic approval remains unavailable here.</p> : intake?.mode !== "trusted_auto" ? <p>Automatic welcome is off. Use “Change setting” above to open the 60-day pilot. New applications currently wait for your review.</p> : <>
          <p><strong>Automatic welcome ends {pilotEndsAt ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" }).format(new Date(pilotEndsAt)) : "when the pilot window closes"}.</strong> You can turn it off earlier from the joining setting. Existing approved members keep their access unless you pause it individually.</p>
          <form className="member-pilot-invite-form" onSubmit={(event) => void invitePilotMember(event)}><label>Email address<input autoComplete="email" maxLength={320} name="email" placeholder="name@example.com" required type="email"/></label><button className="button button-primary" disabled={busy === "pilot-invite"} type="submit">{busy === "pilot-invite" ? "Sending…" : "Invite by email"}</button></form>
        </>}
        {pilotReady && pilotInvitations.length ? <details><summary>Recent pilot invitations ({pilotInvitations.length})</summary><div className="member-pilot-invite-list">{pilotInvitations.map((invitation) => {
          const expired = invitation.expires_at ? new Date(invitation.expires_at).getTime() <= Date.now() : false;
          const open = invitation.status === "pending" && !expired;
          return <div key={invitation.id}><span><strong>{invitation.email}</strong><small>{expired && invitation.status === "pending" ? "Expired" : open ? "Waiting to join" : invitation.status.replaceAll("_", " ")}{invitation.expires_at ? ` · Valid until ${new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(invitation.expires_at))}` : ""}</small></span>{open ? <button className="button button-outline" disabled={busy === invitation.id} onClick={() => void revokePilotInvitation(invitation)} type="button">Withdraw</button> : null}</div>;
        })}</div></details> : null}
      </section>

      {!pilotFreeEventPublishing ? <section className="member-intake-summary" aria-label="Pilot event creation">
        <div><p className="eyebrow">Private pilot events</p><strong>{pilotEventAutoDrafts ? "Private event creation is on" : "Private event creation is off"}</strong><span>When public publishing is off, members in the first-20 cohort can still prepare a private Host page. Your team reviews the event before it becomes public. This ends with the 60-day pilot.</span></div>
        <button className="button button-outline" disabled={busy === "pilot-events" || pilotEventAutoDrafts === null || (intake?.mode !== "trusted_auto" && !pilotEventAutoDrafts)} onClick={() => void changePilotEventDrafts()} type="button">{pilotEventAutoDrafts ? "Turn off" : "Turn on"}</button>
      </section> : null}

      <section className="member-intake-summary" aria-label="Free public events">
        <div><p className="eyebrow">Free public events</p><strong>{pilotFreeEventPublishing === null ? "Database update needed" : pilotFreeEventPublishing ? "Automatic publishing is on" : "Automatic publishing is off"}</strong><span>When on, a member in the first-20 cohort can open a free public event during the 60-day pilot. She becomes its Host. Active members book available free places immediately. Host updates and images can also publish without review while this is on. Turn this off at any time; already published events remain open until paused individually.</span></div>
        <button className="button button-outline" disabled={busy === "pilot-public-events" || pilotFreeEventPublishing === null || (intake?.mode !== "trusted_auto" && !pilotFreeEventPublishing)} onClick={() => void changePilotFreeEvents()} type="button">{pilotFreeEventPublishing ? "Pause new events" : "Allow free events"}</button>
      </section>

      <section className="member-request-desk" id="membership-requests">
        {communityPilot ? <section className="member-intake-summary" aria-label="Founding Community opening"><div><p className="eyebrow">Community opening</p><strong>{communityPilot.enabled ? "Automatic opening is on" : "Automatic opening is off"}</strong><span>{communityPilot.cohort_count} of {communityPilot.capacity} founding places assigned. Each founding member can open one free Community and choose who joins. Pause an existing Community from Community oversight.</span></div><button className="button button-outline" type="button" disabled={busy === "pilot-communities" || (intake?.mode !== "trusted_auto" && !communityPilot.enabled)} onClick={() => void changeCommunityOpening()}>{communityPilot.enabled ? "Pause new Communities" : "Allow Communities"}</button></section> : null}
        <header className="oversight-heading"><div><p className="eyebrow">Needs your decision</p><h2>Membership requests</h2><p>Review only completed applications. A verified email without an application never becomes a member automatically.</p></div><span>{realRequests.length} real waiting</span></header>
        {!applicationJourneyReady ? <div className="oversight-clear"><strong>Application details need the latest database update.</strong><p>Member access remains protected.</p></div> : realRequests.length ? <div className="member-request-grid">{realRequests.map(renderRequestCard)}</div> : <div className="oversight-clear"><strong>No real membership request needs a decision.</strong><p>New completed requests will appear here automatically.</p></div>}
        {applicationJourneyReady && testRequests.length ? <details className="member-test-requests"><summary>Test applications ({testRequests.length}) — separate from real requests</summary><p>These accounts are for rehearsals. Check the details before making a test decision.</p><div className="member-request-grid">{testRequests.map(renderRequestCard)}</div></details> : null}
      </section>

      <section className="member-directory-desk" id="all-members">
        <header className="oversight-heading"><div><p className="eyebrow">Member care</p><h2>All member accounts</h2><p>Find a member, understand where she is in the journey and act only when support or access control is necessary.</p></div><label>Find a member<input onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, company or city" type="search" value={query}/></label></header>
        {visibleMembers.length ? <div className="member-oversight-layout"><nav aria-label="Choose a member">{visibleMembers.map((member) => <button aria-pressed={selectedMember?.user_id === member.user_id} key={member.user_id} onClick={() => setSelected(member.user_id)} type="button"><span className={`member-access-dot is-${member.access_status}`} aria-hidden="true"/><span><strong>{member.display_name || member.email}</strong><small>{member.is_test_account ? `Test account · ${member.email}` : member.display_name ? member.email : accessLabels[member.access_status]}</small></span><em>{accessLabels[member.access_status]}</em></button>)}</nav>{selectedMember ? <article className="member-oversight-card"><header><div><span>{selectedMember.is_test_account ? `Test account · ${accessLabels[selectedMember.access_status]}` : accessLabels[selectedMember.access_status]}</span><h3>{selectedMember.display_name || selectedMember.email}</h3><p>{selectedMember.email}</p></div><strong>{selectedMember.profile_completion}%<small>profile complete</small></strong></header><dl><div><dt>Work</dt><dd>{[selectedMember.job_title, selectedMember.company].filter(Boolean).join(" · ") || "Not added yet"}</dd></div><div><dt>Location</dt><dd>{[selectedMember.city, selectedMember.country].filter(Boolean).join(", ") || "Not added yet"}</dd></div><div><dt>Joined</dt><dd>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(selectedMember.created_at))}</dd></div><div><dt>Onboarding</dt><dd>{selectedMember.access_status === "onboarding" ? "Profile setup in progress" : selectedMember.onboarding_completed_at ? "Completed" : "Not completed"}</dd></div></dl><aside><strong>Member-led by default</strong><p>She controls her profile, visibility, Communities and connections. Admin changes access only when there is a clear operational or safety reason.</p></aside><footer>{selectedMember.access_status === "suspended" ? <button className="button button-primary" disabled={busy === selectedMember.user_id} onClick={() => void changeAccess(selectedMember, "restore")}>Restore access</button> : selectedMember.user_id !== currentUserId && !["deleted", "pending"].includes(selectedMember.access_status) ? <button className="button button-outline danger-action" disabled={busy === selectedMember.user_id} onClick={() => void changeAccess(selectedMember, "suspend")}>Pause access</button> : null}<Link className="button button-outline" href="/admin/support">Open member support</Link></footer></article> : null}</div> : <div className="oversight-clear"><strong>No member matches that search.</strong><p>Try a name, email, company or location.</p></div>}
      </section>
      {dialog}
    </>
  );
}
