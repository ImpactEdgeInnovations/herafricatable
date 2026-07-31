"use client";
import { useRouter } from "next/navigation";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";

export type MemberOrder = {
  community: { slug: string; name: string } | null;
  course: { slug: string; title: string } | null;
  host_plan: { name: string } | null;
  membership: { slug: string; name: string } | null;
  created_at: string;
  currency: string;
  event: { slug: string; title: string } | null;
  id: string;
  order_type: string;
  processing_mode: string;
  reference: string;
  status: string;
  ticket_name: string;
  total_minor: number;
};

export function OrderHistory({
  orders,
  refundOrderIds,
}: {
  orders: MemberOrder[];
  refundOrderIds: string[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function cancel(order: MemberOrder) {
    const result = await ask({
      title: "Cancel this registration?",
      description:
        "The pending registration will be cancelled and its reserved place released.",
      confirmLabel: "Cancel registration",
      tone: "danger",
      fields: [
        {
          name: "reason",
          label: "Reason (optional)",
          type: "textarea",
          maxLength: 1000,
        },
      ],
    });
    if (!result) return;
    const reason = String(result.reason);
    setBusy(order.id);
    const { error } = await supabase.rpc("cancel_pending_registration", {
      p_order_id: order.id,
      p_reason: reason,
    });
    setBusy(null);
    setMessage(
      error
        ? memberErrorMessage(error, "cancel this registration")
        : "Registration cancelled.",
    );
    if (!error) router.refresh();
  }
  async function refund(order: MemberOrder) {
    const result = await ask({
      title: "Request a refund",
      description:
        "Tell us why you are requesting a refund. The team will review your request against the event terms.",
      confirmLabel: "Submit request",
      fields: [
        {
          name: "reason",
          label: "Reason for refund",
          type: "textarea",
          required: true,
          minLength: 10,
          maxLength: 2000,
        },
      ],
    });
    if (!result) return;
    const reason = String(result.reason);
    setBusy(order.id);
    const { error } = await supabase.rpc("request_order_refund", {
      p_order_id: order.id,
      p_reason: reason,
    });
    setBusy(null);
    setMessage(
      error
        ? memberErrorMessage(error, "submit this refund request")
        : "Refund request submitted for review.",
    );
    if (!error) router.refresh();
  }
  return (
    <section className="member-orders">
      {dialog}
      <div>
        <p className="eyebrow">Your payments</p>
        <h2>Orders and access</h2>
      </div>
      {orders.length ? (
        <div>
          {orders.map((order) => (
            <article key={order.id}>
              <div>
                <span>
                  {order.course?.title ??
                    order.membership?.name ??
                    order.community?.name ??
                    order.event?.title ??
                    "Her Africa Table"}
                </span>
                <strong>{order.ticket_name}</strong>
                <small>
                  {order.reference} ·{" "}
                  {new Intl.DateTimeFormat("en-KE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(order.created_at))}
                </small>
              </div>
              <div>
                <strong>
                  {order.currency}{" "}
                  {(order.total_minor / 100).toLocaleString("en-KE", {
                    minimumFractionDigits: 2,
                  })}
                </strong>
                <span className="member-status">
                  {order.status.replace("_", " ")}
                </span>
              </div>
              <div>
                <Link href={`/orders/${order.reference}`}>View receipt</Link>
                {order.status === "fulfilled" && order.event ? (
                  <Link href={`/events/${order.event.slug}/pass`}>
                    Event pass
                  </Link>
                ) : null}
                {order.status === "fulfilled" && order.course ? (
                  <Link href={`/learning/${order.course.slug}`}>
                    Open course
                  </Link>
                ) : null}
                {order.order_type === "membership" ? (
                  <Link href="/membership">Membership</Link>
                ) : null}
                {order.order_type === "community" &&
                order.status === "fulfilled" &&
                order.community ? (
                  <Link href={`/communities/${order.community.slug}`}>
                    Open community
                  </Link>
                ) : null}
                {order.order_type === "community_host_plan" &&
                order.community ? (
                  <Link
                    href={`/communities/${order.community.slug}/host#commerce`}
                  >
                    Host workspace
                  </Link>
                ) : null}
                {order.order_type === "event" &&
                ["pending_payment", "pending_review"].includes(order.status) ? (
                  <button
                    disabled={busy === order.id}
                    onClick={() => void cancel(order)}
                  >
                    Cancel
                  </button>
                ) : null}
                {order.order_type === "event" &&
                order.status === "fulfilled" &&
                !refundOrderIds.includes(order.id) ? (
                  <button
                    disabled={busy === order.id}
                    onClick={() => void refund(order)}
                  >
                    Request refund
                  </button>
                ) : null}
                {[
                  "course",
                  "membership",
                  "community",
                  "community_host_plan",
                ].includes(order.order_type) &&
                ["pending_payment", "pending_review"].includes(order.status) ? (
                  <Link href="/support">Contact support</Link>
                ) : null}
                {refundOrderIds.includes(order.id) ? (
                  <span>Refund under review</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty">
          <strong>No orders yet</strong>
          <p>
            Event, learning, membership and community payments will appear
            here.
          </p>
          <Link className="button button-primary" href="/events">
            View events
          </Link>
        </div>
      )}
      {message ? (
        <p className="manager-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
