"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";

export type DestinationInvitation = {
  created_at: string;
  expires_at: string | null;
  invitation_id: string;
  invitation_status: string;
  invitee_email: string;
  personal_note: string | null;
};

const statusCopy: Record<string, string> = {
  claimed: "Opened and continued",
  expired: "Expired",
  joined: "Joined or requested access",
  membership_pending: "Membership in progress",
  opened: "Opened",
  pending_review: "Waiting for Her Africa Table review",
  rejected: "Not approved",
  revoked: "Revoked",
  sent: "Sent",
};

export function DestinationInvitationPanel({
  destinationId,
  destinationName,
  destinationType,
  invitations,
  ready,
}: {
  destinationId: string;
  destinationName: string;
  destinationType: "community" | "event";
  invitations: DestinationInvitation[];
  ready: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("create_table_invitation", {
      p_destination_id: destinationId,
      p_destination_type: destinationType,
      p_email: form.get("email"),
      p_personal_note: form.get("note") || null,
    });
    setBusy(false);
    if (error) {
      setMessage(memberErrorMessage(error, "send this invitation"));
      return;
    }
    const result = (data as { invitation_status: string }[] | null)?.[0];
    setMessage(
      result?.invitation_status === "sent"
        ? "Invitation saved. She will see it in Activity and receive the email when her Community email preference is on."
        : "Invitation received. Her Africa Table will review it before emailing someone who is not yet a member.",
    );
    formElement.reset();
    router.refresh();
  }

  return (
    <section className="destination-invitation-panel" id="invite-people">
      <header>
        <div>
          <p className="eyebrow">Invite someone</p>
          <h2>Bring the right person into this {destinationType}.</h2>
        </div>
        <p>
          Her invitation will lead back to {destinationName}. New members still follow
          the private membership review, and event tickets remain separate.
        </p>
      </header>
      {!ready ? (
        <div className="destination-invitation-preparing" role="status">
          <strong>Invitations are being prepared.</strong>
          <p>This form will open after the latest secure setup is complete.</p>
        </div>
      ) : (
        <div className="destination-invitation-layout">
          <form onSubmit={(event) => void send(event)}>
            <label>
              Her email address
              <input
                autoComplete="email"
                maxLength={320}
                name="email"
                placeholder="name@example.com"
                required
                type="email"
              />
            </label>
            <label>
              A personal note <small>Optional</small>
              <textarea
                maxLength={600}
                minLength={10}
                name="note"
                placeholder={`For example: I thought of you because this ${destinationType} connects women working on similar goals.`}
                rows={4}
              />
            </label>
            <button className="button button-primary" disabled={busy}>
              {busy ? "Sending…" : "Send invitation"}
            </button>
            <small>
              Up to 20 invitations in 24 hours. We do not upload or store your
              address book.
            </small>
          </form>
          <div className="destination-invitation-history">
            <div>
              <strong>Recent invitations</strong>
              <span>{invitations.length}</span>
            </div>
            {invitations.length ? (
              invitations.slice(0, 6).map((invitation) => (
                <article key={invitation.invitation_id}>
                  <div>
                    <strong>{invitation.invitee_email}</strong>
                    <small>
                      {new Intl.DateTimeFormat("en-KE", {
                        day: "numeric",
                        month: "short",
                      }).format(new Date(invitation.created_at))}
                    </small>
                  </div>
                  <span data-status={invitation.invitation_status}>
                    {statusCopy[invitation.invitation_status] || "In progress"}
                  </span>
                </article>
              ))
            ) : (
              <p>No invitations have been sent from this page yet.</p>
            )}
          </div>
        </div>
      )}
      {message ? <p className="community-host-message" role="status">{message}</p> : null}
    </section>
  );
}
