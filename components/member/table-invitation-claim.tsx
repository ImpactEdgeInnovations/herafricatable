"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";

export function TableInvitationClaim({
  destinationHref,
  signedIn,
  token,
}: {
  destinationHref: string;
  signedIn: boolean;
  token: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [nextHref, setNextHref] = useState("");

  if (!signedIn) {
    return (
      <Link
        className="button button-primary"
        href={`/sign-in?next=${encodeURIComponent(`/join/${token}`)}`}
      >
        Sign in or request membership
      </Link>
    );
  }

  async function claim() {
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.rpc("claim_table_invitation", {
      p_token: token,
    });
    setBusy(false);
    if (error) {
      setMessage(memberErrorMessage(error, "accept this invitation"));
      return;
    }
    const result = (data as { claim_status: string; destination_href: string }[] | null)?.[0];
    if (!result) {
      setMessage("This invitation could not be opened. Ask the sender to check it.");
      return;
    }
    setNextHref(result.destination_href || destinationHref);
    setMessage(
      result.claim_status === "membership_pending"
        ? "Your invitation is saved. Complete the short membership request and we will continue it after approval."
        : result.claim_status === "event_ready"
          ? "Invitation accepted. Choose your ticket or request your seat on the event page."
          : "Invitation accepted. Your Community access or Host request is ready.",
    );
  }

  return (
    <div className="table-invitation-claim">
      {nextHref ? (
        <Link className="button button-primary" href={nextHref}>
          Continue
        </Link>
      ) : (
        <button className="button button-primary" disabled={busy} onClick={() => void claim()}>
          {busy ? "Opening…" : "Accept invitation"}
        </button>
      )}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
