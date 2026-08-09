"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";

export type MembershipApplication = {
  city: string;
  country: string;
  display_name: string;
  professional_focus: string;
  reason: string;
  referral_source: string;
  referred_by: string | null;
  status: "approved" | "declined" | "in_review" | "submitted" | "withdrawn";
  submitted_at: string;
};

const STEPS = ["About you", "Your purpose", "Review"];

export function MembershipApplicationForm({
  email,
  initial,
}: {
  email: string;
  initial: MembershipApplication | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(0);
  const [submitted, setSubmitted] = useState(
    initial?.status === "submitted" || initial?.status === "in_review",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [values, setValues] = useState({
    city: initial?.city ?? "",
    country: initial?.country ?? "Kenya",
    displayName: initial?.display_name ?? "",
    professionalFocus: initial?.professional_focus ?? "",
    reason: initial?.reason ?? "",
    referralSource: initial?.referral_source ?? "",
    referredBy: initial?.referred_by ?? "",
    acknowledged: false,
  });

  function update(key: keyof typeof values, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
    setMessage("");
  }

  function continueForward() {
    if (
      step === 0 &&
      (!values.displayName.trim() || !values.city.trim() || !values.country.trim())
    ) {
      setMessage("Add your name, city and country before continuing.");
      return;
    }
    if (
      step === 1 &&
      (!values.professionalFocus.trim() ||
        values.reason.trim().length < 20 ||
        !values.referralSource.trim())
    ) {
      setMessage(
        "Tell us about your current focus, what brings you here and how you heard about us.",
      );
      return;
    }
    setMessage("");
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values.acknowledged) {
      setMessage("Please confirm the membership expectations before submitting.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("submit_membership_application", {
      p_acknowledged: values.acknowledged,
      p_city: values.city.trim(),
      p_country: values.country.trim(),
      p_display_name: values.displayName.trim(),
      p_professional_focus: values.professionalFocus.trim(),
      p_reason: values.reason.trim(),
      p_referral_source: values.referralSource.trim(),
      p_referred_by: values.referredBy.trim() || null,
    });
    setBusy(false);
    if (error) {
      setMessage(memberErrorMessage(error, "submit your membership request"));
      return;
    }
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (submitted) {
    return (
      <section className="membership-application-complete" aria-live="polite">
        <span className="application-complete-mark" aria-hidden="true">✓</span>
        <p className="eyebrow">Request received</p>
        <h1>Thank you, {values.displayName.split(/\s+/)[0] || "your seat is being prepared"}.</h1>
        <p>
          Our team will review your request thoughtfully. You can still explore
          upcoming gatherings while you wait, and we will place an update in
          your account when a decision is made.
        </p>
        <div className="application-next-steps">
          <div><span>1</span><p><strong>Team review</strong><small>Your request remains private.</small></p></div>
          <div><span>2</span><p><strong>Complete your profile</strong><small>This opens after approval.</small></p></div>
          <div><span>3</span><p><strong>Enter the table</strong><small>Meet members and join Communities.</small></p></div>
        </div>
        <div className="portal-actions">
          <Link className="button button-primary" href="/home">View my status</Link>
          <Link className="button button-outline" href="/events">Explore events</Link>
        </div>
      </section>
    );
  }

  return (
    <form className="membership-application-form" onSubmit={submit} noValidate>
      <header className="application-form-header">
        <div>
          <p className="eyebrow">Request membership</p>
          <h1>A little about you.</h1>
          <p>
            This helps us welcome people with care. Your answers are reviewed
            privately by the Her Africa Table team.
          </p>
        </div>
        <span>{step + 1} of {STEPS.length}</span>
      </header>

      <div className="application-progress" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((label, index) => (
          <span className={index <= step ? "active" : ""} key={label}>
            <i />{label}
          </span>
        ))}
      </div>

      {step === 0 ? (
        <section className="application-step" aria-labelledby="application-about-title">
          <div className="application-step-heading">
            <span>01</span>
            <div><h2 id="application-about-title">Where should we begin?</h2><p>The essentials only. You can add more to your profile later.</p></div>
          </div>
          <div className="form-grid">
            <label className="form-wide">Full name
              <input autoComplete="name" maxLength={120} onChange={(event) => update("displayName", event.target.value)} placeholder="The name you would like members to see" required value={values.displayName}/>
            </label>
            <label>City
              <input autoComplete="address-level2" maxLength={120} onChange={(event) => update("city", event.target.value)} placeholder="Nairobi" required value={values.city}/>
            </label>
            <label>Country
              <input autoComplete="country-name" maxLength={120} onChange={(event) => update("country", event.target.value)} placeholder="Kenya" required value={values.country}/>
            </label>
            <label className="form-wide">Email address
              <input disabled value={email}/><small>Verified with your one-time code.</small>
            </label>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="application-step" aria-labelledby="application-purpose-title">
          <div className="application-step-heading">
            <span>02</span>
            <div><h2 id="application-purpose-title">What brings you to the table?</h2><p>There is no perfect answer. A few honest sentences are enough.</p></div>
          </div>
          <div className="form-grid">
            <label className="form-wide">What are you working on or focused on right now?
              <input maxLength={180} onChange={(event) => update("professionalFocus", event.target.value)} placeholder="For example: growing a design studio, leadership, returning to work" required value={values.professionalFocus}/>
            </label>
            <label className="form-wide">What would make Her Africa Table meaningful for you?
              <textarea maxLength={1200} minLength={20} onChange={(event) => update("reason", event.target.value)} placeholder="Tell us what you hope to learn, share or build with other women." required rows={5} value={values.reason}/>
              <small>{values.reason.length}/1200 characters</small>
            </label>
            <label>How did you hear about us?
              <select onChange={(event) => update("referralSource", event.target.value)} required value={values.referralSource}>
                <option value="">Choose one</option>
                <option value="Member invitation">A member invited me</option>
                <option value="Event">At an event</option>
                <option value="Instagram or social media">Instagram or social media</option>
                <option value="Partner organisation">A partner organisation</option>
                <option value="Web search">Online search</option>
                <option value="Other">Somewhere else</option>
              </select>
            </label>
            <label>Who introduced you? <small>Optional</small>
              <input maxLength={180} onChange={(event) => update("referredBy", event.target.value)} placeholder="Name or organisation" value={values.referredBy}/>
            </label>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="application-step" aria-labelledby="application-review-title">
          <div className="application-step-heading">
            <span>03</span>
            <div><h2 id="application-review-title">Does this feel like you?</h2><p>Review your answers before sending them to our membership team.</p></div>
          </div>
          <dl className="application-review">
            <div><dt>Name</dt><dd>{values.displayName}</dd></div>
            <div><dt>Based in</dt><dd>{values.city}, {values.country}</dd></div>
            <div><dt>Current focus</dt><dd>{values.professionalFocus}</dd></div>
            <div className="wide"><dt>What brings you here</dt><dd>{values.reason}</dd></div>
            <div><dt>Introduced through</dt><dd>{values.referralSource}</dd></div>
            {values.referredBy ? <div><dt>Introduced by</dt><dd>{values.referredBy}</dd></div> : null}
          </dl>
          <label className="application-agreement">
            <input checked={values.acknowledged} onChange={(event) => update("acknowledged", event.target.checked)} type="checkbox"/>
            <span>I understand that Her Africa Table is a trusted, approval-based space. I will respect its <Link href="/community-guidelines" target="_blank">Community Guidelines</Link> and <Link href="/privacy" target="_blank">Privacy Notice</Link>.</span>
          </label>
        </section>
      ) : null}

      {message ? <p className="manager-message" role="alert">{message}</p> : null}
      <footer className="application-form-actions">
        {step > 0 ? <button className="button button-outline" disabled={busy} onClick={() => { setStep((current) => current - 1); setMessage(""); }} type="button">Back</button> : <Link className="button button-outline" href="/">Not now</Link>}
        {step < STEPS.length - 1 ? <button className="button button-primary" onClick={continueForward} type="button">Continue</button> : <button className="button button-primary" disabled={busy || !values.acknowledged} type="submit">{busy ? "Sending…" : "Send my request"}</button>}
      </footer>
    </form>
  );
}
