"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setBusy(true);
    setFailed(false);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      setFailed(true);
      setBusy(false);
      return;
    }
    window.location.replace("/");
  }

  return (
    <span className={`session-sign-out-wrap ${className}`.trim()}>
      <button
        aria-label={busy ? "Signing out" : "Sign out"}
        className="session-sign-out"
        disabled={busy}
        onClick={signOut}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
        </svg>
        <span>{busy ? "Signing out…" : "Sign out"}</span>
      </button>
      {failed ? <small role="alert">Could not sign out. Please try again.</small> : null}
    </span>
  );
}
