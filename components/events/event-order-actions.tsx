"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export function EventOrderActions({
  orderId,
  status,
  eventHasStarted,
  totalMinor,
  refundStatus,
}: {
  orderId: string;
  status: string;
  eventHasStarted: boolean;
  totalMinor: number;
  refundStatus: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = ["pending_payment", "pending_review"].includes(status);
  const canCancelFree = status === "fulfilled" && totalMinor === 0 &&
    !eventHasStarted;
  const canRequestRefund = status === "fulfilled" && totalMinor > 0 && !refundStatus;

  async function cancel() {
    const result = await ask({
      title: "Cancel your event place?",
      description: pending
        ? "Your request will be withdrawn and any held place released. You can request a new place later if registration is still open."
        : "Your confirmed free place and entry pass will stop working. You can request a new place later if registration is still open.",
      confirmLabel: "Cancel my place",
      tone: "danger",
      fields: [{ name: "reason", label: "Reason (optional)", type: "textarea", maxLength: 1000 }],
    });
    if (!result) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("cancel_my_event_place", {
      p_order_id: orderId,
      p_reason: String(result.reason ?? ""),
    });
    setBusy(false);
    setMessage(error
      ? memberErrorMessage(error, "cancel this event place")
      : "Your event place has been cancelled. We have released it for someone else.");
    if (!error) router.refresh();
  }

  async function requestRefund() {
    const result = await ask({
      title: "Ask for a refund?",
      description: "Tell the event team what happened. They will review your request and email you a decision.",
      confirmLabel: "Send refund request",
      fields: [{
        name: "reason", label: "What happened?", type: "textarea",
        required: true, minLength: 10, maxLength: 1000,
      }],
    });
    if (!result) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("request_order_refund", {
      p_order_id: orderId,
      p_reason: String(result.reason ?? ""),
    });
    setBusy(false);
    setMessage(error
      ? memberErrorMessage(error, "send your refund request")
      : "Your refund request has been sent to the event team.");
    if (!error) router.refresh();
  }

  if (!pending && !canCancelFree && !canRequestRefund && !refundStatus) return null;
  return (
    <div className="portal-actions">
      {dialog}
      {pending || canCancelFree ? (
        <button className="button button-outline" disabled={busy} onClick={() => void cancel()} type="button">
          {busy ? "Saving…" : "Cancel my place"}
        </button>
      ) : null}
      {canRequestRefund ? (
        <button className="button button-outline" disabled={busy} onClick={() => void requestRefund()} type="button">
          {busy ? "Sending…" : "Request a refund"}
        </button>
      ) : null}
      {refundStatus ? <p role="status">Refund request: {refundStatus.replaceAll("_", " ")}</p> : null}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </div>
  );
}
