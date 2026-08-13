"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunityHostCommerce = {
  host_plan_id: string | null;
  host_plan_name: string | null;
  host_plan_status: string | null;
  host_plan_ends_at: string | null;
  platform_fee_bps: number | null;
  max_moderators: number | null;
  plan_features: Record<string, boolean> | null;
  payout_status: string;
  terms_version: string | null;
  terms_accepted_at: string | null;
  offer_id: string | null;
  offer_name: string | null;
  offer_description: string | null;
  offer_access_type: "free" | "paid" | null;
  offer_billing_interval: "one_time" | "monthly" | "annual" | null;
  offer_price_minor: number | null;
  offer_currency: string | null;
  offer_duration_months: number | null;
  offer_grace_days: number | null;
  offer_payment_mode: "automatic" | "manual_review" | "closed" | null;
  offer_status: "draft" | "published" | "paused" | "archived" | null;
  gross_minor: number;
  held_minor: number;
  settled_minor: number;
  paying_members: number;
  commerce_enabled: boolean;
};

export type CommunityHostPlanOption = {
  id: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  duration_months: number;
  platform_fee_bps: number;
  max_moderators: number;
  features: Record<string, boolean>;
};

export type CommunityHostBilling = {
  self_service_enabled: boolean;
  payment_mode: "automatic" | "manual_review" | "closed";
  grace_days: number;
  pending_order_id: string | null;
  pending_order_reference: string | null;
  pending_order_status: string | null;
  pending_order_kind: "new" | "renewal" | "plan_change" | null;
  pending_plan_name: string | null;
  pending_total_minor: number | null;
  pending_currency: string | null;
  scheduled_plan_name: string | null;
  scheduled_starts_at: string | null;
  scheduled_ends_at: string | null;
  scheduled_order_reference: string | null;
};

function money(amount: number, currency = "KES") {
  return new Intl.NumberFormat("en-KE", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount / 100);
}

