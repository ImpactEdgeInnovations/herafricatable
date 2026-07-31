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
  const [query, setQuery] = useState("");

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

  const memberStates = [
    "active",
    "requested",
    "invited",
    "approved_pending_payment",
  ];
  const memberCommunities = communities.filter((item) =>
    memberStates.includes(item.membership_status ?? ""),
  );
  const discoverCommunities = communities.filter(
    (item) => !memberStates.includes(item.membership_status ?? ""),
  );
  const cleanQuery = query.trim().toLowerCase();
  const visibleDiscover = discoverCommunities.filter((item) =>
    cleanQuery
      ? [item.name, item.description, item.community_type].some((value) =>
          value.toLowerCase().includes(cleanQuery),
        )
      : true,
  );

  function renderCommunityCard(
    item: CommunitySummary,
    context: "discover" | "member",
  ) {
    const paid = item.offer_access_type === "paid";
    const awaitingPayment =
      item.membership_status === "approved_pending_payment";
    const stateLabel =
      item.membership_status === "active"
        ? "Your community"
        : item.membership_status === "requested"
          ? "Awaiting host"
          : item.membership_status === "invited"
            ? "Invitation"
            : awaitingPayment
              ? "Host approved"
              : item.community_type === "private"
                ? "Host reviewed"
                : "Open to members";

    return (
      <article
        className={`community-directory-card is-${context}`}
        key={item.community_id}
      >
        <header>
          <span className="community-directory-state">{stateLabel}</span>
          <span className="community-directory-members">
            {item.member_count} member
            {Number(item.member_count) === 1 ? "" : "s"}
          </span>
        </header>
        <div className="community-directory-title">
          <div>
            <small>{item.community_type} community</small>
            <h3>{item.name}</h3>
          </div>
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
                <strong>Complete your access</strong>
                <small>Your place remains approved while you pay.</small>
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
  }

  return (
    <>
      <section className="community-directory" id="your-communities">
        <header className="community-directory-heading">
          <div>
            <p className="eyebrow">Your rooms</p>
            <h2>Continue where you belong.</h2>
          </div>
          <span>
            {memberCommunities.length} communit
            {memberCommunities.length === 1 ? "y" : "ies"}
          </span>
        </header>
        {memberCommunities.length ? (
          <div className="community-member-rooms">
            {memberCommunities.map((item) =>
              renderCommunityCard(item, "member"),
            )}
          </div>
        ) : (
          <div className="community-directory-empty">
            <span aria-hidden="true">H</span>
            <div>
              <strong>Your first community is waiting.</strong>
              <p>
                Explore trusted rooms below. Private communities ask the host
                to review every request.
              </p>
            </div>
            <a className="button button-outline" href="#discover-communities">
              Explore communities
            </a>
          </div>
        )}
      </section>

      <section className="community-directory" id="discover-communities">
        <header className="community-directory-heading is-discovery">
          <div>
            <p className="eyebrow">Discover</p>
            <h2>Find a room with purpose.</h2>
          </div>
          {discoverCommunities.length > 3 ? (
            <label className="community-directory-search">
              <span>Search communities</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or purpose"
                type="search"
                value={query}
              />
            </label>
          ) : (
            <span>
              {discoverCommunities.length} available
            </span>
          )}
        </header>
        {visibleDiscover.length ? (
          <div className="community-discovery-grid">
            {visibleDiscover.map((item) =>
              renderCommunityCard(item, "discover"),
            )}
          </div>
        ) : (
          <div className="community-directory-empty is-search">
            <div>
              <strong>
                {cleanQuery
                  ? "No communities match that search."
                  : "No additional communities are open yet."}
              </strong>
              <p>
                {cleanQuery
                  ? "Try a broader word or clear the search."
                  : "New rooms appear only after host and safety review."}
              </p>
            </div>
            {cleanQuery ? (
              <button
                className="button button-outline"
                onClick={() => setQuery("")}
              >
                Clear search
              </button>
            ) : null}
          </div>
        )}
      </section>
      {message ? (
        <p className="network-message" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
