"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import type { CommunityHostApplicationAdmin } from "@/components/admin/community-host-application-manager";
import type { CommunityMember } from "@/components/admin/community-manager";
import type { CommunitySummary } from "@/components/member/community-directory";
import { ApplicationImageReview } from "@/components/admin/application-image-review";
import type { ApplicationProposalMedia } from "@/lib/application-proposal-media";

export type CommunityHealth = {
  active_members: number;
  comments_7d: number;
  community_id: string;
  open_reports: number;
  pending_members: number;
  posts_7d: number;
  unanswered_asks: number;
  upcoming_gatherings: number;
};

type AdminCommunityBranding = {
  community_id: string;
  cover_alt_text: string | null;
  cover_url: string | null;
  icon_alt_text: string | null;
  icon_url: string | null;
  tagline: string | null;
};

const applicationLabels: Record<string, string> = {
  business_and_career: "Business and careers",
  creative_industries: "Creative industries",
  hobby_and_interest: "Hobby or shared interest",
  investment: "Investment",
  leadership: "Leadership",
  other: "Other",
  social_impact: "Social impact",
  technology: "Technology",
  wellbeing: "Wellbeing",
};

function plural(value: number, one: string, many = `${one}s`) {
  return `${value} ${value === 1 ? one : many}`;
}

