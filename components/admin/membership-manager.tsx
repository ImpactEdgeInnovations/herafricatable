"use client";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
export type AdminMembershipPlan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  duration_months: number;
  grace_days: number;
  payment_mode: string;
  status: string;
};
export type AdminMembership = {
  period_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  is_test_account: boolean;
  plan_id: string;
  plan_name: string;
  status: string;
  source: string;
  starts_at: string;
  ends_at: string;
  grace_ends_at: string;
  order_id: string | null;
};
export type MembershipOrder = {
  order_id: string;
  reference: string;
  plan_id: string;
  plan_name: string;
  user_id: string;
  email: string;
  display_name: string | null;
  status: string;
  total_minor: number;
  currency: string;
  submitted_reference: string | null;
  submitter_note: string | null;
  created_at: string;
};
export function MembershipManager({
  plans,
  periods,
  orders,
  enabled,
  migrationReady,
}: {
  plans: AdminMembershipPlan[];
  periods: AdminMembership[];
  orders: MembershipOrder[];
  enabled: boolean;
  migrationReady: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const plan = plans.find((item) => item.id === selected);
  async function toggle() {
    const result = await ask({ title: enabled ? "Pause membership checkout?" : "Enable membership checkout?", description: enabled ? "Members will no longer be able to start new membership payments. Existing terms and orders remain available for administration." : "Members will be able to use the payment mode configured on each published membership plan.", confirmLabel: enabled ? "Pause checkout" : "Enable checkout", tone: enabled ? "danger" : "default" });
    if (!result) return;
    setBusy("flag");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_enabled: !enabled,
      p_key: "memberships",
    });
    setBusy("");
    setMessage(
      error
        ? error.message
        : `Memberships ${enabled ? "disabled" : "enabled"}.`,
    );
    if (!error) location.reload();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("plan");
    const { error } = await supabase.rpc("save_membership_plan", {
      p_currency: form.get("currency"),
      p_description: form.get("description"),
      p_duration: Number(form.get("duration")),
      p_grace: Number(form.get("grace")),
      p_name: form.get("name"),
      p_payment_mode: form.get("payment_mode"),
      p_plan_id: form.get("id") || null,
      p_price_minor: Math.round(Number(form.get("price")) * 100),
      p_slug: form.get("slug"),
      p_status: form.get("status"),
    });
    setBusy("");
    setMessage(error ? error.message : "Membership plan saved and audited.");
    if (!error) location.reload();
  }
  async function review(id: string, action: string) {
    const result = await ask({ title: action === "approve" ? "Approve this membership order?" : "Reject this membership order?", description: action === "approve" ? "Confirm that the manual payment evidence has been checked. Approval grants the configured membership term." : "The membership term will not be granted. Record a clear reason for the audit history.", confirmLabel: action === "approve" ? "Approve order" : "Reject order", tone: action === "reject" ? "danger" : "default", fields: [{ name: "note", label: action === "approve" ? "Approval note (optional)" : "Reason for rejection", type: "textarea", required: action === "reject", minLength: action === "reject" ? 5 : undefined, maxLength: 500, help: "Do not include full card or bank account details." }] });
    if (!result) return;
    const note = String(result.note ?? "");
    setBusy(id);
    const { error } = await supabase.rpc("review_membership_order", {
      p_action: action,
      p_note: note,
      p_order_id: id,
    });
    setBusy("");
    setMessage(error ? error.message : `Membership order ${action}d.`);
    if (!error) location.reload();
  }
  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("grant");
    const { error } = await supabase.rpc("grant_membership", {
      p_note: form.get("note"),
      p_plan_id: form.get("plan_id"),
      p_user_email: form.get("email"),
    });
    setBusy("");
    setMessage(error ? error.message : "Membership term granted and audited.");
    if (!error) location.reload();
  }
  async function reconcile() {
    const result = await ask({ title: "Reconcile membership states now?", description: "This applies scheduled starts, grace periods, expiries and dormant access using the current database time. Every resulting status change remains auditable.", confirmLabel: "Run reconciliation" });
    if (!result) return;
    setBusy("reconcile");
    const { data, error } = await supabase.rpc("reconcile_membership_periods");
    setBusy("");
    setMessage(
      error
        ? error.message
        : `Lifecycle reconciled: ${JSON.stringify(data?.[0] ?? {})}`,
    );
    if (!error) location.reload();
  }
  async function createTestUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("test");
    const response = await fetch("/api/admin/test-users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: form.get("display_name"),
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const body = (await response.json()) as { error?: string; email?: string };
    setBusy("");
    setMessage(body.error ?? `Tagged test member created: ${body.email}`);
    if (response.ok) (event.currentTarget as HTMLFormElement).reset();
  }
  if (!migrationReady)
    return (
      <section className="admin-section" id="memberships-admin">
        <div className="admin-empty">
          <strong>Membership migration required</strong>
          <p>
            Apply the membership renewal lifecycle migration to activate these
            controls.
          </p>
        </div>
      </section>
    );
  return (
    <section className="admin-section membership-admin" id="memberships-admin">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Controlled account lifecycle</p>
          <h2>Membership operations</h2>
          <p>
            Define terms, review manual payments, grant exceptions and test
            safely without polluting member metrics.
          </p>
        </div>
        <button
          className={enabled ? "danger-action" : ""}
          disabled={busy === "flag"}
          onClick={() => void toggle()}
        >
          {enabled ? "Pause checkout" : "Enable after sign-off"}
        </button>
      </div>
      <div className="membership-admin-grid">
        <form onSubmit={(event) => void save(event)}>
          <label>
            Plan
            <select
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">Create new</option>
              {plans.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="id" value={plan?.id ?? ""} />
          <label>
            Name
            <input
              name="name"
              required
              minLength={3}
              defaultValue={plan?.name ?? ""}
              key={`name-${selected}`}
            />
          </label>
          <label>
            URL slug
            <input
              name="slug"
              required
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              defaultValue={plan?.slug ?? ""}
              key={`slug-${selected}`}
            />
          </label>
          <label>
            Description
            <textarea
              name="description"
              required
              minLength={20}
              defaultValue={plan?.description ?? ""}
              key={`desc-${selected}`}
            />
          </label>
          <div className="admin-form-row">
            <label>
              Price
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                defaultValue={plan ? plan.price_minor / 100 : 0}
                key={`price-${selected}`}
              />
            </label>
            <label>
              Currency
              <input
                name="currency"
                pattern="[A-Z]{3}"
                defaultValue={plan?.currency ?? "KES"}
                key={`currency-${selected}`}
              />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Months
              <input
                name="duration"
                type="number"
                min="1"
                max="36"
                defaultValue={plan?.duration_months ?? 12}
                key={`duration-${selected}`}
              />
            </label>
            <label>
              Grace days
              <input
                name="grace"
                type="number"
                min="0"
                max="60"
                defaultValue={plan?.grace_days ?? 14}
                key={`grace-${selected}`}
              />
            </label>
          </div>
          <div className="admin-form-row">
            <label>
              Payment
              <select
                name="payment_mode"
                defaultValue={plan?.payment_mode ?? "closed"}
                key={`mode-${selected}`}
              >
                <option value="closed">Closed</option>
                <option value="manual_review">Manual review</option>
                <option value="automatic">Paystack automatic</option>
              </select>
            </label>
            <label>
              Status
              <select
                name="status"
                defaultValue={plan?.status ?? "draft"}
                key={`status-${selected}`}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <button className="button button-primary" disabled={busy === "plan"}>
            Save plan
          </button>
        </form>
        <div className="membership-admin-tools">
          <form onSubmit={(event) => void grant(event)}>
            <h3>Audited manual grant</h3>
            <label>
              Member email
              <input name="email" type="email" required />
            </label>
            <label>
              Plan
              <select name="plan_id" required>
                <option value="">Select</option>
                {plans.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <input name="note" required minLength={5} />
            </label>
            <button disabled={busy === "grant"}>Grant membership</button>
          </form>
          <form onSubmit={(event) => void createTestUser(event)}>
            <h3>Production-safe test identity</h3>
            <p>
              Reserved <code>.invalid</code> addresses are tagged and excluded
              from automated dormancy and metrics.
            </p>
            <label>
              Display name
              <input
                name="display_name"
                required
                defaultValue="HAT Test Member"
              />
            </label>
            <label>
              Test email
              <input
                name="email"
                type="email"
                required
                defaultValue="hat-member@example.invalid"
              />
            </label>
            <label>
              Temporary password
              <input
                name="password"
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            <button disabled={busy === "test"}>Create tagged test user</button>
          </form>
          <button
            onClick={() => void reconcile()}
            disabled={busy === "reconcile"}
          >
            Run lifecycle reconciliation
          </button>
        </div>
      </div>
      <div className="membership-order-list">
        <h3>Payment reviews</h3>
        {orders.length ? (
          orders.map((order) => (
            <article key={order.order_id}>
              <div>
                <strong>{order.plan_name}</strong>
                <small>
                  {order.reference} · {order.display_name || order.email}
                </small>
                {order.submitted_reference ? (
                  <span>Reference: {order.submitted_reference}</span>
                ) : null}
              </div>
              <span>
                {order.currency}{" "}
                {(order.total_minor / 100).toLocaleString("en-KE")} ·{" "}
                {order.status.replace("_", " ")}
              </span>
              {order.status === "pending_review" ? (
                <div className="member-actions">
                  <button
                    disabled={busy === order.order_id}
                    onClick={() => void review(order.order_id, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy === order.order_id}
                    onClick={() => void review(order.order_id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <div className="admin-empty">
            <strong>No membership orders</strong>
            <p>Submitted renewals and activations will appear here.</p>
          </div>
        )}
      </div>
      <div className="membership-period-list">
        <h3>Membership ledger</h3>
        {periods.slice(0, 50).map((item) => (
          <article key={item.period_id}>
            <div>
              <strong>
                {item.display_name || item.email}
                {item.is_test_account ? " · TEST" : ""}
              </strong>
              <small>
                {item.plan_name} · {item.source.replace("_", " ")}
              </small>
            </div>
            <span className="member-status">{item.status}</span>
            <small>
              {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(
                new Date(item.starts_at),
              )}{" "}
              —{" "}
              {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(
                new Date(item.ends_at),
              )}
            </small>
          </article>
        ))}
      </div>
      {message ? (
        <p className="manager-message content-manager-message">{message}</p>
      ) : null}
      {dialog}
    </section>
  );
}
