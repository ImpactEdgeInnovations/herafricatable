"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthIntent = "member" | "admin";
type Step = "request" | "verify";

const destinationFor = (intent: AuthIntent) => intent === "admin" ? "/admin" : "/home";

function safeMessage(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("rate") || normalized.includes("seconds")) {
    return "Please wait a moment before requesting another code.";
  }
  if (normalized.includes("token") || normalized.includes("expired")) {
    return "That code is invalid or has expired. Request a new code and try again.";
  }
  return "We could not complete that request. Please try again or contact support.";
}

export function AuthPanel({ intent }: { intent: AuthIntent }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<Step>("request");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const destination = destinationFor(intent);
  const isAdmin = intent === "admin";

  async function continueWithGoogle() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback },
      });
      if (error) throw error;
    } catch (error) {
      setBusy(false);
      setMessage({ kind: "error", text: safeMessage(error instanceof Error ? error.message : "Unknown error") });
    }
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
        },
      });
      if (error) throw error;
      setStep("verify");
      setMessage({ kind: "success", text: "Check your email for a six-digit code. You may also receive a secure sign-in link while the beta email template is being finalized." });
    } catch (error) {
      setMessage({ kind: "error", text: safeMessage(error instanceof Error ? error.message : "Unknown error") });
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: token.replace(/\s/g, ""),
        type: "email",
      });
      if (error) throw error;
      window.location.assign(destination);
    } catch (error) {
      setMessage({ kind: "error", text: safeMessage(error instanceof Error ? error.message : "Unknown error") });
      setBusy(false);
    }
  }

  return (
    <div className="auth-panel">
      <Link className="auth-back" href="/">
        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M4 10h11m-4-4 4 4-4 4" /></svg>
        Back to Her Africa Table
      </Link>
      <p className="auth-kicker">{isAdmin ? "Authorized team access" : "Private beta"}</p>
      <h2>{isAdmin ? "Admin sign in" : "Take your seat"}</h2>
      <p className="auth-description">
        {isAdmin
          ? <>Use your approved team email. <strong>Admin access is verified after sign-in.</strong></>
          : <>Continue with Google or use a one-time email code. <strong>No password required.</strong></>}
      </p>

      <button className="button google-button" type="button" onClick={continueWithGoogle} disabled={busy}>
        <span className="google-mark" aria-hidden="true">G</span>
        Continue with Google
      </button>

      <div className="auth-divider"><span>or use email</span></div>

      {step === "request" ? (
        <form className="auth-form" onSubmit={requestCode}>
          <label htmlFor={`${intent}-email`}>Email address</label>
          <input
            id={`${intent}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button className="button button-primary" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Email me a code"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={verifyCode}>
          <label htmlFor={`${intent}-token`}>Six-digit code sent to {email}</label>
          <input
            id={`${intent}-token`}
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="000000"
            value={token}
            onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))}
            required
          />
          <button className="button button-primary" type="submit" disabled={busy || token.length !== 6}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
          <button className="button google-button" type="button" onClick={() => { setStep("request"); setToken(""); setMessage(null); }} disabled={busy}>
            Use a different email
          </button>
        </form>
      )}

      {message && <p className={`auth-message ${message.kind}`} role="status">{message.text}</p>}

      <p className="auth-help">
        By continuing, you agree to the beta Terms, Privacy Notice, and Community
        Guidelines. Need help? <a href="mailto:support@herafricatable.com">Contact support</a>.
      </p>
      <p className="intent-switch">
        {isAdmin ? <>Not a team administrator? <Link href="/sign-in">Member sign in</Link></> : <>Working on the Her Africa Table team? <Link href="/admin/sign-in">Admin sign in</Link></>}
      </p>
    </div>
  );
}
