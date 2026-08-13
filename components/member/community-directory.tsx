"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunitySummary = {
  community_id: string;
  slug: string;
  name: string;
  description: string;
  community_type: "official" | "private";
  admission_mode?: "open" | "approval";
  effective_mode?: "open" | "approval";
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
  tagline?: string | null;
  accent_key?: "wine" | "gold" | "forest" | "ocean" | "terracotta";
  icon_url?: string | null;
  icon_alt_text?: string | null;
  last_caught_up_at?: string | null;
  latest_activity_at?: string | null;
  new_activity_count?: number;
  new_conversation_count?: number;
  new_reply_count?: number;
  public_preview_enabled?: boolean;
};

export type CommunityActivitySummary = {
  community_id: string;
  last_caught_up_at: string | null;
  latest_activity_at: string | null;
  new_activity_count: number;
  new_conversation_count: number;
  new_reply_count: number;
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
  const { ask, dialog } = useActionDialog();
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
            ? "Invitation accepted. Pay to finish joining this community."
            : "Invitation accepted. You can now open the community."
          : item.effective_mode === "approval" || item.community_type === "private"
          ? "Your request has been sent to the community leader."
          : item.offer_access_type === "paid"
            ? "Your request was approved. Pay to finish joining."
            : "You have joined the community.",
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
        : "Payment details received. Our team will check them before opening access.",
    );
    if (!error) router.refresh();
  }

  async function changeMembership(
    item: CommunitySummary,
    action: "cancel_request" | "decline_invitation" | "leave",
  ) {
    const leaving = action === "leave";
    const confirmed = await ask({
      title: leaving
        ? `Leave ${item.name}?`
        : action === "decline_invitation"
          ? `Decline the invitation to ${item.name}?`
          : `Cancel your request to ${item.name}?`,
      description: leaving
        ? "You will lose access immediately. Contributions you already shared remain in their conversations. Leaving does not automatically create a payment refund, and you may ask to rejoin later."
        : "You can ask to join again later if the community is still accepting members.",
      confirmLabel: leaving
        ? "Leave community"
        : action === "decline_invitation"
          ? "Decline invitation"
          : "Cancel request",
      tone: leaving ? "danger" : "default",
    });
    if (!confirmed) return;
    setBusy(`${action}-${item.community_id}`);
    setMessage("");
    const { error } = await supabase.rpc("manage_my_community_membership", {
      p_action: action,
      p_community_id: item.community_id,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "update your community membership")
        : leaving
          ? `You have left ${item.name}. Your earlier contributions remain in their conversations.`
          : action === "decline_invitation"
            ? "Invitation declined. You can ask to join later."
            : "Request cancelled. You can ask to join later.",
    );
    if (!error) router.refresh();
  }

  const memberStates = [
    "active",
    "requested",
    "invited",
    "approved_pending_payment",
    "paused",
    "suspended",
  ];
  const memberCommunities = communities
    .filter((item) => memberStates.includes(item.membership_status ?? ""))
    .sort((left, right) => {
      const statePriority = (item: CommunitySummary) => {
        if (item.membership_status === "invited") return 0;
        if (item.membership_status === "approved_pending_payment") return 1;
        if (item.membership_status === "active" && item.new_activity_count)
          return 2;
        if (item.membership_status === "active") return 3;
        return 4;
      };
      const priority = statePriority(left) - statePriority(right);
      if (priority) return priority;
      const activity =
        Number(right.new_activity_count ?? 0) -
        Number(left.new_activity_count ?? 0);
      if (activity) return activity;
      return left.name.localeCompare(right.name);
    });
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
    const newActivity = Number(item.new_activity_count ?? 0);
    const awaitingPayment =
      item.membership_status === "approved_pending_payment";
    const stateLabel =
      item.membership_status === "active"
        ? "Member"
        : item.membership_status === "requested"
          ? "Request sent"
          : item.membership_status === "invited"
            ? "You’re invited"
            : awaitingPayment
              ? "Ready for payment"
              : ["paused", "suspended"].includes(item.membership_status ?? "")
                ? "Temporarily paused"
              : item.effective_mode === "approval" || item.community_type === "private"
                ? "Request to join"
                : "Join now";

    return (
      <article
        className={`community-directory-card is-${context}${newActivity ? " has-new-activity" : ""} accent-${item.accent_key ?? "wine"}`}
        id={`community-${item.slug}`}
        key={item.community_id}
      >
        <header>
          <div className="community-directory-state-group">
            <span className="community-directory-state">{stateLabel}</span>
            {item.membership_status === "active" && newActivity ? (
              <span className="community-directory-activity-badge">
                {newActivity} new update{newActivity === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <span className="community-directory-members">
            {item.member_count} member
            {Number(item.member_count) === 1 ? "" : "s"}
          </span>
        </header>
        <div className="community-directory-title">
          <div className="community-directory-identity">
            {item.icon_url ? (
              <img
                alt={item.icon_alt_text ?? ""}
                className="community-directory-icon"
                src={item.icon_url}
              />
            ) : (
              <span className="community-directory-icon is-placeholder" aria-hidden="true">
                {item.name.slice(0, 1)}
              </span>
            )}
            <div>
              <small>
                {item.community_type === "private"
                  ? "Private · Invitation or approval"
                  : item.effective_mode === "approval"
                    ? "Visible to members · Leader approves requests"
                    : "Visible to members · Join now"}
              </small>
              <h3>{item.name}</h3>
            </div>
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
        <p>{item.tagline || item.description}</p>
        {context === "discover" && item.public_preview_enabled ? (
          <Link
            className="community-directory-about-link"
            href={`/communities/${item.slug}/about`}
          >
            See who it is for and what members receive →
          </Link>
        ) : null}
        <footer>
          {item.membership_status === "active" ? (
            <div className="community-membership-actions">
              <Link
                aria-label={
                  newActivity
                    ? `Continue to ${item.name}, ${newActivity} new update${newActivity === 1 ? "" : "s"}`
                    : `Enter ${item.name}`
                }
                className="button button-primary"
                href={`/communities/${item.slug}`}
              >
                {newActivity ? "See new updates" : "Open community"}
              </Link>
              {item.membership_role === "member" ? (
                <button
                  className="community-membership-secondary"
                  disabled={busy === `leave-${item.community_id}`}
                  onClick={() => void changeMembership(item, "leave")}
                  type="button"
                >
                  Leave community
                </button>
              ) : null}
            </div>
          ) : item.membership_status === "requested" ? (
            <div className="community-membership-actions">
              <span className="community-membership-state">
                <strong>Waiting for approval</strong>
                <small>The community leader will review your request.</small>
              </span>
              <button
                className="community-membership-secondary"
                disabled={busy === `cancel_request-${item.community_id}`}
                onClick={() => void changeMembership(item, "cancel_request")}
                type="button"
              >
                Cancel request
              </button>
            </div>
          ) : awaitingPayment ? (
            <div className="community-checkout">
              <div>
                <strong>One last step</strong>
                <small>Pay to open your approved membership.</small>
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
                    Payment code or reference
                    <input
                      maxLength={120}
                      minLength={3}
                      name="reference"
                      placeholder="e.g. M-PESA code"
                      required
                    />
                  </label>
                  <label>
                    Anything we should know?
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
                      : "Send payment for review"}
                  </button>
                </form>
              ) : (
                <span className="community-membership-state">
                  <strong>Payment is not open yet</strong>
                  <small>Your approved place is reserved.</small>
                </span>
              )}
              <button
                className="community-membership-secondary"
                disabled={busy === `cancel_request-${item.community_id}`}
                onClick={() => void changeMembership(item, "cancel_request")}
                type="button"
              >
                Cancel joining
              </button>
            </div>
          ) : ["paused", "suspended"].includes(item.membership_status ?? "") ? (
            <span className="community-membership-state">
              <strong>This community is temporarily paused</strong>
              <small>
                Your membership and earlier contributions are preserved. We
                will notify you when access resumes.
              </small>
            </span>
          ) : item.membership_status === "invited" ? (
            <div className="community-membership-actions">
              <button
                className="button button-outline"
                disabled={busy === item.community_id}
                onClick={() => void join(item)}
                type="button"
              >
                Accept invitation
              </button>
              <button
                className="community-membership-secondary"
                disabled={busy === `decline_invitation-${item.community_id}`}
                onClick={() =>
                  void changeMembership(item, "decline_invitation")
                }
                type="button"
              >
                Decline
              </button>
            </div>
          ) : (
            <button
              className="button button-outline"
              disabled={busy === item.community_id}
              onClick={() => void join(item)}
            >
              {item.membership_status === "invited"
                ? "Accept invitation"
                : item.effective_mode === "approval" || item.community_type === "private"
                  ? "Ask to join"
                  : paid
                    ? "Join community"
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
            <p className="eyebrow">Your communities</p>
            <h2>Pick up where you left off.</h2>
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
              <strong>Find your first community.</strong>
              <p>
                Browse the groups below. A private community will ask its
                leader to approve your request.
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
            <p className="eyebrow">Find a community</p>
            <h2>Choose a purpose you share.</h2>
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
                  : "No new communities are open yet."}
              </strong>
              <p>
                {cleanQuery
                  ? "Try a broader word or clear the search."
                  : "New communities appear after their leader and safety setup are approved."}
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
      {dialog}
    </>
  );
}
