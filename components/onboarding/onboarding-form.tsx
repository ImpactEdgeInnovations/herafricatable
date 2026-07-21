"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InitialProfile = {
  bio: string | null;
  company: string | null;
  country: string | null;
  display_name: string | null;
  industry: string | null;
  job_title: string | null;
};

const INDUSTRIES = [
  "Agriculture", "Creative industries", "Education", "Energy", "Finance",
  "Government & public service", "Healthcare", "Hospitality", "Legal",
  "Media", "Nonprofit & development", "Professional services", "Real estate",
  "Retail", "Technology", "Other",
];

export function OnboardingForm({ email, initialProfile }: { email: string; initialProfile: InitialProfile }) {
  const [form, setForm] = useState({
    displayName: initialProfile.display_name ?? "",
    jobTitle: initialProfile.job_title ?? "",
    company: initialProfile.company ?? "",
    industry: initialProfile.industry ?? "",
    country: initialProfile.country ?? "Kenya",
    bio: initialProfile.bio ?? "",
    phone: "",
    linkedinUrl: "",
    instagramUrl: "",
    interests: "",
  });
  const [agreements, setAgreements] = useState({ terms: false, privacy: false, guidelines: false });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("complete_member_onboarding", {
      p_display_name: form.displayName,
      p_job_title: form.jobTitle,
      p_company: form.company,
      p_industry: form.industry,
      p_country: form.country,
      p_bio: form.bio,
      p_phone: form.phone,
      p_linkedin_url: form.linkedinUrl,
      p_instagram_url: form.instagramUrl,
      p_interests: form.interests.split(",").map((value) => value.trim()).filter(Boolean),
      p_accept_terms: agreements.terms,
      p_accept_privacy: agreements.privacy,
      p_accept_guidelines: agreements.guidelines,
    });

    if (error) {
      setMessage(error.message.includes("schema cache")
        ? "The onboarding database migration has not been applied yet."
        : error.message);
      setSaving(false);
      return;
    }

    window.location.assign("/home");
  }

  return (
    <form className="onboarding-form" onSubmit={submit}>
      <div className="form-section-heading">
        <span>01</span>
        <div><h2>Your professional profile</h2><p>This information helps members understand who you are and how to connect meaningfully.</p></div>
      </div>
      <div className="form-grid">
        <label>Full name<input value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} autoComplete="name" required /></label>
        <label>Email address<input value={email} readOnly disabled /></label>
        <label>Role or title<input value={form.jobTitle} onChange={(event) => updateField("jobTitle", event.target.value)} placeholder="Founder, Director, Consultant…" required /></label>
        <label>Company or organisation<input value={form.company} onChange={(event) => updateField("company", event.target.value)} /></label>
        <label>Industry<select value={form.industry} onChange={(event) => updateField("industry", event.target.value)} required><option value="">Select your industry</option>{INDUSTRIES.map((industry) => <option key={industry}>{industry}</option>)}</select></label>
        <label>Country<input value={form.country} onChange={(event) => updateField("country", event.target.value)} autoComplete="country-name" required /></label>
        <label className="form-wide">Short professional bio<textarea value={form.bio} onChange={(event) => updateField("bio", event.target.value)} maxLength={1600} rows={5} placeholder="Share what you do, the work you care about, and the connections you hope to make." /><small>{form.bio.length}/1600 characters</small></label>
        <label className="form-wide">Interests <span>(comma separated)</span><input value={form.interests} onChange={(event) => updateField("interests", event.target.value)} placeholder="Leadership, investment, technology, public policy" /></label>
      </div>

      <div className="form-section-heading">
        <span>02</span>
        <div><h2>Private contact details</h2><p>Stored separately from your public directory profile. Connection-based sharing will be added later.</p></div>
      </div>
      <div className="form-grid">
        <label>Phone number<input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} autoComplete="tel" placeholder="+254…" /></label>
        <label>LinkedIn profile<input type="url" value={form.linkedinUrl} onChange={(event) => updateField("linkedinUrl", event.target.value)} placeholder="https://linkedin.com/in/…" /></label>
        <label>Instagram profile<input type="url" value={form.instagramUrl} onChange={(event) => updateField("instagramUrl", event.target.value)} placeholder="https://instagram.com/…" /></label>
      </div>

      <div className="form-section-heading">
        <span>03</span>
        <div><h2>Trust at the table</h2><p>These agreements are required to protect the quality and safety of the network.</p></div>
      </div>
      <div className="agreement-list">
        <label><input type="checkbox" checked={agreements.terms} onChange={(event) => setAgreements((value) => ({ ...value, terms: event.target.checked }))} required /><span>I accept the <Link href="/terms" target="_blank">Terms</Link>.</span></label>
        <label><input type="checkbox" checked={agreements.privacy} onChange={(event) => setAgreements((value) => ({ ...value, privacy: event.target.checked }))} required /><span>I have read the <Link href="/privacy" target="_blank">Privacy Notice</Link>.</span></label>
        <label><input type="checkbox" checked={agreements.guidelines} onChange={(event) => setAgreements((value) => ({ ...value, guidelines: event.target.checked }))} required /><span>I agree to the <Link href="/community-guidelines" target="_blank">Community Guidelines</Link>.</span></label>
      </div>

      {message ? <p className="auth-message error" role="alert">{message}</p> : null}
      <div className="onboarding-actions">
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving your profile…" : "Complete profile"}</button>
        <p>Your profile becomes active immediately after successful completion.</p>
      </div>
    </form>
  );
}
