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
        ? "We will let you know if a follow-up Community is approved. You have not joined anything yet."
        : "Your interest has been withdrawn. You will not receive a Community invitation from this event.",
    );
  }

  return (
    <section className="event-community-follow-up" aria-labelledby="event-follow-up-title">
      <div>
        <p className="eyebrow">After the gathering</p>
        <h2 id="event-follow-up-title">Would you like to stay connected?</h2>
        <p>The host may apply to create a Community after this event. Choose whether you would like to hear about it. This does not add you to a Community.</p>
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
