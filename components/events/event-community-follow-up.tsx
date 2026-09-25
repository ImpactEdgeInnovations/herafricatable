"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export function EventCommunityFollowUp({
  eventId,
  initialInterested,
}: {
  eventId: string;
  initialInterested: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [interested, setInterested] = useState(initialInterested);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function update(next: boolean) {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_my_event_follow_up_interest", {
      p_event_id: eventId,
      p_interested: next,
    });
    setBusy(false);
    if (error) {
      setMessage(memberErrorMessage(error, "save your follow-up choice"));
      return;
    }
    setInterested(next);
    setMessage(
      next
        ? "Your interest is saved for the event team. You have not joined a Community or gained membership."
        : "Your interest is withdrawn. Any unused invitation from this event is closed. An email already sent cannot be taken back.",
    );
  }

  return (
    <section className="event-community-follow-up" aria-labelledby="event-follow-up-title">
      <div>
        <p className="eyebrow">After the gathering</p>
        <h2 id="event-follow-up-title">Would you like to stay connected?</h2>
        <p>If an approved Community follows this event, our team can send you a private invitation. You decide whether to accept. This does not approve membership or add you to the Community.</p>
      </div>
      <button
        aria-pressed={interested}
        className={interested ? "button button-outline" : "button button-primary"}
        disabled={busy}
        onClick={() => void update(!interested)}
        type="button"
      >
        {busy ? "Saving…" : interested ? "I am no longer interested" : "Keep me informed"}
      </button>
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );
}
