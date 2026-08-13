"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type AdminMember = {
  access_status:
    | "pending"
    | "onboarding"
    | "active"
    | "dormant"
    | "suspended"
    | "deleted";
  company: string | null;
  city: string | null;
  country: string | null;
  created_at: string;
  display_name: string | null;
  email: string;
  job_title: string | null;
  onboarding_completed_at: string | null;
  profile_completion: number;
  user_id: string;
  application_professional_focus?: string | null;
  application_reason?: string | null;
  application_referral_source?: string | null;
  application_referred_by?: string | null;
  application_status?: string | null;
  application_submitted_at?: string | null;
};

export function MemberReview({
  initialMembers,
  currentUserId,
  migrationReady,
  applicationJourneyReady,
}: {
  initialMembers: AdminMember[];
  currentUserId: string;
  migrationReady: boolean;
  applicationJourneyReady: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [members, setMembers] = useState(initialMembers);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const readyForReview = members.filter(
    (member) =>
      member.access_status === "pending" &&
      ["submitted", "in_review"].includes(member.application_status ?? ""),
  ).length;

  async function review(
    memberId: string,
    decision: "approve" | "decline" | "suspend" | "restore",
    note = "Updated from the Her Africa Table admin workspace",
  ) {
    setWorkingId(memberId);
    setMessage("");
    const { data, error } = await supabase.rpc("review_member", {
      p_member_id: memberId,
      p_decision: decision,
      p_note: note,
    });

    if (error) {
      setMessage(adminErrorMessage(error, "update this member's access"));
    } else {
      setMembers((current) =>
        current.map((member) =>
          member.user_id === memberId
            ? {
                ...member,
                access_status: data as AdminMember["access_status"],
                application_status:
                  decision === "approve"
                    ? "approved"
                    : decision === "decline"
                      ? "declined"
                      : member.application_status,
              }
            : member,
        ),
      );
      setMessage(`Member status updated to ${String(data).replace("_", " ")}.`);
    }
    setWorkingId(null);
  }

  async function confirmReview(
    member: AdminMember,
    decision: "approve" | "decline",
  ) {
    const result = await ask({
      confirmLabel: decision === "approve" ? "Approve membership" : "Decline request",
      description:
        decision === "approve"
          ? "This opens the member's private onboarding. Community and network access remain closed until she completes it."
          : "This keeps member access closed. She can update and resubmit her request later.",
      fields: [
        {
          help:
            decision === "approve"
              ? "Optional internal context for the audit record."
              : "Record a clear internal reason for this decision.",
          label: "Review note",
          maxLength: 1200,
          minLength: decision === "decline" ? 10 : undefined,
          name: "note",
          placeholder:
            decision === "approve"
              ? "Optional note"
              : "Why is this request not being approved?",
          required: decision === "decline",
          type: "textarea",
        },
      ],
      title:
        decision === "approve"
          ? `Welcome ${member.display_name || member.email}?`
          : `Decline ${member.display_name || member.email}'s request?`,
      tone: decision === "decline" ? "danger" : "default",
    });
    if (!result) return;
    await review(member.user_id, decision, String(result.note ?? ""));
  }

  return (
    <section
      className="admin-section"
      id="members"
      aria-labelledby="member-review-title"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Membership decisions</p>
          <h2 id="member-review-title">Review membership requests</h2>
          <p>
            Review completed membership requests, follow onboarding, and pause
            access when required.
          </p>
        </div>
        <span className="status-count">{readyForReview} ready for review</span>
      </div>

      {!applicationJourneyReady ? (
        <div className="admin-empty">
          <strong>Membership request details are awaiting the database update</strong>
          <p>
            Existing access controls remain available. Apply the latest
            membership application migration to begin collecting private
            applicant context.
          </p>
        </div>
      ) : readyForReview ? (
        <div className="membership-review-queue">
          {members
            .filter(
              (member) =>
                member.access_status === "pending" &&
                ["submitted", "in_review"].includes(
                  member.application_status ?? "",
                ),
            )
            .map((member) => (
              <article className="membership-review-card" key={member.user_id}>
                <header>
                  <div>
                    <p className="eyebrow">New membership request</p>
                    <h3>{member.display_name || member.email}</h3>
                    <p>{[member.city, member.country].filter(Boolean).join(", ")} · {member.email}</p>
                  </div>
                  <time dateTime={member.application_submitted_at ?? member.created_at}>
                    {new Intl.DateTimeFormat("en-KE", {
                      day: "numeric",
                      month: "short",
                    }).format(new Date(member.application_submitted_at ?? member.created_at))}
                  </time>
                </header>
                <dl>
                  <div><dt>Current focus</dt><dd>{member.application_professional_focus}</dd></div>
                  <div className="wide"><dt>What brings her to the table</dt><dd>{member.application_reason}</dd></div>
                  <div><dt>How she found us</dt><dd>{member.application_referral_source}</dd></div>
                  <div><dt>Introduced by</dt><dd>{member.application_referred_by || "Not provided"}</dd></div>
                </dl>
                <footer>
                  <button
                    className="button button-primary"
                    disabled={workingId === member.user_id}
                    onClick={() => void confirmReview(member, "approve")}
                    type="button"
                  >
                    {workingId === member.user_id ? "Saving…" : "Approve and welcome"}
                  </button>
                  <button
                    className="button button-outline"
                    disabled={workingId === member.user_id}
                    onClick={() => void confirmReview(member, "decline")}
                    type="button"
                  >
                    Decline
                  </button>
                </footer>
              </article>
            ))}
        </div>
      ) : applicationJourneyReady ? (
        <div className="admin-empty admin-empty-compact">
          <strong>No membership requests need a decision</strong>
          <p>New completed requests will appear here with their private context.</p>
        </div>
      ) : null}

      {!migrationReady ? (
        <div className="admin-empty">
          <strong>Member reviews are temporarily unavailable</strong>
          <p>
            No member status has been changed. Reload this workspace in a
            moment before making an access decision.
          </p>
        </div>
      ) : members.length === 0 ? (
        <div className="admin-empty">
          <strong>No members yet</strong>
          <p>New authenticated accounts will appear here for review.</p>
        </div>
      ) : (
        <div className="member-table-wrap">
          <table className="member-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Profile</th>
                <th>Status</th>
                <th>Joined</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.user_id}>
                  <td>
                    <strong>{member.display_name || member.email}</strong>
                    {member.display_name ? <small>{member.email}</small> : null}
                  </td>
                  <td>
                    {member.job_title || member.company || member.country ? (
                      <>
                        <span>{member.job_title || "Profile started"}</span>
                        <small>
                          {[member.company, member.city, member.country]
                            .filter(Boolean)
                            .join(" · ")}{" "}
                          · {member.profile_completion}% complete
                        </small>
                      </>
                    ) : (
                      <span className="muted-value">
                        Not completed · {member.profile_completion}%
                      </span>
                    )}
                  </td>
                  <td>
                    <span
                      className={`member-status status-${member.access_status}`}
                    >
                      {member.access_status}
                    </span>
                    {member.access_status === "pending" ? (
                      <small>
                        {["submitted", "in_review"].includes(
                          member.application_status ?? "",
                        )
                          ? "Request ready for review"
                          : "Application not sent"}
                      </small>
                    ) : null}
                  </td>
                  <td>
                    {new Intl.DateTimeFormat("en-KE", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    }).format(new Date(member.created_at))}
                  </td>
                  <td>
                    <div className="member-actions">
                      {member.access_status === "pending" &&
                      ["submitted", "in_review"].includes(
                        member.application_status ?? "",
                      ) ? (
                        <button
                          disabled={workingId === member.user_id}
                          onClick={() => void confirmReview(member, "approve")}
                        >
                          Approve
                        </button>
                      ) : null}
                      {member.access_status === "suspended" ? (
                        <button
                          disabled={workingId === member.user_id}
                          onClick={() => review(member.user_id, "restore")}
                        >
                          Restore
                        </button>
                      ) : null}
                      {member.user_id !== currentUserId &&
                      !["suspended", "deleted"].includes(
                        member.access_status,
                      ) ? (
                        <button
                          className="danger-action"
                          disabled={workingId === member.user_id}
                          onClick={() => review(member.user_id, "suspend")}
                        >
                          Suspend
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {message ? (
        <p className="manager-message" role="status">
          {message}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
