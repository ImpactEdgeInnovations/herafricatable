"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityHostPlan = {
  plan_id: string;
  slug: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  duration_months: number;
  platform_fee_bps: number;
  max_moderators: number;
  features: Record<string, boolean>;
  status: string;
};

export type CommunityCommerceAdmin = {
  community_id: string;
  community_name: string;
  community_slug: string;
  owner_name: string | null;
  owner_email: string | null;
  host_plan_id: string | null;
  host_plan_name: string | null;
  host_plan_status: string | null;
  host_plan_ends_at: string | null;
  payout_status: string;
  terms_accepted_at: string | null;
  offer_status: string | null;
  offer_access_type: string | null;
  offer_price_minor: number | null;
  offer_currency: string | null;
  gross_minor: number;
  held_minor: number;
  paying_members: number;
};

export type CommunityOrderAdmin = {
  order_id: string;
  reference: string;
  community_id: string;
  community_name: string;
  member_email: string;
  member_name: string | null;
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

export function CommunityCreatorCommerceManager({
  communities,
  enabled,
  migrationReady,
  orders,
  plans,
}: {
  communities: CommunityCommerceAdmin[];
  enabled: boolean;
  migrationReady: boolean;
  orders: CommunityOrderAdmin[];
  plans: CommunityHostPlan[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [selectedCommunityId, setSelectedCommunityId] = useState(
    communities[0]?.community_id ?? "",
  );
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const selectedCommunity = communities.find(
    (item) => item.community_id === selectedCommunityId,
  );
  const selectedPlan = plans.find((item) => item.plan_id === selectedPlanId);

  if (!migrationReady) {
    return (
      <section className="admin-section" id="creator-commerce-admin">
        <div className="admin-empty">
          <strong>Creator commerce controls are not installed yet</strong>
          <p>
            Apply the creator-commerce migration before assigning host plans or
            accepting member payments.
          </p>
        </div>
      </section>
    );
  }

  async function toggle() {
    setBusy("flag");
    setMessage("");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_enabled: !enabled,
      p_key: "community_creator_commerce",
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "change creator commerce availability")
        : `Creator commerce ${enabled ? "disabled" : "enabled"}.`,
    );
    if (!error) router.refresh();
  }

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const features = {
      advanced_analytics: form.get("advancedAnalytics") === "on",
      automations: form.get("automations") === "on",
      multiple_moderators: Number(form.get("maxModerators")) > 1,
      paid_access: true,
    };
    setBusy("plan");
    setMessage("");
    const { error } = await supabase.rpc("save_community_host_plan", {
      p_currency: form.get("currency"),
      p_description: form.get("description"),
      p_duration_months: Number(form.get("durationMonths")),
      p_features: features,
      p_max_moderators: Number(form.get("maxModerators")),
      p_name: form.get("name"),
      p_plan_id: form.get("planId") || null,
      p_platform_fee_bps: Math.round(Number(form.get("platformFee")) * 100),
      p_price_minor: Math.round(Number(form.get("price")) * 100),
      p_slug: form.get("slug"),
      p_status: form.get("status"),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "save this host plan")
        : "Host plan saved and audited.",
    );
    if (!error) router.refresh();
  }

  async function grantPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("grant");
    setMessage("");
    const { error } = await supabase.rpc("grant_community_host_plan", {
      p_community_id: form.get("communityId"),
      p_months: Number(form.get("months")),
      p_note: form.get("note"),
      p_plan_id: form.get("planId"),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "assign this host plan")
        : "Host plan assigned and audited.",
    );
    if (!error) router.refresh();
  }

  async function reviewPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("payout");
    setMessage("");
    const { error } = await supabase.rpc("review_community_host_payout", {
      p_community_id: form.get("communityId"),
      p_note: form.get("note"),
      p_provider: form.get("provider"),
      p_provider_subaccount_code: form.get("providerReference"),
      p_status: form.get("status"),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "review this host payout profile")
        : "Payout readiness updated and audited.",
    );
    if (!error) router.refresh();
  }

  async function reviewOrder(order: CommunityOrderAdmin, action: string) {
    const answer = await ask({
      title:
        action === "approve"
          ? "Approve this community payment?"
          : "Reject this community payment?",
      description:
        action === "approve"
          ? "Approval grants the member access and records the host share as held revenue."
          : "Rejection cancels the order. The member approval remains available for a new payment.",
      confirmLabel: action === "approve" ? "Approve payment" : "Reject payment",
      fields: [
        {
          label: action === "approve" ? "Review note (optional)" : "Reason",
          name: "note",
          required: action === "reject",
          type: "textarea",
        },
      ],
      tone: action === "approve" ? "default" : "danger",
    });
    if (!answer) return;
    setBusy(order.order_id);
    setMessage("");
    const { error } = await supabase.rpc("review_community_order", {
      p_action: action,
      p_note: String(answer.note ?? ""),
      p_order_id: order.order_id,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, `${action} this community payment`)
        : `Community payment ${action === "approve" ? "approved" : "rejected"}.`,
    );
    if (!error) router.refresh();
  }

  return (
    <section
      className="admin-section community-creator-commerce-admin"
      id="creator-commerce-admin"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Approved host economy</p>
          <h2>Community creator commerce</h2>
          <p>
            Assign host plans, verify payout readiness and review manual member
            payments. Creator earnings remain held until settlement controls
            are released.
          </p>
        </div>
        <button
          className={enabled ? "danger-action" : ""}
          disabled={busy === "flag"}
          onClick={() => void toggle()}
        >
          {enabled ? "Pause all checkout" : "Enable approved checkout"}
        </button>
      </div>

      <div className="creator-commerce-safety">
        <strong>{enabled ? "Checkout release is on" : "Checkout is safely off"}</strong>
        <p>
          Payment mode can still be Automatic, Manual review or Closed on each
          community. Automatic host payouts are not enabled in this release.
        </p>
      </div>

      <div className="creator-plan-cards">
        {plans.map((plan) => (
          <button
            className={selectedPlanId === plan.plan_id ? "selected" : ""}
            key={plan.plan_id}
            onClick={() => setSelectedPlanId(plan.plan_id)}
            type="button"
          >
            <span>{plan.status}</span>
            <strong>{plan.name}</strong>
            <p>{plan.description}</p>
            <small>
              {money(plan.price_minor, plan.currency)} /{" "}
              {plan.duration_months === 1
                ? "month"
                : `${plan.duration_months} months`}{" "}
              · {plan.platform_fee_bps / 100}% platform fee
            </small>
          </button>
        ))}
        {!plans.length ? (
          <div className="admin-empty">
            <strong>No host plans yet</strong>
            <p>Create Starter and Pro plans below, then publish them.</p>
          </div>
        ) : null}
      </div>

      <div className="creator-commerce-admin-grid">
        <form onSubmit={savePlan}>
          <div>
            <p className="eyebrow">Plan catalogue</p>
            <h3>{selectedPlan ? `Edit ${selectedPlan.name}` : "Create host plan"}</h3>
          </div>
          <input name="planId" type="hidden" value={selectedPlan?.plan_id ?? ""} />
          <div className="admin-form-row">
            <label>
              Plan name
              <input
                defaultValue={selectedPlan?.name ?? ""}
                key={`plan-name-${selectedPlanId}`}
                minLength={3}
                name="name"
                required
              />
            </label>
            <label>
              Slug
              <input
                defaultValue={selectedPlan?.slug ?? ""}
                key={`plan-slug-${selectedPlanId}`}
                name="slug"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />
            </label>
          </div>
          <label>
            Plan promise
            <textarea
              defaultValue={selectedPlan?.description ?? ""}
              key={`plan-description-${selectedPlanId}`}
              minLength={20}
              name="description"
              required
            />
          </label>
          <div className="creator-plan-numbers">
            <label>
              Price
              <input
                defaultValue={(selectedPlan?.price_minor ?? 0) / 100}
                key={`plan-price-${selectedPlanId}`}
                min={0}
                name="price"
                required
                type="number"
              />
            </label>
            <label>
              Currency
              <select
                defaultValue={selectedPlan?.currency ?? "KES"}
                key={`plan-currency-${selectedPlanId}`}
                name="currency"
              >
                <option value="KES">KES</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label>
              Months
              <input
                defaultValue={selectedPlan?.duration_months ?? 1}
                key={`plan-months-${selectedPlanId}`}
                max={12}
                min={1}
                name="durationMonths"
                required
                type="number"
              />
            </label>
            <label>
              Platform fee %
              <input
                defaultValue={(selectedPlan?.platform_fee_bps ?? 1000) / 100}
                key={`plan-fee-${selectedPlanId}`}
                max={30}
                min={0}
                name="platformFee"
                required
                step=".25"
                type="number"
              />
            </label>
            <label>
              Moderators
              <input
                defaultValue={selectedPlan?.max_moderators ?? 1}
                key={`plan-moderators-${selectedPlanId}`}
                max={50}
                min={1}
                name="maxModerators"
                required
                type="number"
              />
            </label>
          </div>
          <div className="creator-plan-features">
            <label>
              <input
                defaultChecked={Boolean(
                  selectedPlan?.features?.advanced_analytics,
                )}
                key={`analytics-${selectedPlanId}`}
                name="advancedAnalytics"
                type="checkbox"
              />
              Advanced analytics
            </label>
            <label>
              <input
                defaultChecked={Boolean(selectedPlan?.features?.automations)}
                key={`automations-${selectedPlanId}`}
                name="automations"
                type="checkbox"
              />
              Host automations
            </label>
          </div>
          <label>
            Catalogue status
            <select
              defaultValue={selectedPlan?.status ?? "draft"}
              key={`plan-status-${selectedPlanId}`}
              name="status"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button className="button button-primary" disabled={busy === "plan"}>
            {busy === "plan" ? "Saving…" : "Save host plan"}
          </button>
        </form>

        <div className="creator-host-operations">
          <label>
            Community
            <select
              value={selectedCommunityId}
              onChange={(event) => setSelectedCommunityId(event.target.value)}
            >
              {communities.map((item) => (
                <option key={item.community_id} value={item.community_id}>
                  {item.community_name}
                </option>
              ))}
            </select>
          </label>
          {selectedCommunity ? (
            <article className="creator-host-summary">
              <div>
                <span>Owner</span>
                <strong>
                  {selectedCommunity.owner_name ??
                    selectedCommunity.owner_email ??
                    "Owner required"}
                </strong>
              </div>
              <div>
                <span>Host plan</span>
                <strong>{selectedCommunity.host_plan_name ?? "Not assigned"}</strong>
              </div>
              <div>
                <span>Payout review</span>
                <strong>{selectedCommunity.payout_status}</strong>
              </div>
              <div>
                <span>Held host share</span>
                <strong>
                  {money(
                    selectedCommunity.held_minor,
                    selectedCommunity.offer_currency ?? "KES",
                  )}
                </strong>
              </div>
            </article>
          ) : null}
          <form onSubmit={grantPlan}>
            <p className="eyebrow">Assign approved plan</p>
            <input name="communityId" type="hidden" value={selectedCommunityId} />
            <label>
              Published plan
              <select name="planId" required>
                <option value="">Choose plan</option>
                {plans
                  .filter((plan) => plan.status === "published")
                  .map((plan) => (
                    <option key={plan.plan_id} value={plan.plan_id}>
                      {plan.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Access months
              <input defaultValue={3} max={24} min={1} name="months" type="number" />
            </label>
            <label>
              Approval note
              <textarea
                minLength={5}
                name="note"
                placeholder="Why this host is approved"
                required
              />
            </label>
            <button disabled={!selectedCommunityId || busy === "grant"}>
              {busy === "grant" ? "Assigning…" : "Assign host plan"}
            </button>
          </form>
          <form onSubmit={reviewPayout}>
            <p className="eyebrow">Payout readiness</p>
            <input name="communityId" type="hidden" value={selectedCommunityId} />
            <div className="admin-form-row">
              <label>
                Review state
                <select name="status">
                  <option value="pending">Pending</option>
                  <option value="verified">Verified</option>
                  <option value="paused">Paused</option>
                </select>
              </label>
              <label>
                Provider
                <select name="provider">
                  <option value="paystack">Paystack</option>
                  <option value="manual">Manual settlement</option>
                </select>
              </label>
            </div>
            <label>
              Provider subaccount/reference
              <input
                maxLength={160}
                name="providerReference"
                placeholder="Required before Verified"
              />
            </label>
            <label>
              Review note
              <textarea minLength={5} name="note" required />
            </label>
            <button disabled={!selectedCommunityId || busy === "payout"}>
              {busy === "payout" ? "Saving…" : "Save payout review"}
            </button>
          </form>
        </div>
      </div>

      <div className="creator-order-queue">
        <div>
          <p className="eyebrow">Manual payment queue</p>
          <h3>Verify before opening the room</h3>
        </div>
        {orders.filter((order) => order.status === "pending_review").length ? (
          orders
            .filter((order) => order.status === "pending_review")
            .map((order) => (
              <article key={order.order_id}>
                <div>
                  <strong>{order.member_name ?? order.member_email}</strong>
                  <span>{order.community_name}</span>
                  <small>
                    {money(order.total_minor, order.currency)} ·{" "}
                    {order.submitted_reference}
                  </small>
                  <p>{order.submitter_note}</p>
                </div>
                <div className="member-actions">
                  <button
                    disabled={busy === order.order_id}
                    onClick={() => void reviewOrder(order, "approve")}
                  >
                    Approve
                  </button>
                  <button
                    className="danger-action"
                    disabled={busy === order.order_id}
                    onClick={() => void reviewOrder(order, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))
        ) : (
          <div className="admin-empty">
            <strong>No manual payments waiting</strong>
            <p>New submissions will appear here with their reference and note.</p>
          </div>
        )}
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