export function CommunityCommandCentre({
  applicationReady,
  applicationMedia,
  applications,
  branding,
  communities,
  health,
  members,
  migrationReady,
}: {
  applicationReady: boolean;
  applicationMedia: ApplicationProposalMedia[];
  applications: CommunityHostApplicationAdmin[];
  branding: AdminCommunityBranding[];
  communities: CommunitySummary[];
  health: CommunityHealth[];
  members: CommunityMember[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(communities[0]?.community_id ?? "");
  const openApplications = applications.filter((application) =>
    ["pending", "under_review"].includes(application.status),
  );
  const activeCommunities = communities.filter(
    (community) => community.status === "published",
  ).length;
  const totalMembers = health.reduce(
    (total, community) => total + Number(community.active_members),
    0,
  );
  const openConcerns = health.reduce(
    (total, community) => total + Number(community.open_reports),
    0,
  );

  async function reviewApplication(
    application: CommunityHostApplicationAdmin,
    action: "approve" | "decline" | "request_changes" | "start_review",
  ) {
    const needsNote = action === "decline" || action === "request_changes";
    const result = await ask({
      confirmLabel:
        action === "approve"
          ? "Approve and create draft"
          : action === "request_changes"
            ? "Send guidance"
            : action === "decline"
              ? "Decline proposal"
              : "Begin review",
      description:
        action === "approve"
          ? "This creates a private draft and makes the applicant its owner. Nothing is published until the launch checks pass."
          : action === "start_review"
            ? "The member will see that her proposal is being reviewed."
            : "The member will receive your note and the decision will remain in the audit record.",
      fields: [
        ...(action === "approve"
          ? [{
              help: "This becomes the Community address. Lowercase letters and hyphens only.",
              initialValue: application.proposed_slug,
              label: "Community address",
              name: "slug",
              required: true,
              type: "text" as const,
            }]
          : []),
        ...(needsNote
          ? [{
              label: "Clear guidance for the member",
              maxLength: 2000,
              minLength: 10,
              name: "note",
              required: true,
              type: "textarea" as const,
            }]
          : []),
      ],
      title:
        action === "approve"
          ? `Approve ${application.community_name}?`
          : action === "request_changes"
            ? `Ask ${application.applicant_name} for an update?`
            : action === "decline"
              ? `Decline ${application.community_name}?`
              : `Review ${application.community_name}?`,
      tone: action === "decline" ? "danger" : "default",
    });
    if (!result) return;
    setBusy(application.application_id);
    setMessage("");
    const { error } = await supabase.rpc("review_community_host_application", {
      p_action: action,
      p_admin_note: String(result.note ?? ""),
      p_application_id: application.application_id,
      p_approved_slug: String(result.slug ?? application.proposed_slug),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "review this Community proposal")
        : action === "approve"
          ? "Approved. A private draft was created and the member is now its owner."
          : action === "request_changes"
            ? "Your guidance was sent to the member."
            : action === "start_review"
              ? "This proposal is now marked as in review."
              : "The proposal was declined and the member was informed.",
    );
    if (!error) router.refresh();
  }

  async function manageLifecycle(
    community: CommunitySummary,
    action: "pause" | "close" | "reopen" | "replace_host",
  ) {
    const roster = members.filter(
      (member) => member.community_id === community.community_id,
    );
    const successorOptions = roster
      .filter(
        (member) =>
          member.role !== "owner" &&
          ["active", "paused", "suspended"].includes(member.status),
      )
      .map((member) => ({
        label: `${member.display_name || "Member"} · ${member.role}`,
        value: member.membership_id,
      }));
    if (action === "replace_host" && !successorOptions.length) {
      setMessage(
        "Add an active member or backup moderator before replacing the owner.",
      );
      return;
    }
    const labels = {
      close: { confirm: "Close and preserve", title: "Close" },
      pause: { confirm: "Pause and preserve", title: "Pause" },
      reopen: { confirm: "Reopen Community", title: "Reopen" },
      replace_host: { confirm: "Transfer ownership", title: "Replace the owner of" },
    }[action];
    const result = await ask({
      confirmLabel: labels.confirm,
      description:
        action === "pause"
          ? "Member access and new activity will stop. Posts, memberships and records remain preserved while the issue is reviewed."
          : action === "reopen"
            ? "Member access and preserved conversations return after the release checks confirm an active owner and backup moderator."
            : action === "replace_host"
              ? "The selected person becomes the owner. The previous owner remains in the Community as a member and the transfer is recorded."
              : "The Community will close to new activity. Its records remain preserved under the platform retention policy.",
      fields: [
        ...(action === "replace_host"
          ? [{
              help: "Choose an existing member or backup moderator who has agreed to lead.",
              label: "New Community owner",
              name: "successor",
              options: successorOptions,
              required: true,
              type: "select" as const,
            }]
          : []),
        {
          help: "Record the operational or safety reason without adding unnecessary private information.",
          label: action === "reopen" ? "Reason for reopening" : "Reason",
          maxLength: 1000,
          minLength: 10,
          name: "reason",
          required: true,
          type: "textarea" as const,
        },
      ],
      title: `${labels.title} ${community.name}?`,
      tone: ["pause", "close"].includes(action) ? "danger" : "default",
    });
    if (!result) return;
    setBusy(`lifecycle-${community.community_id}`);
    setMessage("");
    const { error } = await supabase.rpc("manage_community_lifecycle", {
      p_action: action,
      p_community_id: community.community_id,
      p_reason: String(result.reason ?? ""),
      p_successor_membership_id:
        action === "replace_host" ? String(result.successor) : null,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, `${action} this Community`)
        : action === "replace_host"
          ? `${community.name} now has a new owner. The transfer was recorded.`
          : `${community.name} was ${action === "pause" ? "paused" : action === "reopen" ? "reopened" : "closed"}. Members were informed and records were preserved.`,
    );
    if (!error) router.refresh();
  }

  if (!migrationReady) {
    return (
      <section className="community-command-empty">
        <p className="eyebrow">Community oversight</p>
        <h1>This desk needs the latest Community database updates.</h1>
        <p>No Community has been changed. Apply the outstanding updates, then reload this page.</p>
      </section>
    );
  }

  return (
    <>
      <section className="community-command-hero">
        <div>
          <p className="eyebrow">Community oversight</p>
          <h1>A clear view, without running every room.</h1>
          <p>
            Approve the person and purpose once. After launch, the owner welcomes members and leads the room; Admin steps in for safety, continuity or a formal complaint.
          </p>
        </div>
        <div className="community-command-metrics" aria-label="Community overview">
          <article><strong>{openApplications.length}</strong><span>proposals waiting</span></article>
          <article><strong>{activeCommunities}</strong><span>open Communities</span></article>
          <article><strong>{totalMembers}</strong><span>active memberships</span></article>
          <article className={openConcerns ? "has-concern" : ""}><strong>{openConcerns}</strong><span>reported concerns</span></article>
        </div>
      </section>

      {message ? <p className="community-command-message" role="status">{message}</p> : null}

      <section className="community-application-desk" id="community-applications">
        <header className="community-command-heading">
          <div><p className="eyebrow">Needs your decision</p><h2>New Community proposals</h2><p>See who is starting the Community, why it should exist and how she plans to keep it safe.</p></div>
          <span>{plural(openApplications.length, "proposal")}</span>
        </header>
        {!applicationReady ? <div className="community-command-clear"><strong>Community applications need the latest database repair.</strong><p>Existing Communities remain available below. No application decision can be made until the update is applied.</p></div> : openApplications.length ? (
          <div className="community-application-list">
            {openApplications.map((application) => (
              <article key={application.application_id}>
                <header>
                  <div><span>{application.status === "under_review" ? "In review" : "New proposal"}</span><h3>{application.community_name}</h3><p>Started by <strong>{application.applicant_name}</strong> · {application.applicant_email}</p></div>
                  <dl><div><dt>Focus</dt><dd>{applicationLabels[application.category] ?? application.category}</dd></div><div><dt>First year</dt><dd>{plural(application.expected_members, "member")}</dd></div></dl>
                </header>
                <blockquote>{application.purpose}</blockquote>
                <ApplicationImageReview
                  media={applicationMedia.find((item) => item.context_id === application.application_id) ?? null}
                  name={application.community_name}
                />
                <details>
                  <summary>Read the full proposal</summary>
                  <div className="community-application-details">
                    <section><span>Who it is for</span><p>{application.intended_members}</p></section>
                    <section><span>Host readiness</span><p>{application.host_experience}</p></section>
                    <section><span>Safety and boundaries</span><p>{application.safety_plan}</p></section>
                    <section><span>Joining</span><p>{application.admission_model === "application_review" ? "The owner reviews each request" : application.admission_model === "invitation_only" ? "Invitation only" : "Members may request to join"}</p></section>
                  </div>
                </details>
                <footer>
                  {application.status === "pending" ? <button className="button button-outline" disabled={busy === application.application_id} onClick={() => void reviewApplication(application, "start_review")}>Begin review</button> : null}
                  <button className="button button-outline" disabled={busy === application.application_id} onClick={() => void reviewApplication(application, "request_changes")}>Ask for an update</button>
                  <button className="button button-primary" disabled={busy === application.application_id} onClick={() => void reviewApplication(application, "approve")}>Approve and create draft</button>
                  <button className="button button-quiet" disabled={busy === application.application_id} onClick={() => void reviewApplication(application, "decline")}>Decline</button>
                </footer>
              </article>
            ))}
          </div>
        ) : <div className="community-command-clear"><strong>No Community proposals are waiting.</strong><p>New submissions will appear here automatically.</p></div>}
      </section>

      <section className="community-oversight-desk" id="community-overview">
        <header className="community-command-heading">
          <div><p className="eyebrow">Light-touch oversight</p><h2>All Communities</h2><p>Choose a Community to see its owner, membership movement and useful health signals—not private conversations.</p></div>
          <span>{plural(communities.length, "Community", "Communities")}</span>
        </header>
        {communities.length ? (
          <div className="community-oversight-layout">
            <nav aria-label="Choose a Community">
              {communities.map((community) => {
                const communityHealth = health.find((item) => item.community_id === community.community_id);
                const owner = members.find((item) => item.community_id === community.community_id && item.role === "owner");
                return <button aria-pressed={selected === community.community_id} key={community.community_id} onClick={() => setSelected(community.community_id)} type="button"><span className={`community-status-dot is-${community.status}`} aria-hidden="true"/><span><strong>{community.name}</strong><small>{owner?.display_name || "Owner being assigned"}</small></span>{Number(communityHealth?.open_reports ?? 0) > 0 ? <em>{communityHealth?.open_reports} concern</em> : <em>{community.status}</em>}</button>;
              })}
            </nav>
            {communities.filter((community) => community.community_id === selected).map((community) => {
              const communityHealth = health.find((item) => item.community_id === community.community_id);
              const roster = members.filter((item) => item.community_id === community.community_id);
              const owner = roster.find((item) => item.role === "owner");
              const linkedApplication = applications.find((item) => item.created_community_id === community.community_id);
              const identity = branding.find((item) => item.community_id === community.community_id);
              const isPaused = community.status === "draft" && roster.some((member) => ["paused", "suspended"].includes(member.status));
              return <article className="community-oversight-card" key={community.community_id}>
                {identity?.cover_url || identity?.icon_url ? <div className="community-oversight-branding">{identity.cover_url ? <img className="community-oversight-cover" alt={identity.cover_alt_text || ""} src={identity.cover_url}/> : <span/>}{identity.icon_url ? <img className="community-oversight-icon" alt={identity.icon_alt_text || `${community.name} icon`} src={identity.icon_url}/> : null}</div> : null}
                <header><div><span>{isPaused ? "Paused" : community.status === "published" ? "Open" : community.status}</span><h3>{community.name}</h3><p>{community.tagline || community.description}</p></div><div className="community-oversight-owner"><small>Community owner</small><strong>{owner?.display_name || linkedApplication?.applicant_name || "Not assigned"}</strong>{linkedApplication?.applicant_email ? <span>{linkedApplication.applicant_email}</span> : null}</div></header>
                <div className="community-health-strip">
                  <article><strong>{Number(communityHealth?.active_members ?? community.member_count)}</strong><span>members</span></article>
                  <article><strong>{Number(communityHealth?.pending_members ?? community.pending_count)}</strong><span>joining</span></article>
                  <article><strong>{Number(communityHealth?.posts_7d ?? 0) + Number(communityHealth?.comments_7d ?? 0)}</strong><span>contributions this week</span></article>
                  <article><strong>{Number(communityHealth?.upcoming_gatherings ?? 0)}</strong><span>upcoming gatherings</span></article>
                </div>
                <div className="community-oversight-notes">
                  <p><strong>Owner-led:</strong> {community.effective_mode === "open" ? "Approved platform members join automatically." : "The owner reviews requests and welcomes members."}</p>
                  <p className={Number(communityHealth?.open_reports ?? 0) ? "has-concern" : ""}><strong>Safety:</strong> {Number(communityHealth?.open_reports ?? 0) ? `${plural(Number(communityHealth?.open_reports), "reported concern")} needs Admin review.` : "No reported concern needs Admin attention."}</p>
                  {Number(communityHealth?.unanswered_asks ?? 0) ? <p><strong>Community pulse:</strong> {plural(Number(communityHealth?.unanswered_asks), "member question")} has not received a reply yet. The owner can follow up.</p> : null}
                </div>
                <details className="community-roster">
                  <summary>View {plural(roster.length, "person", "people")} in this Community</summary>
                  <div>{roster.map((member) => <article key={member.membership_id}><div><strong>{member.display_name || "Member"}</strong><span>{[member.job_title, member.company].filter(Boolean).join(" · ") || "Member profile"}</span></div><p>{member.role === "owner" ? "Owner" : member.role === "moderator" ? "Moderator" : "Member"}<small>{member.status}</small></p></article>)}</div>
                </details>
                <footer>
                  <Link className="button button-outline" href={`/communities/${community.slug}/about`}>View public details</Link>
                  <Link className="button button-outline" href={`/admin/cohort?community=${community.community_id}#community-release-title`}>Launch checks</Link>
                  {Number(communityHealth?.open_reports ?? 0) ? <Link className="button button-primary" href="/admin/safety">Review concern</Link> : null}
                  {isPaused ? <button className="button button-primary" disabled={busy === `lifecycle-${community.community_id}`} onClick={() => void manageLifecycle(community, "reopen")}>Reopen Community</button> : null}
                  {community.status === "published" ? <button className="button button-quiet" disabled={busy === `lifecycle-${community.community_id}`} onClick={() => void manageLifecycle(community, "pause")}>Pause Community</button> : null}
                  {community.status !== "archived" && roster.some((member) => member.role !== "owner" && ["active", "paused", "suspended"].includes(member.status)) ? <button className="button button-quiet" disabled={busy === `lifecycle-${community.community_id}`} onClick={() => void manageLifecycle(community, "replace_host")}>Replace owner</button> : null}
                  {community.status !== "archived" ? <button className="button button-quiet danger-action" disabled={busy === `lifecycle-${community.community_id}`} onClick={() => void manageLifecycle(community, "close")}>Close</button> : null}
                </footer>
              </article>;
            })}
          </div>
        ) : <div className="community-command-clear"><strong>No Community has been created yet.</strong><p>Approve the first suitable proposal to create its private draft.</p></div>}
      </section>
      {dialog}
    </>
  );
}
