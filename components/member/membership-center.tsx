"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type MembershipPlan = {
  plan_id: string;
  slug: string;
  name: string;
  description: string;
  price_minor: number;
  currency: string;
  duration_months: number;
  grace_days: number;
  payment_mode: string;
  status: string;
  current_period_id: string | null;
  current_status: string | null;
  current_starts_at: string | null;
  current_ends_at: string | null;
  grace_ends_at: string | null;
};

export function MembershipCenter({
  accessStatus,
  plans,
}: {
  accessStatus: string;
  plans: MembershipPlan[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const current = plans.find((plan) => plan.current_period_id)?.current_status;
  async function purchase(
    event: FormEvent<HTMLFormElement>,
    plan: MembershipPlan,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(plan.plan_id);
    setMessage("");
    if (plan.payment_mode === "automatic") {
      const response = await fetch("/api/payments/paystack/initialize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ membershipPlanId: plan.plan_id }),
      });
      const body = (await response.json()) as {
        authorizationUrl?: string;
        error?: string;
      };
      setBusy("");
      if (body.authorizationUrl) {
        window.location.assign(body.authorizationUrl);
        return;
      }
      setMessage(memberErrorMessage(body.error, "start membership checkout"));
      return;
    }
    const { error } = await supabase.rpc("create_membership_order", {
      p_plan_id: plan.plan_id,
      p_manual_reference: form.get("reference"),
      p_manual_note: form.get("note"),
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "submit your membership payment for review")
        : "Your payment details are being checked privately by our team.",
    );
    if (!error) router.refresh();
  }
  return (
    <>
      <section className="membership-status">
        <div>
          <p className="eyebrow">Membership standing</p>
          <h2>
            {current
              ? current.replace("_", " ")
              : accessStatus === "active"
                ? "Your member access is active"
                : "Membership renewal is needed"}
          </h2>
          <p>
            {plans.length
              ? "You can see when your current membership ends and renew without losing any remaining time."
              : "The team is preparing the first membership plans. Nothing is required from you until an option is published."}
          </p>
        </div>
        {plans.find((plan) => plan.current_period_id)?.current_ends_at ? (
          <dl>
            <dt>Current term ends</dt>
            <dd>
              {new Intl.DateTimeFormat("en-KE", { dateStyle: "long" }).format(
                new Date(
                  plans.find(
                    (plan) => plan.current_period_id,
                  )!.current_ends_at!,
                ),
              )}
            </dd>
          </dl>
        ) : null}
      </section>
      {plans.length ? <section className="membership-grid">
        {plans.map((plan) => (
          <article key={plan.plan_id}>
            <span>{plan.duration_months} month term</span>
            <h2>{plan.name}</h2>
            <p>{plan.description}</p>
            <strong>
              {plan.currency}{" "}
              {(plan.price_minor / 100).toLocaleString("en-KE", {
                minimumFractionDigits: 2,
              })}
            </strong>
            <small>
              {plan.grace_days} days to renew after your end date
            </small>
            {plan.payment_mode === "closed" ? (
              <button disabled>Enrollment closed</button>
            ) : (
              <form onSubmit={(event) => void purchase(event, plan)}>
                {plan.payment_mode === "manual_review" ? (
                  <>
                    <label>
                      Payment reference
                      <input
                        name="reference"
                        required
                        minLength={3}
                        aria-describedby={`payment-reference-help-${plan.plan_id}`}
                      />
                      <small
                        className="form-help"
                        id={`payment-reference-help-${plan.plan_id}`}
                      >
                        Enter the transaction code shown on your payment
                        receipt.
                      </small>
                    </label>
                    <label>
                      Private payment note
                      <textarea
                        name="note"
                        required
                        minLength={5}
                        aria-describedby={`payment-note-help-${plan.plan_id}`}
                      />
                      <small
                        className="form-help"
                        id={`payment-note-help-${plan.plan_id}`}
                      >
                        Include the payment method, date and payer name so the
                        team can verify it quickly.
                      </small>
                    </label>
                  </>
                ) : null}
                <button
                  className="button button-primary"
                  disabled={busy === plan.plan_id}
                >
                  {busy === plan.plan_id
                    ? "Processing…"
                    : plan.current_period_id
                      ? "Renew membership"
                      : "Activate membership"}
                </button>
              </form>
            )}
          </article>
        ))}
      </section> : (
        <section className="membership-empty">
          <span className="membership-empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 3 4 7v5c0 4.8 3.2 7.7 8 9 4.8-1.3 8-4.2 8-9V7l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>
          </span>
          <div>
            <p className="eyebrow">No plan to choose yet</p>
            <h2>We will let you know when membership opens.</h2>
            <p>Your current platform access is unchanged. Published plans, pricing and renewal dates will appear here before any action is required.</p>
            <div>
              <Link className="button button-primary" href="/home">Return home</Link>
              <Link className="button button-outline" href="/support">Ask a membership question</Link>
            </div>
          </div>
        </section>
      )}
      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
