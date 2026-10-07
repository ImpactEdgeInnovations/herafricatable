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
  sent: "Invitation ready",
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
  const [note, setNote] = useState("");
  const [preset, setPreset] = useState("");
  const noteIdeas = destinationType === "event"
    ? [
        { label: "A warm invitation", text: `I thought you would enjoy ${destinationName}. It would be lovely to see you there.` },
        { label: "Meet people together", text: `Would you join me at ${destinationName}? I would love for us to meet new people together.` },
      ]
    : [
        { label: "A warm invitation", text: `I thought you would feel at home in ${destinationName}. I would love to welcome you.` },
        { label: "Shared interest", text: `This Community brings together women with a shared interest. I thought of you and hope you will join us.` },
      ];

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
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
    if (error) {
      setBusy(false);
      setMessage(memberErrorMessage(error, "send this invitation"));
      return;
    }
    const result = (data as { invitation_id: string; invitation_status: string }[] | null)?.[0];
    let delivered = false;
    if (result?.invitation_status === "sent") {
      try {
        const response = await fetch("/api/member/invitations/deliver", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invitationId: result.invitation_id }) });
        const delivery = await response.json();
        delivered = response.ok && Number(delivery.sent) > 0;
      } catch { /* The queued invitation remains available for scheduled retry. */ }
    }
    setMessage(
      result?.invitation_status === "sent"
        ? delivered ? "Invitation emailed. She can choose whether to accept it." : "Invitation saved for email delivery. It has not yet been confirmed as sent."
        : "Invitation received. Her Africa Table will review it before emailing someone who is not yet a member.",
    );
    formElement.reset();
    setBusy(false);
    setNote("");
    setPreset("");
    router.refresh();
  }

  return (
    <section className="destination-invitation-panel" id="invite-people">
      <header>
        <div>
          <p className="eyebrow">Invite someone</p>
          <h2>Invite someone to join you.</h2>
        </div>
        <p>
          The email leads back to {destinationName}. New visitors confirm their
          email and finish joining Her Africa Table first.
          {destinationType === "event" ? " She will still need to book her place." : " Your community’s joining rules still apply."}
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
                disabled={busy}
                maxLength={320}
                name="email"
                placeholder="name@example.com"
                required
                type="email"
              />
            </label>
            <label>
              Start with a note <small>Optional</small>
              <select
                disabled={busy}
                value={preset}
                onChange={(event) => {
                  const selected = event.target.value;
                  setPreset(selected);
                  setNote(noteIdeas.find((idea) => idea.label === selected)?.text ?? "");
                }}
              >
                <option value="">Write my own</option>
                {noteIdeas.map((idea) => <option key={idea.label} value={idea.label}>{idea.label}</option>)}
              </select>
            </label>
            <label>
              Your message <small>You can edit it</small>
              <textarea
                disabled={busy}
                maxLength={600}
                minLength={10}
                name="note"
                placeholder={`For example: I thought of you because this ${destinationType} connects women working on similar goals.`}
                rows={4}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  setPreset("");
                }}
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
              <p>Your invitations will appear here. Start with one person you would love to welcome.</p>
            )}
          </div>
        </div>
      )}
      {message ? <p className="community-host-message" role="status">{message}</p> : null}
    </section>
  );
}
