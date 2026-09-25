"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";

export type EventFollowUpCandidate = {
  attendee_email: string;
  attendee_id: string;
  attendee_name: string;
  community_id: string | null;
  community_name: string | null;
  community_slug: string | null;
  delivery_status: string | null;
  event_id: string;
  event_slug: string;
  event_title: string;
  invitation_id: string | null;
  invitation_status: string | null;
  is_test_account: boolean;
  opted_in_at: string;
};

export function EventFollowUpInvitations({
  candidates,
  ready,
}: {
  candidates: EventFollowUpCandidate[];
  ready: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function invite(candidate: EventFollowUpCandidate) {
    if (!candidate.community_name) return;
    const confirmed = await ask({
      title: `Invite ${candidate.attendee_name}?`,
      description: `${candidate.attendee_email} asked to hear about a Community after ${candidate.event_title}. This sends a private invitation to ${candidate.community_name}. It does not approve platform membership or add her to the Community.`,
      confirmLabel: "Send invitation",
    });
    if (!confirmed) return;
    setBusy(candidate.attendee_id);
    setMessage("");
    const { data: invitationId, error } = await supabase.rpc(
      "invite_event_follow_up_guest",
      { p_event_id: candidate.event_id, p_user_id: candidate.attendee_id },
    );
    if (error || !invitationId) {
      setMessage(adminErrorMessage(error, "send this invitation"));
      setBusy("");
      return;
    }
    try {
      const response = await fetch("/api/admin/notifications/process", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dedupeKey: `table-invitation:${invitationId}` }),
      });
      const delivery = (await response.json()) as { sent?: number; error?: string };
      setMessage(response.ok && (delivery.sent ?? 0) > 0
        ? "Invitation sent. The guest still chooses whether to request membership and join."
        : `Invitation saved. ${delivery.error ?? "Check Message delivery for email status."}`);
    } catch {
      setMessage("Invitation saved. Check Message delivery for email status.");
    }
    setBusy("");
    router.refresh();
  }

  const waiting = candidates.filter((candidate) =>
    candidate.community_name && !candidate.invitation_id,
  );

  return (
    <section className="focused-admin-tool">
      <div className="admin-section">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">After the event</p>
            <h1>Guests who asked to stay connected</h1>
            <p>Review each request before sending a Community invitation. A guest chooses whether to continue; the event alone never makes her a member.</p>
          </div>
          <span className="admin-count-pill">{waiting.length} ready</span>
        </div>
        {!ready ? (
          <div className="admin-empty opportunity-error" role="alert">
            <strong>This invitation queue is not ready yet</strong>
            <p>Apply the event follow-up invitation migration, then reload. No invitation was sent.</p>
          </div>
        ) : !candidates.length ? (
          <div className="admin-empty">
            <strong>No one is waiting for a follow-up invitation</strong>
            <p>After an event, confirmed attendees can ask to hear about its future Community. Their requests appear here.</p>
          </div>
        ) : (
          <div className="table-invitation-admin-list">
            {candidates.map((candidate) => {
              const canInvite = Boolean(candidate.community_name && !candidate.invitation_id);
              return (
                <article key={`${candidate.event_id}:${candidate.attendee_id}`}>
                  <header>
                    <div>
                      <span>{candidate.event_title}</span>
                      <h2>{candidate.attendee_name}{candidate.is_test_account ? " · Test account" : ""}</h2>
                      <p>{candidate.attendee_email}</p>
                    </div>
                    <span className="admin-count-pill">{candidate.invitation_status
                      ? candidate.invitation_status === "sent" && candidate.delivery_status === "sent"
                        ? "Email sent"
                        : `Invitation ${candidate.invitation_status.replaceAll("_", " ")}`
                      : candidate.community_name ? "Ready to invite" : "Community needed"}</span>
                  </header>
                  <p>{candidate.community_name
                    ? `Follow-up Community: ${candidate.community_name}`
                    : "The event's follow-up Community must be approved and published first."}</p>
                  <div className="portal-actions">
                    {canInvite ? (
                      <button className="button button-primary" disabled={busy === candidate.attendee_id} onClick={() => void invite(candidate)} type="button">
                        {busy === candidate.attendee_id ? "Sending…" : "Send private invitation"}
                      </button>
                    ) : null}
                    <Link className="button button-outline" href={`/events/${candidate.event_slug}`}>View event</Link>
                    {candidate.community_slug ? <Link className="button button-outline" href={`/communities/${candidate.community_slug}/about`}>View Community</Link> : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {message ? <p className="admin-notice" role="status">{message}</p> : null}
      </div>
      {dialog}
    </section>
  );
}
