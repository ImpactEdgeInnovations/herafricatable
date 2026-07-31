"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunitySummary = {
  community_id: string;
  slug: string;
  name: string;
  description: string;
  community_type: "official" | "private";
  status: string;
  membership_status: string | null;
  membership_role: string | null;
  member_count: number;
  pending_count: number;
  offer_id: string | null;
  offer_access_type: "free" | "paid" | null;
  offer_price_minor: number | null;
  offer_currency: string | null;
  offer_billing_interval: "one_time" | "monthly" | "annual" | null;
  offer_payment_mode: "automatic" | "manual_review" | "closed" | null;
};

function money(amount: number | null, currency: string | null) {
  if (amount === null || !currency) return "Free";
  return new Intl.NumberFormat("en-KE", {
    currency,
    maximumFractionDigits: 0,
    style: "currency",
  }).format(amount / 100);
}

function intervalLabel(interval: CommunitySummary["offer_billing_interval"]) {
  if (interval === "monthly") return "per month";
  if (interval === "annual") return "per year";
  return "one-time";
}

export function CommunityDirectory({
  communities,
}: {
  communities: CommunitySummary[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function join(item: CommunitySummary) {
    setBusy(item.community_id);
    setMessage("");
    const { error } =
      item.membership_status === "invited"
        ? await supabase.rpc("respond_to_community_invitation", {
            p_accept: true,
            p_community_id: item.community_id,
          })
        : await supabase.rpc("request_community_access", {
            p_community_id: item.community_id,
          });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "update your community membership")
        : item.membership_status === "invited"
          ? item.offer_access_type === "paid" &&
            item.membership_role === "member"
            ? "Invitation accepted. Complete payment to enter the community."
            : "Invitation accepted. Welcome to the community."
          : item.community_type === "private"
          ? "Your request has been sent to the host."
          : item.offer_access_type === "paid"
            ? "You are approved. Complete payment to enter the community."
            : "Welcome to the community.",
    );
    if (!error) router.refresh();
  }

  async function checkout(item: CommunitySummary) {
    if (!item.offer_id) return;
    setBusy(`checkout-${item.community_id}`);
    setMessage("");
    try {
      const response = await fetch("/api/payments/paystack/initialize", {
        body: JSON.stringify({ communityOfferId: item.offer_id }),
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
      setMessage(
        memberErrorMessage(error, "start secure community checkout"),
      );
    }
  }

  async function submitManual(
    event: FormEvent<HTMLFormElement>,
    item: CommunitySummary,
  ) {
    event.preventDefault();
    if (!item.offer_id) return;
    const form = new FormData(event.currentTarget);
    setBusy(`manual-${item.community_id}`);
    setMessage("");
    const { error } = await supabase.rpc("create_community_order", {
      p_manual_note: form.get("note"),
      p_manual_reference: form.get("reference"),
      p_offer_id: item.offer_id,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "submit your payment for review")
        : "Payment details received. An administrator will verify them before access is opened.",
    );
    if (!error) router.refresh();
  }

  return (
    <>
      <section className="community-grid">
        {communities.map((item) => {
          const paid = item.offer_access_type === "paid";
          const awaitingPayment =
            item.membership_status === "approved_pending_payment";
          return (
            <article key={item.community_id}>
              <div className="community-card-meta">
                <span>{item.community_type}</span>
                <small>
                  {item.member_count} member
                  {Number(item.member_count) === 1 ? "" : "s"}
                </small>
              </div>
              <div className="community-card-heading">
                <h2>{item.name}</h2>
                <div className={paid ? "community-price paid" : "community-price"}>
                  <strong>
                    {paid
                      ? money(item.offer_price_minor, item.offer_currency)
                      : "Free"}
                  </strong>
                  {paid ? (
                    <small>{intervalLabel(item.offer_billing_interval)}</small>
                  ) : null}
                </div>
              </div>
              <p>{item.description}</p>
              <footer>
                {item.membership_status === "active" ? (
                  <Link
                    className="button button-primary"
                    href={`/communities/${item.slug}`}
                  >
                    Enter community
                  </Link>
                ) : item.membership_status === "requested" ? (
                  <span className="community-membership-state">
                    <strong>Request with host</strong>
                    <small>You will hear from the host after review.</small>
                  </span>
                ) : awaitingPayment ? (
                  <div className="community-checkout">
                    <div>
                      <strong>Host approved</strong>
                      <small>Complete access to enter this room.</small>
                    </div>
                    {item.offer_payment_mode === "automatic" ? (
                      <button
                        className="button button-primary"
                        disabled={busy === `checkout-${item.community_id}`}
                        onClick={() => void checkout(item)}
                      >
                        {busy === `checkout-${item.community_id}`
                          ? "Opening secure checkout…"
                          : `Pay ${money(item.offer_price_minor, item.offer_currency)}`}
                      </button>
                    ) : item.offer_payment_mode === "manual_review" ? (
                      <form
                        className="community-manual-payment"
                        onSubmit={(event) => void submitManual(event, item)}
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
                          disabled={busy === `manual-${item.community_id}`}
                        >
                          {busy === `manual-${item.community_id}`
                            ? "Submitting…"
                            : "Submit for verification"}
                        </button>
                      </form>
                    ) : (
                      <span className="community-membership-state">
                        <strong>Payment opening soon</strong>
                        <small>Your approval is safely retained.</small>
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    className="button button-outline"
                    disabled={busy === item.community_id}
                    onClick={() => void join(item)}
                  >
                    {item.membership_status === "invited"
                      ? "Accept invitation"
                      : item.community_type === "private"
                        ? "Request access"
                        : paid
                          ? "Join and continue"
                          : "Join community"}
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </section>
      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
