"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";

export function EventAutomaticCheckoutControl({
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
      title: opening ? "Open event card payments?" : "Pause new event card payments?",
      description: opening
        ? "Only open after provider approval, two-account checkout, refunds, reversals and Admin recovery have passed in Launch checks. Manual-review events are unaffected."
        : "No new event card checkout can start. Existing paid or pending orders stay available for reconciliation, refunds and support.",
      confirmLabel: opening ? "Open event payments" : "Pause new payments",
      tone: opening ? "default" : "danger",
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_key: "event_automatic_checkout",
      p_enabled: opening,
    });
    setBusy(false);
    setMessage(error
      ? adminErrorMessage(error, "change event card payments")
      : opening
        ? "Event card checkout is open for published automatic-payment events."
        : "New event card checkout is paused. Existing orders were not cancelled.");
    if (!error) router.refresh();
  }

  return (
    <section className="admin-section" aria-labelledby="event-auto-payment-title">
      <header className="admin-section-heading">
        <div>
          <p className="eyebrow">Event payments</p>
          <h2 id="event-auto-payment-title">Card checkout</h2>
          <p>Keep automatic event charges closed until the payment and refund journey has been rehearsed. Free and manual-review events can continue.</p>
        </div>
        <span className="status-count">{migrationReady ? enabled ? "Open" : "Paused" : "Setup needed"}</span>
      </header>
      {migrationReady || enabled ? (
        <div className="portal-actions">
          <button className={enabled ? "button button-outline" : "button button-primary"} disabled={busy || (!migrationReady && !enabled)} onClick={() => void changeAccess()} type="button">
            {busy ? "Saving…" : enabled ? "Pause new payments" : "Open event payments"}
          </button>
          <Link className="button button-outline" href="/admin/release">Review payment checks</Link>
          {!migrationReady ? <p>Database protection needs attention. Pause new payments now; do not reopen until the safety update is verified.</p> : null}
        </div>
      ) : (
        <p>Apply the event automatic-checkout safety update before using this control.</p>
      )}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
      {dialog}
    </section>
  );
}
