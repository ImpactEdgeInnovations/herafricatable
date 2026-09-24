"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export function EventIntroTarget({ code, eventId, alreadyRequested }: {
  code: string;
  eventId: string;
  alreadyRequested: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function request() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("request_event_intro", {
      p_event_id: eventId, p_code: code,
    });
    setBusy(false);
    setMessage(error
      ? memberErrorMessage(error, "send this introduction")
      : "Your request was sent. She chooses whether to accept.");
    if (!error) router.refresh();
  }

  return <div className="event-intro-target-action">
    <button className="button button-primary" disabled={busy || alreadyRequested} onClick={() => void request()} type="button">
      {alreadyRequested ? "Request already sent" : busy ? "Sending…" : "Ask to meet"}
    </button>
    <p>This does not share contact details or add either of you to the member network.</p>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
