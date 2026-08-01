"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export function CommunityAboutAction({
  accessType,
  activeMember,
  commerceEnabled,
  communityId,
  communityType,
  membershipStatus,
  paymentMode,
  slug,
  signedIn,
}: {
  accessType: string | null;
  activeMember: boolean;
  commerceEnabled: boolean;
  communityId: string;
  communityType: string;
  membershipStatus: string | null;
  paymentMode: string | null;
  slug: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function join() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("request_community_access", {
      p_community_id: communityId,
    });
    setBusy(false);
    if (error) {
      setMessage(memberErrorMessage(error, "request Community access"));
      return;
    }
    if (communityType === "official" && accessType !== "paid") {
      router.push(`/communities/${slug}`);
      return;
    }
    setMessage(
      communityType === "private"
        ? "Your request is with the Community host. We’ll update you in Activity."
        : "Your place is ready. Open Community to complete payment.",
    );
    router.refresh();
  }

  if (!signedIn) {
    return (
      <div className="community-about-action">
        <Link
          className="button button-primary"
          href={`/sign-in?next=${encodeURIComponent(`/communities/${slug}/about`)}`}
        >
          Sign in to join
        </Link>
        <small>Membership is reviewed inside Her Africa Table.</small>
      </div>
    );
  }

  if (!activeMember) {
    return (
      <div className="community-about-action">
        <Link className="button button-primary" href="/home">
          View your membership status
        </Link>
        <small>Your Her Africa Table membership must be active first.</small>
      </div>
    );
  }

  if (membershipStatus === "active") {
    return (
      <div className="community-about-action">
        <Link className="button button-primary" href={`/communities/${slug}`}>
          Enter Community
        </Link>
        <small>You already belong to this Community.</small>
      </div>
    );
  }

  if (
    ["requested", "invited", "approved_pending_payment"].includes(
      membershipStatus ?? "",
    )
  ) {
    const waiting = membershipStatus === "requested";
    return (
      <div className="community-about-action">
        <Link className="button button-primary" href="/communities">
          {waiting ? "Review your request" : "Continue joining"}
        </Link>
        <small>
          {waiting
            ? "The host will review your request before access opens."
            : "Your next membership step is waiting in Community."}
        </small>
      </div>
    );
  }

  const paidClosed =
    accessType === "paid" && (!commerceEnabled || paymentMode === "closed");
  if (paidClosed) {
    return (
      <div className="community-about-action">
        <span className="community-about-closed">Joining opens soon</span>
        <small>The host has not opened payment for new members yet.</small>
      </div>
    );
  }

  return (
    <div className="community-about-action">
      <button
        className="button button-primary"
        disabled={busy}
        onClick={() => void join()}
      >
        {busy
          ? "Sending…"
          : communityType === "private"
            ? "Request to join"
            : accessType === "paid"
              ? "Join and continue to payment"
              : "Join Community"}
      </button>
      <small>
        {communityType === "private"
          ? "The host reviews every request."
          : accessType === "paid"
            ? "You’ll review the price before secure payment."
            : "Access opens immediately for active members."}
      </small>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
