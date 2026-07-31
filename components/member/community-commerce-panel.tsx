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

function money(amount: number, currency = "KES") {
  return new Intl.NumberFormat("en-KE", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount / 100);
}

export function CommunityCommercePanel({
  commerce,
  communityId,
  migrationReady,
}: {
  commerce: CommunityHostCommerce | null;
  communityId: string;
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  if (!migrationReady) {
    return (
      <section className="community-commerce-panel" id="commerce">
        <div className="admin-empty">
          <strong>Host commerce is being prepared</strong>
          <p>
            No pricing or payout setting has changed. This workspace will open
            after the commerce migration is installed.
          </p>
        </div>
      </section>
    );
  }

  if (!commerce?.host_plan_id) {
    return (
      <section className="community-commerce-panel" id="commerce">
        <div className="community-commerce-intro">
          <div>
            <p className="eyebrow">Community creator commerce</p>
            <h2>Build value before charging for access.</h2>
          </div>
          <span className="community-commerce-status">Approval required</span>
        </div>
        <div className="community-commerce-locked">
          <strong>Your community does not have an approved host plan yet.</strong>
          <p>
            Her Africa Table reviews the host, purpose, safety practice and
            member promise before enabling a paid offer. Your current community
            remains fully available.
          </p>
          <small>
            Ask the platform administrator to assign a Starter or Pro host plan.
          </small>
        </div>
      </section>
    );
  }

  const currency = commerce.offer_currency ?? "KES";
  const termsReady = Boolean(commerce.terms_accepted_at);
  const payoutReady = commerce.payout_status === "verified";
  const releaseReady = commerce.commerce_enabled;
  const paidPublishReady = termsReady && payoutReady && releaseReady;

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
          <p className="eyebrow">Community creator commerce</p>
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

      <div className="community-commerce-layout">
        <div className="community-commerce-readiness">
          <div>
            <p className="eyebrow">Publishing readiness</p>
            <h3>Three safeguards before paid access</h3>
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
                    : "The admin verifies your provider payout identity."}
                </small>
              </div>
            </li>
            <li className={releaseReady ? "complete" : ""}>
              <span>{releaseReady ? "✓" : "3"}</span>
              <div>
                <strong>Release approval</strong>
                <small>
                  {releaseReady
                    ? "Creator commerce is enabled."
                    : "The platform release flag remains safely off."}
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
                <option value="manual_review">Manual admin verification</option>
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
