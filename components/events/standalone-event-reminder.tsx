"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export function StandaloneEventReminder({
  canSet,
  emailAllowed,
  eventId,
  initialStatus,
}: {
  canSet: boolean;
  emailAllowed: boolean;
  eventId: string;
  initialStatus: "scheduled" | "queued" | "cancelled" | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialStatus === "scheduled" || initialStatus === "queued");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  async function changeReminder() {
    const next = !enabled;
    setBusy(true);
    setMessage("");
    setMessageIsError(false);
    const { error } = await supabase.rpc("set_my_standalone_event_reminder", {
      p_enabled: next,
      p_event_id: eventId,
    });
    setBusy(false);
    if (error) {
      setMessageIsError(true);
      setMessage(memberErrorMessage(error, "change your event reminder"));
      return;
    }
    setEnabled(next);
    setMessage(next ? "Reminder requested." : "Reminder removed.");
    router.refresh();
  }

  return (
    <section className="standalone-event-reminder" aria-labelledby="standalone-reminder-heading">
      <div>
        <p className="eyebrow">Your choice</p>
        <h2 id="standalone-reminder-heading">A reminder before the event</h2>
        <p>We’ll put a reminder in your updates before the gathering. An email is sent only if your Event emails are on.</p>
        {!emailAllowed ? <p>Event emails are off. You can change this in <Link href="/notifications">notification settings</Link>.</p> : null}
        {!canSet && !enabled ? <p>It is too late to schedule a new reminder. Add the event to your calendar above instead.</p> : null}
      </div>
      <div>
        <button className="button button-outline" disabled={busy || (!enabled && !canSet)} onClick={() => void changeReminder()} type="button">
          {busy ? "Saving…" : enabled ? "Remove reminder" : "Remind me"}
        </button>
        {message ? <p role={messageIsError ? "alert" : "status"}>{message}</p> : null}
      </div>
    </section>
  );
}
