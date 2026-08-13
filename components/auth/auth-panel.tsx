"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type AuthIntent = "member" | "admin";
type Step = "request" | "verify";

const destinationFor = (intent: AuthIntent) => intent === "admin" ? "/admin" : "/continue";

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

export function AuthPanel({
  destination: requestedDestination,
  intent,
}: {
  destination?: string;
  intent: AuthIntent;
}) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [step, setStep] = useState<Step>("request");
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const destination =
    requestedDestination?.startsWith("/") &&
    !requestedDestination.startsWith("//")
      ? requestedDestination
      : destinationFor(intent);
  const isAdmin = intent === "admin";

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function sendCode() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: !isAdmin,
      },
    });
    if (error) throw error;
    setStep("verify");
    setResendIn(30);
    setMessage({
      kind: "success",
      text: "Your sign-in code is on its way. Check your inbox and spam folder. It can only be used once.",
    });
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await sendCode();
    } catch (error) {
      setMessage({ kind: "error", text: safeMessage(error instanceof Error ? error.message : "Unknown error") });
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (busy || resendIn > 0) return;
    setBusy(true);
    setToken("");
    setMessage(null);
    try {
      await sendCode();
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
      <p className="auth-kicker">{isAdmin ? "Approved team only" : "Membership"}</p>
      <h2>{isAdmin ? "Admin sign in" : step === "verify" ? "Check your email" : "Welcome"}</h2>
      <p className="auth-description">
        {isAdmin
          ? <>Enter an approved team email. We will send a private sign-in code, then confirm your Admin access.</>
          : step === "verify"
            ? <>We sent a sign-in code to <strong>{email}</strong>. Enter it below to continue.</>
            : <>Enter your email and we will send a one-time code. Members go to their home, approved team accounts go to their workspace, and new visitors can request membership.</>}
      </p>

      {!isAdmin && step === "request" ? (
        <ol className="auth-journey" aria-label="How membership works">
          <li><span>1</span><div><strong>Confirm your email</strong><small>We send a private sign-in code.</small></div></li>
          <li><span>2</span><div><strong>Tell us about you</strong><small>A short membership request.</small></div></li>
          <li><span>3</span><div><strong>Private review</strong><small>We email you when your seat is ready.</small></div></li>
        </ol>
      ) : null}

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
            {busy ? "Sending…" : "Send my sign-in code"}
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={verifyCode}>
          <label htmlFor={`${intent}-token`}>Your sign-in code</label>
          <input
            id={`${intent}-token`}
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6,8}"
            minLength={6}
            maxLength={8}
            placeholder="Enter the code"
            value={token}
            onChange={(event) => setToken(event.target.value.replace(/\D/g, ""))}
            required
          />
          <button className="button button-primary" type="submit" disabled={busy || token.length < 6 || token.length > 8}>
            {busy ? "Verifying…" : "Verify and continue"}
          </button>
          <div className="auth-secondary-actions">
            <button className="auth-text-button" type="button" onClick={resendCode} disabled={busy || resendIn > 0}>
              {resendIn > 0 ? `Send another code in ${resendIn}s` : "Send another code"}
            </button>
            <button className="auth-text-button" type="button" onClick={() => { setStep("request"); setToken(""); setMessage(null); setResendIn(0); }} disabled={busy}>
              Change email
            </button>
          </div>
        </form>
      )}

      {message && <p className={`auth-message ${message.kind}`} role="status">{message.text}</p>}

      <p className="auth-help">
        By continuing, you agree to our Terms, Privacy Notice, and Community
        Guidelines. Need help? <a href="mailto:support@herafricatable.com">Contact us</a>.
      </p>
      <p className="intent-switch">
        {isAdmin ? <>Not signing in for the team? <Link href="/sign-in">Use the main sign-in</Link></> : <>This is the only sign-in most people need. We will take you to the right place automatically.</>}
      </p>
    </div>
  );
}