export function CommunityCommercePanel({
  billing,
  billingReady,
  commerce,
  communityId,
  migrationReady,
  plans,
}: {
  billing: CommunityHostBilling | null;
  billingReady: boolean;
  commerce: CommunityHostCommerce | null;
  communityId: string;
  migrationReady: boolean;
  plans: CommunityHostPlanOption[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState(
    commerce?.host_plan_id ?? plans[0]?.id ?? "",
  );

  async function startPlanCheckout(plan: CommunityHostPlanOption) {
    setBusy(`plan-${plan.id}`);
    setMessage("");
    try {
      const response = await fetch("/api/payments/paystack/initialize", {
        body: JSON.stringify({
          communityHostPlanId: plan.id,
          communityId,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as {
        authorizationUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.authorizationUrl) {
        throw new Error(result.error ?? "Checkout could not be started");
      }
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      setBusy("");
      setMessage(memberErrorMessage(error, "start secure host plan checkout"));
    }
  }

  async function submitManualPlan(
    event: FormEvent<HTMLFormElement>,
    plan: CommunityHostPlanOption,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(`manual-plan-${plan.id}`);
    setMessage("");
    const { error } = await supabase.rpc(
      "create_community_host_plan_order",
      {
        p_community_id: communityId,
        p_manual_note: form.get("note"),
        p_manual_reference: form.get("reference"),
        p_plan_id: plan.id,
      },
    );
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "submit this host plan payment")
        : "Host plan payment submitted. Your community remains available while our team checks it.",
    );
    if (!error) router.refresh();
  }

  if (!migrationReady) {
    return (
      <section className="community-commerce-panel" id="commerce">
        <div className="admin-empty">
          <strong>Community payments are not ready yet</strong>
          <p>
            No pricing or payout setting has changed. Payment controls will
            appear here when secure setup is complete.
          </p>
        </div>
      </section>
    );
  }

  if (!commerce?.host_plan_id) {
    const selectedPlan =
      plans.find((plan) => plan.id === selectedPlanId) ?? plans[0];
    const pending = Boolean(billing?.pending_order_id);
    const selfServiceOpen =
      billingReady &&
      billing?.self_service_enabled &&
      billing.payment_mode !== "closed";
    return (
      <section className="community-commerce-panel" id="commerce">
        <div className="community-commerce-intro">
          <div>
            <p className="eyebrow">Plans &amp; payments</p>
            <h2>Choose the plan that fits your community.</h2>
            <p>
              Your community is already approved. A host plan adds paid access,
              plan features and creator earnings without changing member safety.
            </p>
          </div>
          <span className="community-commerce-status">
            {pending ? "Payment in review" : "Plan required"}
          </span>
        </div>
        {pending ? (
          <div className="community-plan-pending">
            <span>Current request</span>
            <strong>{billing?.pending_plan_name}</strong>
            <p>
              {billing?.pending_order_status === "pending_payment"
                ? "Secure checkout is awaiting confirmation."
                : "Our team is checking your payment reference."}
            </p>
            <small>
              {billing?.pending_order_reference} ·{" "}
              {money(
                billing?.pending_total_minor ?? 0,
                billing?.pending_currency ?? "KES",
              )}
            </small>
          </div>
        ) : selfServiceOpen && plans.length ? (
          <>
            <div className="community-host-plan-chooser">
              {plans.map((plan) => (
                <article
                  className={selectedPlan?.id === plan.id ? "selected" : ""}
                  key={plan.id}
                >
                  <button
                    aria-pressed={selectedPlan?.id === plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    type="button"
                  >
                    <span>{plan.duration_months}-month access</span>
                    <strong>{plan.name}</strong>
                    <p>{plan.description}</p>
                    <ul aria-label={`${plan.name} host tools`}>
                      <li>
                        {plan.max_moderators} moderator
                        {plan.max_moderators === 1 ? "" : "s"}
                      </li>
                      <li>
                        {plan.features.advanced_analytics
                          ? "Advanced insights"
                          : "Core health"}
                      </li>
                      <li>
                        {plan.features.automations
                          ? "Host reminders"
                          : "Manual follow-up"}
                      </li>
                    </ul>
                    <div>
                      <b>{money(plan.price_minor, plan.currency)}</b>
                      <small>
                        {plan.platform_fee_bps / 100}% member-revenue fee
                      </small>
                    </div>
                  </button>
                </article>
              ))}
            </div>
            {selectedPlan ? (
              <div className="community-plan-checkout">
                <div>
                  <span>Selected plan</span>
                  <strong>{selectedPlan.name}</strong>
                  <p>
                    Up to {selectedPlan.max_moderators} community moderator
                    {selectedPlan.max_moderators === 1 ? "" : "s"}. The plan
                    starts only after verified payment.
                  </p>
                </div>
                {billing?.payment_mode === "automatic" ? (
                  <button
                    className="button button-primary"
                    disabled={busy === `plan-${selectedPlan.id}`}
                    onClick={() => void startPlanCheckout(selectedPlan)}
                  >
                    {busy === `plan-${selectedPlan.id}`
                      ? "Opening secure checkout…"
                      : `Continue with ${selectedPlan.name}`}
                  </button>
                ) : (
                  <form
                    className="community-manual-payment"
                    onSubmit={(event) =>
                      void submitManualPlan(event, selectedPlan)
                    }
                  >
                    <label>
                      Payment reference
                      <input
                        maxLength={120}
                        minLength={3}
                        name="reference"
                        placeholder="e.g. M-PESA code"
                        required
                      />
                    </label>
                    <label>
                      Verification note
                      <textarea
                        maxLength={500}
                        minLength={5}
                        name="note"
                        placeholder="How and when did you pay?"
                        required
                      />
                    </label>
                    <button
                      className="button button-primary"
                      disabled={busy === `manual-plan-${selectedPlan.id}`}
                    >
                      {busy === `manual-plan-${selectedPlan.id}`
                        ? "Submitting…"
                        : `Submit ${selectedPlan.name} payment`}
                    </button>
                  </form>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="community-commerce-locked">
            <strong>Host plan selection is not open yet.</strong>
            <p>
              Your community remains fully available. Our team can assign a plan
              directly or open online plan payments when secure payment checks
              are complete.
            </p>
            <small>No payment can be submitted while billing is closed.</small>
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

  const currency = commerce.offer_currency ?? "KES";
  const termsReady = Boolean(commerce.terms_accepted_at);
  const payoutReady = commerce.payout_status === "verified";
  const releaseReady = commerce.commerce_enabled;
  const paidPublishReady = termsReady && payoutReady && releaseReady;
  const pendingPlanOrder = Boolean(billing?.pending_order_id);
  const scheduledPlan = Boolean(billing?.scheduled_plan_name);
  const selfServiceOpen =
    billingReady &&
    billing?.self_service_enabled &&
    billing.payment_mode !== "closed";
  const selectedLifecyclePlan =
    plans.find((plan) => plan.id === selectedPlanId) ??
    plans.find((plan) => plan.id === commerce.host_plan_id) ??
    plans[0];
  const planEndsAt = commerce.host_plan_ends_at
    ? new Date(commerce.host_plan_ends_at)
    : null;
  const planDaysRemaining = planEndsAt
    ? Math.max(
        0,
        Math.ceil((planEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      )
    : null;

  async function acceptTerms(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("terms");
    setMessage("");
    const { error } = await supabase.rpc("accept_community_host_terms", {
      p_community_id: communityId,
      p_terms_version: "2026-08",
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "record your host agreement")
        : "Host agreement recorded. The payout review can now continue.",
    );
    if (!error) router.refresh();
  }

  async function saveOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const price = Number(form.get("price"));
    setBusy("offer");
    setMessage("");
    const { error } = await supabase.rpc("save_community_offer", {
      p_access_type: form.get("accessType"),
      p_billing_interval: form.get("billingInterval"),
      p_community_id: communityId,
      p_currency: form.get("currency"),
      p_description: form.get("description"),
      p_duration_months: Number(form.get("durationMonths")),
      p_grace_days: Number(form.get("graceDays")),
      p_name: form.get("name"),
      p_payment_mode: form.get("paymentMode"),
      p_price_minor:
        form.get("accessType") === "free" ? 0 : Math.round(price * 100),
      p_status: form.get("status"),
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "save this community offer")
        : "Community offer saved and audited.",
    );
    if (!error) router.refresh();
  }

  return (
    <section className="community-commerce-panel" id="commerce">
      <div className="community-commerce-intro">
        <div>
          <p className="eyebrow">Plans &amp; payments</p>
          <h2>Set a clear promise and a fair price.</h2>
          <p>
            Access is approved before payment. Earnings remain held until
            provider settlement and payout identity are reconciled.
          </p>
        </div>
        <span
          className={`community-commerce-status ${
            paidPublishReady ? "ready" : ""
          }`}
        >
          {paidPublishReady ? "Ready to publish" : "Setup in progress"}
        </span>
      </div>

      <div className="community-commerce-metrics">
        <article>
          <span>Host plan</span>
          <strong>{commerce.host_plan_name}</strong>
          <small>
            {commerce.host_plan_ends_at
              ? `Through ${new Date(commerce.host_plan_ends_at).toLocaleDateString("en-KE", { dateStyle: "medium" })}`
              : "Active"}
          </small>
        </article>
        <article>
          <span>Paying members</span>
          <strong>{commerce.paying_members}</strong>
          <small>Active or in grace</small>
        </article>
        <article>
          <span>Gross collected</span>
          <strong>{money(commerce.gross_minor, currency)}</strong>
          <small>
            {(commerce.platform_fee_bps ?? 0) / 100}% platform fee
          </small>
        </article>
        <article>
          <span>Held for you</span>
          <strong>{money(commerce.held_minor, currency)}</strong>
          <small>Not yet available for payout</small>
        </article>
      </div>

      <section className="community-host-lifecycle">
        <div className="community-host-lifecycle-heading">
          <div>
            <p className="eyebrow">Plan renewal</p>
            <h3>Keep your community controls available.</h3>
            <p>
              Renew your current plan or choose the plan that should begin when
              this period ends. There is never more than one upcoming plan.
            </p>
          </div>
          <span
            className={`community-commerce-status ${
              commerce.host_plan_status === "active" ? "ready" : ""
            }`}
          >
            {commerce.host_plan_status === "grace"
              ? "Renewal grace"
              : `${planDaysRemaining ?? "—"} days left`}
          </span>
        </div>

        {commerce.host_plan_status === "grace" ? (
          <div className="community-plan-attention">
            <strong>Paid member checkout is safely paused.</strong>
            <p>
              Your community and existing members remain intact. Complete a
              verified renewal during the {billing?.grace_days ?? 7}-day grace
              window to restore the next host period.
            </p>
          </div>
        ) : null}

        {scheduledPlan ? (
          <div className="community-plan-scheduled">
            <div>
              <span>Next plan secured</span>
              <strong>{billing?.scheduled_plan_name}</strong>
              <p>
                Starts{" "}
                {billing?.scheduled_starts_at
                  ? new Date(
                      billing.scheduled_starts_at,
                    ).toLocaleDateString("en-KE", { dateStyle: "long" })
                  : "after your current period"}
                . Your current plan remains active until then.
              </p>
            </div>
            <small>{billing?.scheduled_order_reference}</small>
          </div>
        ) : pendingPlanOrder ? (
          <div className="community-plan-pending">
            <span>
              {billing?.pending_order_kind === "plan_change"
                ? "Plan change awaiting verification"
                : "Renewal awaiting verification"}
            </span>
            <strong>{billing?.pending_plan_name}</strong>
            <p>
              {billing?.pending_order_status === "pending_payment"
                ? "Secure checkout is awaiting confirmation."
                : "Our team is checking your payment reference."}
            </p>
            <small>
              {billing?.pending_order_reference} ·{" "}
              {money(
                billing?.pending_total_minor ?? 0,
                billing?.pending_currency ?? "KES",
              )}
            </small>
          </div>
        ) : selfServiceOpen && plans.length ? (
          <div className="community-lifecycle-checkout">
            <div className="community-lifecycle-plans">
              {plans.map((plan) => {
                const isCurrent = plan.id === commerce.host_plan_id;
                return (
                  <button
                    aria-pressed={selectedLifecyclePlan?.id === plan.id}
                    className={
                      selectedLifecyclePlan?.id === plan.id ? "selected" : ""
                    }
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    type="button"
                  >
                    <span>{isCurrent ? "Current plan" : "Change next term"}</span>
                    <strong>{plan.name}</strong>
                    <b>{money(plan.price_minor, plan.currency)}</b>
                    <small>
                      {plan.duration_months} month
                      {plan.duration_months === 1 ? "" : "s"}
                    </small>
                  </button>
                );
              })}
            </div>
            {selectedLifecyclePlan ? (
              <div className="community-plan-checkout">
                <div>
                  <span>
                    {selectedLifecyclePlan.id === commerce.host_plan_id
                      ? "Renew current plan"
                      : "Schedule a plan change"}
                  </span>
                  <strong>{selectedLifecyclePlan.name}</strong>
                  <p>
                    {selectedLifecyclePlan.id === commerce.host_plan_id
                      ? "The next period begins when this one ends."
                      : "Your current plan stays active through its paid period; the new plan begins afterward."}
                  </p>
                </div>
                {billing?.payment_mode === "automatic" ? (
                  <button
                    className="button button-primary"
                    disabled={busy === `plan-${selectedLifecyclePlan.id}`}
                    onClick={() => void startPlanCheckout(selectedLifecyclePlan)}
                  >
                    {busy === `plan-${selectedLifecyclePlan.id}`
                      ? "Opening secure checkout…"
                      : selectedLifecyclePlan.id === commerce.host_plan_id
                        ? `Renew for ${money(selectedLifecyclePlan.price_minor, selectedLifecyclePlan.currency)}`
                        : `Choose ${selectedLifecyclePlan.name}`}
                  </button>
                ) : (
                  <form
                    className="community-manual-payment"
                    onSubmit={(event) =>
                      void submitManualPlan(event, selectedLifecyclePlan)
                    }
                  >
                    <label>
                      Payment reference
                      <input
                        maxLength={120}
                        minLength={3}
                        name="reference"
                        placeholder="e.g. M-PESA code"
                        required
                      />
                    </label>
                    <label>
                      Verification note
                      <textarea
                        maxLength={500}
                        minLength={5}
                        name="note"
                        placeholder="How and when did you pay?"
                        required
                      />
                    </label>
                    <button
                      className="button button-primary"
                      disabled={
                        busy === `manual-plan-${selectedLifecyclePlan.id}`
                      }
                    >
                      {busy === `manual-plan-${selectedLifecyclePlan.id}`
                        ? "Submitting…"
                        : selectedLifecyclePlan.id === commerce.host_plan_id
                          ? "Submit renewal payment"
                          : "Submit plan-change payment"}
                    </button>
                  </form>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="community-commerce-locked">
            <strong>Online plan changes are currently closed.</strong>
            <p>
              Your active period is unchanged. Our team can renew the plan
              directly or reopen online plan payments when secure checks are
              complete.
            </p>
          </div>
        )}
      </section>

      <div className="community-commerce-layout">
        <div className="community-commerce-readiness">
          <div>
            <p className="eyebrow">Before payments open</p>
            <h3>Three checks protect you and your members</h3>
          </div>
          <ol>
            <li className={termsReady ? "complete" : ""}>
              <span>{termsReady ? "✓" : "1"}</span>
              <div>
                <strong>Host agreement</strong>
                <small>
                  {termsReady
                    ? `Accepted · ${commerce.terms_version}`
                    : "Accept the community commerce responsibilities."}
                </small>
              </div>
            </li>
            <li className={payoutReady ? "complete" : ""}>
              <span>{payoutReady ? "✓" : "2"}</span>
              <div>
                <strong>Payout verification</strong>
                <small>
                  {payoutReady
                    ? "Verified by the platform."
                    : "Our team checks your payout details before payments begin."}
                </small>
              </div>
            </li>
            <li className={releaseReady ? "complete" : ""}>
              <span>{releaseReady ? "✓" : "3"}</span>
              <div>
                <strong>Community approval</strong>
                <small>
                  {releaseReady
                    ? "Paid member access is open."
                    : "Paid member access is not open yet."}
                </small>
              </div>
            </li>
          </ol>
          {!termsReady ? (
            <form className="community-host-terms" onSubmit={acceptTerms}>
              <label>
                <input name="agreement" required type="checkbox" />
                <span>
                  I will describe value honestly, moderate this room, respect
                  refunds and keep member data within Her Africa Table.
                </span>
              </label>
              <button
                className="button button-outline"
                disabled={busy === "terms"}
              >
                {busy === "terms" ? "Recording…" : "Accept host agreement"}
              </button>
            </form>
          ) : null}
        </div>

        <form className="community-offer-editor" onSubmit={saveOffer}>
          <div>
            <p className="eyebrow">Member offer</p>
            <h3>What members receive</h3>
          </div>
          <label>
            Offer name
            <input
              defaultValue={commerce.offer_name ?? "Community membership"}
              maxLength={100}
              minLength={3}
              name="name"
              required
            />
          </label>
          <label>
            Member promise
            <textarea
              defaultValue={commerce.offer_description ?? ""}
              maxLength={1500}
              minLength={20}
              name="description"
              placeholder="Describe the access, rhythm and outcomes members can expect."
              required
            />
          </label>
          <div className="community-offer-row">
            <label>
              Access
              <select
                defaultValue={commerce.offer_access_type ?? "free"}
                name="accessType"
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
              </select>
            </label>
            <label>
              Billing
              <select
                defaultValue={commerce.offer_billing_interval ?? "monthly"}
                name="billingInterval"
              >
                <option value="monthly">Monthly access</option>
                <option value="annual">Annual access</option>
                <option value="one_time">One-time access</option>
              </select>
            </label>
          </div>
          <div className="community-offer-row three">
            <label>
              Price
              <input
                defaultValue={(commerce.offer_price_minor ?? 0) / 100}
                min={0}
                name="price"
                required
                step="1"
                type="number"
              />
            </label>
            <label>
              Currency
              <select defaultValue={currency} name="currency">
                <option value="KES">KES</option>
                <option value="USD">USD</option>
                <option value="GHS">GHS</option>
                <option value="NGN">NGN</option>
                <option value="ZAR">ZAR</option>
              </select>
            </label>
            <label>
              Access months
              <input
                defaultValue={commerce.offer_duration_months ?? 1}
                max={60}
                min={1}
                name="durationMonths"
                required
                type="number"
              />
            </label>
          </div>
          <div className="community-offer-row">
            <label>
              Payment processing
              <select
                defaultValue={commerce.offer_payment_mode ?? "closed"}
                name="paymentMode"
              >
                <option value="closed">Closed — preserve approvals</option>
                <option value="manual_review">Our team confirms each payment</option>
                <option value="automatic">Automatic with Paystack</option>
              </select>
            </label>
            <label>
              Offer status
              <select
                defaultValue={commerce.offer_status ?? "draft"}
                name="status"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>
          <input
            name="graceDays"
            type="hidden"
            value={commerce.offer_grace_days ?? 7}
          />
          <button className="button button-primary" disabled={busy === "offer"}>
            {busy === "offer" ? "Saving offer…" : "Save member offer"}
          </button>
          {!paidPublishReady ? (
            <small>
              Drafts can be saved now. Paid publishing stays locked until all
              three safeguards pass.
            </small>
          ) : null}
        </form>
      </div>
      {message ? (
        <p className="manager-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
