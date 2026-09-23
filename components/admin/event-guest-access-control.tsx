"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";

export function EventGuestAccessControl({
  enabled,
  migrationReady,
}: {
  enabled: boolean;
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function changeAccess() {
    const opening = !enabled;
    const confirmed = await ask({
      title: opening ? "Open public events to verified guests?" : "Pause new guest requests?",
      description: opening
        ? "A new visitor may confirm her email and request a place at a published public event. This never approves full membership. Admin Release checks must be complete."
        : "New event-only guest requests will stop. Existing confirmed guests keep their passes unless the event itself is paused or cancelled.",
      confirmLabel: opening ? "Open guest requests" : "Pause guest requests",
      tone: opening ? "default" : "danger",
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_key: "event_guest_access",
      p_enabled: opening,
    });
    setBusy(false);
    setMessage(error
      ? adminErrorMessage(error, "change event guest access")
      : opening
        ? "Verified guests can now request places at published public events."
        : "New event-only guest requests are paused.");
    if (!error) router.refresh();
  }

  return (
    <section className="admin-section" aria-labelledby="event-guest-access-title">
      <header className="admin-section-heading">
        <div>
          <p className="eyebrow">Public event entry</p>
          <h2 id="event-guest-access-title">Guests who are not members</h2>
          <p>Verified visitors can attend a public event after event approval. They do not enter the member network automatically.</p>
        </div>
        <span className="status-count">{migrationReady ? enabled ? "Open" : "Paused" : "Setup needed"}</span>
      </header>
      {migrationReady ? (
        <div className="portal-actions">
          <button className={enabled ? "button button-outline" : "button button-primary"} disabled={busy} onClick={() => void changeAccess()} type="button">
            {busy ? "Saving…" : enabled ? "Pause guest requests" : "Open guest requests"}
          </button>
          <Link className="button button-outline" href="/admin/release">Review launch checks</Link>
        </div>
      ) : (
        <p>Apply the event guest access migration before using this control.</p>
      )}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
      {dialog}
    </section>
  );
}
