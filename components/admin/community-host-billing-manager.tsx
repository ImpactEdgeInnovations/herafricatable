"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityHostBillingAdmin = {
  self_service_enabled: boolean;
  payment_mode: "automatic" | "manual_review" | "closed";
  grace_days: number;
  active_subscriptions: number;
  grace_subscriptions: number;
  scheduled_subscriptions: number;
  ending_soon: number;
  lapsed_paid_offers: number;
};

export type CommunityHostPlanOrderAdmin = {
  order_id: string;
  reference: string;
  community_id: string;
  community_name: string;
  plan_id: string;
  plan_name: string;
  order_kind: "new" | "renewal" | "plan_change";
  owner_email: string;
  owner_name: string | null;
  status: string;
  processing_mode: string;
  total_minor: number;
  currency: string;
  submitted_reference: string | null;
  submitter_note: string | null;
  created_at: string;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-KE", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount / 100);
}

export function CommunityHostBillingManager({
  configuration,
  migrationReady,
  orders,
}: {
  configuration: CommunityHostBillingAdmin | null;
  migrationReady: boolean;
  orders: CommunityHostPlanOrderAdmin[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  if (!migrationReady) {
    return (
      <section className="admin-section" id="host-plan-billing-admin">
        <div className="admin-empty">
          <strong>Host self-service billing is not installed yet</strong>
          <p>
            Existing communities and manually granted plans remain unchanged.
          </p>
        </div>
      </section>
    );
  }

  async function saveConfiguration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("configuration");
    setMessage("");
    const { error } = await supabase.rpc(
      "set_community_host_billing_configuration",
      {
        p_enabled: form.get("enabled") === "on",
        p_grace_days: Number(form.get("graceDays")),
        p_payment_mode: form.get("paymentMode"),
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "save host billing controls")
        : "Host billing controls saved and audited.",
    );
    if (!error) router.refresh();
  }

  async function reconcileLifecycle() {
    const confirmed = await ask({
      title: "Reconcile host subscriptions now?",
      description:
        "This promotes due renewals, starts grace periods, expires lapsed plans, pauses unsafe paid offers and queues owner reminders.",
      confirmLabel: "Run lifecycle check",
    });
    if (!confirmed) return;
    setBusy("reconcile");
    setMessage("");
    const { data, error } = await supabase.rpc(
      "reconcile_community_host_subscriptions",
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "reconcile host subscription lifecycles")
        : `Host lifecycle reconciled: ${JSON.stringify(data?.[0] ?? {})}`,
    );
    if (!error) router.refresh();
  }

  async function review(order: CommunityHostPlanOrderAdmin, action: string) {
    const result = await ask({
      title:
        action === "approve"
          ? "Activate this host plan?"
          : "Reject this host plan payment?",
      description:
        action === "approve"
          ? "Approval activates the selected plan for this approved community owner."
          : "Rejection cancels this order. It does not remove the owner or community.",
      confirmLabel: action === "approve" ? "Activate plan" : "Reject payment",
      fields: [
        {
          label: action === "approve" ? "Review note (optional)" : "Reason",
          minLength: action === "reject" ? 5 : undefined,
          name: "note",
          required: action === "reject",
          type: "textarea",
        },
      ],
      tone: action === "approve" ? "default" : "danger",
    });
    if (!result) return;
    setBusy(order.order_id);
    setMessage("");
    const { error } = await supabase.rpc(
      "review_community_host_plan_order",
      {
        p_action: action,
        p_note: String(result.note ?? ""),
        p_order_id: order.order_id,
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, `${action} this host plan payment`)
        : `Host plan payment ${action === "approve" ? "approved" : "rejected"}.`,
    );
    if (!error) router.refresh();
  }

  const pending = orders.filter((order) => order.status === "pending_review");

  return (
    <section
      className="admin-section community-host-billing-admin"
      id="host-plan-billing-admin"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Owner self-service</p>
          <h2>Host plan billing</h2>
          <p>
            Choose whether approved community owners pay through Paystack,
            submit a reference for review, or see plan selection as closed.
          </p>
        </div>
        <span
          className={`community-commerce-status ${
            configuration?.self_service_enabled ? "ready" : ""
          }`}
        >
          {configuration?.self_service_enabled ? "Open" : "Closed"}
        </span>
      </div>

      <div className="host-billing-layout">
        <form onSubmit={saveConfiguration}>
          <p className="admin-form-guide">
            This switch affects only new host-plan orders. It never removes an
            existing plan, community, owner, or member entitlement.
          </p>
          <label className="host-billing-check">
            <input
              defaultChecked={configuration?.self_service_enabled}
              name="enabled"
              type="checkbox"
            />
            <span>Allow approved owners to select and buy a host plan</span>
          </label>
          <label>
            Payment processing
            <select
              defaultValue={configuration?.payment_mode ?? "closed"}
              name="paymentMode"
            >
              <option value="closed">Closed — no new plan orders</option>
              <option value="manual_review">Manual Admin verification</option>
              <option value="automatic">Automatic with Paystack</option>
            </select>
          </label>
          <label>
            Renewal grace period
            <select
              defaultValue={configuration?.grace_days ?? 7}
              name="graceDays"
            >
              <option value="0">No grace period</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
          <button
            className="button button-primary"
            disabled={busy === "configuration"}
          >
            {busy === "configuration" ? "Saving…" : "Save billing controls"}
          </button>
          <small>
            To pause safely, untick self-service and choose Closed. Pending
            manual orders remain visible for an explicit decision.
          </small>
        </form>

        <div className="host-plan-order-queue">
          <div>
            <p className="eyebrow">Manual plan payments</p>
            <h3>{pending.length} awaiting review</h3>
          </div>
          {pending.length ? (
            pending.map((order) => (
              <article key={order.order_id}>
                <div>
                  <strong>{order.community_name}</strong>
                  <span>
                    {order.owner_name ?? order.owner_email} · {order.plan_name}
                  </span>
                  <em>
                    {order.order_kind === "plan_change"
                      ? "Plan change"
                      : order.order_kind === "renewal"
                        ? "Renewal"
                        : "New plan"}
                  </em>
                  <small>
                    {money(order.total_minor, order.currency)} ·{" "}
                    {order.submitted_reference}
                  </small>
                  <p>{order.submitter_note}</p>
                </div>
                <div className="member-actions">
                  <button
                    disabled={busy === order.order_id}
                    onClick={() => void review(order, "approve")}
                  >
                    Verify and activate
                  </button>
                  <button
                    className="danger-action"
                    disabled={busy === order.order_id}
                    onClick={() => void review(order, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="admin-empty">
              <strong>No host plan payments waiting</strong>
              <p>
                Manual submissions will appear with the community, owner, plan,
                reference and verification note.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="host-lifecycle-admin">
        <div>
          <p className="eyebrow">Subscription lifecycle</p>
          <h3>Renewals and expiry protection</h3>
          <p>
            The scheduled job runs this safely alongside notification delivery.
            Run it here after a support decision or during acceptance testing.
          </p>
        </div>
        <div className="host-lifecycle-metrics">
          <article>
            <strong>{configuration?.active_subscriptions ?? 0}</strong>
            <span>Active</span>
          </article>
          <article>
            <strong>{configuration?.scheduled_subscriptions ?? 0}</strong>
            <span>Scheduled</span>
          </article>
          <article>
            <strong>{configuration?.grace_subscriptions ?? 0}</strong>
            <span>In grace</span>
          </article>
          <article>
            <strong>{configuration?.ending_soon ?? 0}</strong>
            <span>Ending in 7 days</span>
          </article>
          <article
            className={
              (configuration?.lapsed_paid_offers ?? 0) > 0 ? "attention" : ""
            }
          >
            <strong>{configuration?.lapsed_paid_offers ?? 0}</strong>
            <span>Offers needing pause</span>
          </article>
        </div>
        <button
          className="button button-outline"
          disabled={busy === "reconcile"}
          onClick={() => void reconcileLifecycle()}
        >
          {busy === "reconcile" ? "Reconciling…" : "Run lifecycle check"}
        </button>
      </div>
      {message ? (
        <p className="manager-message content-manager-message" role="status">
          {message}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
