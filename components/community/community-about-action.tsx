"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export function CommunityAboutAction({
  accessType,
  activeMember,
  commerceEnabled,
  communityId,
  joiningMode,
  membershipStatus,
  paymentMode,
  slug,
  signedIn,
}: {
  accessType: string | null;
  activeMember: boolean;
  commerceEnabled: boolean;
  communityId: string;
  joiningMode: "open" | "approval" | "invite_only";
  membershipStatus: string | null;
  paymentMode: string | null;
  slug: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const joining = useRef(false);
  const {ask,clearDraft,dialog} = useActionDialog({retainDrafts: true});

  async function join() {
    if (busy || joining.current) return;
    joining.current = true;
    setBusy(true);
    setMessage("");
    try {
      const draftKey = `community-join:${communityId}`;
      let note: string | null = null;
      if (joiningMode === "approval") {
        const answer = await ask({draftKey,title:"Ask to join this Community",description:"Your message is private to you and the people reviewing your request. You can leave it blank.",confirmLabel:"Send request",fields:[{name:"message",label:"Message to the Host (optional)",type:"textarea",maxLength:500,placeholder:"Tell the Host why you’d like to join, or mention someone you know."}]});
        if (!answer) return;
        note = String(answer.message ?? "").trim() || null;
      }
      const {data,error} = await supabase.rpc("join_community_with_message", {p_community_id:communityId,p_message:note});
      if (error) throw error;
      clearDraft(draftKey);
      if (data === "active") { router.push(`/communities/${slug}`); return; }
      setMessage(data === "waitlisted" ? "This Community is full. You are on the waiting list; no place is reserved. The Host has been notified." : data === "requested" ? "Your request has been sent to the Host. We’ll let you know under Updates." : "Your place is ready. Open Community to complete payment.");
      router.refresh();
    } catch (error) {
      setMessage(memberErrorMessage(error, "request Community access"));
    } finally {
      joining.current = false; setBusy(false);
    }
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
  if (joiningMode === "invite_only") {
    return (
      <div className="community-about-action">
        <span className="community-about-closed">Invitation only</span>
        <small>Ask the Community Host for a personal invitation.</small>
      </div>
    );
  }
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
      {dialog}
      <button
        className="button button-primary"
        disabled={busy}
        onClick={() => void join()}
      >
        {busy
          ? "Sending…"
          : joiningMode === "approval"
            ? "Request to join"
            : accessType === "paid"
              ? "Join and continue to payment"
              : "Join Community"}
      </button>
      <small>
        {joiningMode === "approval"
          ? "The host reviews every request."
          : accessType === "paid"
            ? "You’ll review the price before secure payment."
            : "Access opens immediately for active members."}
      </small>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
