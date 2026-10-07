"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export function EventFreeBookingControl({
  eventId,
  eventTitle,
  enabled,
  ready,
}: {
  eventId: string;
  eventTitle: string;
  enabled: boolean;
  ready: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function change() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_event_free_instant_booking", {
      p_enabled: !enabled,
      p_event_id: eventId,
    });
    setBusy(false);
    setMessage(error
      ? memberErrorMessage(error, "change free booking")
      : enabled
        ? "New guests will now wait for a review. Existing confirmed places stay confirmed."
        : "Active members can now reserve a free place immediately while seats remain.");
    if (!error) router.refresh();
  }

  return (
    <section className="event-free-booking-control" aria-label={`Free booking for ${eventTitle}`}>
      <div>
        <p className="eyebrow">Free event places</p>
        <h2>{enabled ? "Instant confirmation is on" : "Guest requests are reviewed"}</h2>
        <p>For free, public pilot events only. One place per active member; the event capacity still applies. Turning this off does not cancel anyone already confirmed.</p>
      </div>
      <button className="button button-outline" type="button" disabled={busy || !ready} onClick={() => void change()}>
        {busy ? "Saving…" : enabled ? "Review new requests" : "Confirm free places instantly"}
      </button>
      {!ready ? <p role="status">This setting will appear after the free-booking update is installed.</p> : null}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );
}
