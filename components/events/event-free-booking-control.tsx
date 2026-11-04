"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const lock = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  async function change() {
    if (lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
    const { error } = await supabase.rpc("set_event_free_instant_booking", {
      p_enabled: !enabled,
      p_event_id: eventId,
    });
    if (!alive.current) return;
    setMessage(error
      ? memberErrorMessage(error, "change free booking")
      : enabled
        ? "New guests will now wait for a review. Existing confirmed places stay confirmed."
        : "Members and eligible verified guests can now book a free place immediately while seats remain.");
    if (!error) router.refresh();
    } catch {
      if (alive.current) setMessage("The setting could not be saved. Please try again.");
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return (
    <section className="event-free-booking-control" aria-label={`Free booking for ${eventTitle}`}>
      <div>
        <p className="eyebrow">Free event places</p>
        <h2>{enabled ? "Instant confirmation is on" : "Guest requests are reviewed"}</h2>
        <p>For free, public events. One place per person; the event capacity still applies. Guests do not need HAT membership when guest booking is open. Turning this off does not cancel existing places.</p>
      </div>
      <button className="button button-outline" type="button" disabled={busy || !ready} onClick={() => void change()}>
        {busy ? "Saving…" : enabled ? "Review new requests" : "Confirm free places instantly"}
      </button>
      {!ready ? <p role="status">This setting will appear after the free-booking update is installed.</p> : null}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );
}
