"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";

export type AdminTableInvitation = {
  created_at: string;
  destination_name: string;
  destination_type: "community" | "event";
  expires_at: string | null;
  invitation_id: string;
  invitation_status: string;
  invitee_email: string;
  inviter_email: string;
  inviter_name: string | null;
  personal_note: string | null;
  review_note: string | null;
  reviewed_at: string | null;
};

const statusLabels: Record<string, string> = {
  claimed: "Ready to continue",
  expired: "Expired",
  joined: "Joined or requested",
  membership_pending: "Membership in progress",
  opened: "Opened",
  pending_review: "Needs review",
  rejected: "Declined",
  revoked: "Revoked",
  sent: "Email sent",
};

export function TableInvitationManager({
  invitations,
}: {
  invitations: AdminTableInvitation[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const pending = invitations.filter(
    (invitation) => invitation.invitation_status === "pending_review",
  );

  async function review(
    invitation: AdminTableInvitation,
    action: "approve" | "reject" | "revoke",
  ) {
    const needsReason = action !== "approve";
    const result = await ask({
      confirmLabel:
        action === "approve"
          ? "Approve and email"
          : action === "reject"
            ? "Decline invitation"
            : "Revoke invitation",
      description:
        action === "approve"
          ? `This places a secure, single-use invitation for ${invitation.invitee_email} in the Resend email queue. Membership and destination approval rules still apply.`
          : "The link will not be usable. The reason remains visible to the Admin team.",
      fields: needsReason
        ? [
            {
              label: "Short private reason",
              maxLength: 400,
              minLength: 5,
              name: "reason",
              required: true,
              type: "textarea",
            },
          ]
        : undefined,
      title:
        action === "approve"
          ? `Email this ${invitation.destination_type} invitation?`
          : `${action === "reject" ? "Decline" : "Revoke"} this invitation?`,
      tone: needsReason ? "danger" : "default",
    });
    if (!result) return;
    setBusy(invitation.invitation_id);
    setMessage("");
    const { error } = await supabase.rpc("review_table_invitation", {
      p_action: action,
      p_invitation_id: invitation.invitation_id,
      p_note: needsReason ? String(result.reason ?? "") : null,
    });
    if (error) {
      setBusy("");
      setMessage(adminErrorMessage(error, "review this invitation"));
      return;
    }
    if (action === "approve") {
      try {
        const response = await fetch("/api/admin/notifications/process", {
          body: JSON.stringify({
            dedupeKey: `table-invitation:${invitation.invitation_id}`,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const delivery = (await response.json()) as {
          error?: string;
          failed?: number;
          sent?: number;
        };
        setMessage(
          response.ok && (delivery.sent ?? 0) > 0 && !(delivery.failed ?? 0)
            ? `Approved. The protected Resend queue sent ${delivery.sent} waiting message${delivery.sent === 1 ? "" : "s"}; the delivery record confirms each result.`
            : response.ok
              ? "Approved. The protected delivery queue was processed; check Message delivery for its final state."
              : `Approved and safely queued. ${delivery.error ?? "Use Message delivery to try sending again."}`,
        );
      } catch {
        setMessage(
          "Approved and safely queued. Use Message delivery to send waiting messages.",
        );
      }
    } else {
      setMessage("Invitation updated.");
    }
    setBusy("");
    router.refresh();
  }

  return (
    <section className="admin-section table-invitation-manager">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Personal invitations</p>
          <h2>Review invitations to new people</h2>
          <p>
            Existing active members receive invitations immediately. A new email
            waits here before any message leaves Her Africa Table.
          </p>
        </div>
        <span className="admin-count-pill">{pending.length} waiting</span>
      </div>
      {message ? <p className="admin-notice" role="status">{message}</p> : null}
      {invitations.length ? (
        <div className="table-invitation-admin-list">
          {invitations.map((invitation) => (
            <article key={invitation.invitation_id}>
              <header>
                <div>
                  <span>{invitation.destination_type}</span>
                  <h3>{invitation.destination_name}</h3>
                </div>
                <strong data-status={invitation.invitation_status}>
                  {statusLabels[invitation.invitation_status] || "In progress"}
                </strong>
              </header>
              <dl>
                <div><dt>From</dt><dd>{invitation.inviter_name || invitation.inviter_email}</dd></div>
                <div><dt>To</dt><dd>{invitation.invitee_email}</dd></div>
                <div><dt>Requested</dt><dd>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(invitation.created_at))}</dd></div>
              </dl>
              {invitation.personal_note ? <blockquote>{invitation.personal_note}</blockquote> : null}
              {invitation.review_note ? <p className="table-invitation-review-note"><strong>Private review note</strong>{invitation.review_note}</p> : null}
              {invitation.invitation_status === "pending_review" ? (
                <footer>
                  <button className="button button-primary" disabled={Boolean(busy)} onClick={() => void review(invitation, "approve")} type="button">Approve and email</button>
                  <button className="button button-outline" disabled={Boolean(busy)} onClick={() => void review(invitation, "reject")} type="button">Decline</button>
                </footer>
              ) : ["sent", "opened", "membership_pending", "claimed"].includes(invitation.invitation_status) ? (
                <footer><button className="button button-outline" disabled={Boolean(busy)} onClick={() => void review(invitation, "revoke")} type="button">Revoke link</button></footer>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty"><strong>No invitations to review</strong><p>New-member invitations will appear here before an email is sent.</p></div>
      )}
      {dialog}
    </section>
  );
}
