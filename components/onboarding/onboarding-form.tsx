"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type InitialOnboarding = {
  avatar_path: string | null;
  avatar_url: string | null;
  bio: string | null;
  business_name: string | null;
  city: string | null;
  company: string | null;
  country: string | null;
  display_name: string | null;
  industry: string | null;
  instagram_url: string | null;
  interests: string[];
  job_title: string | null;
  languages: string[];
  linkedin_url: string | null;
  goals: string[];
  phone: string | null;
  profile_completion: number;
  referral_source: string | null;
  share_phone_with_connections: boolean;
  website_url: string | null;
  whatsapp_number: string | null;
};

const INDUSTRIES = [
  "Agriculture", "Creative industries", "Education", "Energy", "Finance",
  "Government & public service", "Healthcare", "Hospitality", "Legal",
  "Media", "Nonprofit & development", "Professional services", "Real estate",
  "Retail", "Technology", "Other",
];

const GOALS = [
  ["make_friends", "Make meaningful friendships"],
  ["build_business", "Build my business"],
  ["find_clients", "Find clients or collaborators"],
  ["travel", "Connect through travel"],
  ["learn", "Learn and grow"],
  ["mentor", "Mentor other women"],
  ["be_mentored", "Find a mentor"],
  ["invest", "Invest or find investment"],
  ["shop_african_brands", "Discover African brands"],
] as const;

const STEP_LABELS = ["Profile", "Purpose", "Contact", "Trust"];

export function OnboardingForm({ email, userId, initial }: { email: string; userId: string; initial: InitialOnboarding }) {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState(1);
  const [completion, setCompletion] = useState(initial.profile_completion);
  const [form, setForm] = useState({
    displayName: initial.display_name ?? "",
    jobTitle: initial.job_title ?? "",
    company: initial.company ?? "",
    industry: initial.industry ?? "",
    country: initial.country ?? "Kenya",
    city: initial.city ?? "",
    languages: initial.languages.join(", "),
    bio: initial.bio ?? "",
    businessName: initial.business_name ?? "",
    websiteUrl: initial.website_url ?? "",
    referralSource: initial.referral_source ?? "",
    avatarPath: initial.avatar_path ?? "",
    avatarUrl: initial.avatar_url ?? "",
    phone: initial.phone ?? "",
    whatsappNumber: initial.whatsapp_number ?? "",
    linkedinUrl: initial.linkedin_url ?? "",
    instagramUrl: initial.instagram_url ?? "",
    interests: initial.interests.join(", "),
    goals: initial.goals,
    sharePhone: initial.share_phone_with_connections,
  });
  const [agreements, setAgreements] = useState({ terms: false, privacy: false, guidelines: false });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  function updateField(field: keyof typeof form, value: string | boolean | string[]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function listFrom(value: string) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  function draftPayload() {
    return {
      p_display_name: form.displayName,
      p_job_title: form.jobTitle,
      p_company: form.company,
      p_industry: form.industry,
      p_country: form.country,
      p_city: form.city,
      p_languages: listFrom(form.languages),
      p_bio: form.bio,
      p_business_name: form.businessName,
      p_website_url: form.websiteUrl,
      p_referral_source: form.referralSource,
      p_avatar_path: form.avatarPath,
      p_avatar_url: form.avatarUrl,
      p_phone: form.phone,
      p_whatsapp_number: form.whatsappNumber,
      p_linkedin_url: form.linkedinUrl,
      p_instagram_url: form.instagramUrl,
      p_share_phone: form.sharePhone,
      p_interests: listFrom(form.interests),
      p_goals: form.goals,
    };
  }

  async function saveDraft(showSuccess = true) {
    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase.rpc("save_member_onboarding_draft_v2", draftPayload());
    setSaving(false);
    if (error) {
      setMessage({ kind: "error", text: error.message.includes("schema cache") ? "Apply the onboarding v2 migration in Supabase, then try again." : error.message });
      return false;
    }
    setCompletion(Number(data ?? 0));
    if (showSuccess) setMessage({ kind: "success", text: "Your progress is saved." });
    return true;
  }

  async function continueTo(nextStep: number) {
    const saved = await saveDraft(false);
    if (saved) {
      setStep(nextStep);
      setMessage({ kind: "success", text: "Progress saved. You can return and continue at any time." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage({ kind: "error", text: "Choose a JPG, PNG or WebP image." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ kind: "error", text: "Your profile photo must be 5 MB or smaller." });
      return;
    }

    setUploading(true);
    setMessage(null);
    const path = `${userId}/profile`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (error) {
      setMessage({ kind: "error", text: error.message.includes("Bucket") ? "Apply the onboarding v2 migration before uploading a photo." : error.message });
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const cacheBustedUrl = `${data.publicUrl}?v=${Date.now()}`;
    setForm((current) => ({ ...current, avatarPath: path, avatarUrl: cacheBustedUrl }));
    setMessage({ kind: "success", text: "Photo uploaded. Select Save progress to store it with your profile." });
    setUploading(false);
  }

  function toggleGoal(goal: string) {
    setForm((current) => ({
      ...current,
      goals: current.goals.includes(goal)
        ? current.goals.filter((item) => item !== goal)
        : current.goals.length < 6 ? [...current.goals, goal] : current.goals,
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.rpc("complete_member_onboarding_v2", {
      ...draftPayload(),
      p_accept_terms: agreements.terms,
      p_accept_privacy: agreements.privacy,
      p_accept_guidelines: agreements.guidelines,
    });
    if (error) {
      setMessage({ kind: "error", text: error.message.includes("schema cache") ? "Apply the onboarding v2 migration in Supabase, then try again." : error.message });
      setSaving(false);
      return;
    }
    window.location.assign("/home");
  }

  return (
    <form className="onboarding-form onboarding-wizard" onSubmit={submit}>
      <div className="onboarding-progress" aria-label="Onboarding progress">
        <div><span style={{ width: `${completion}%` }} /></div>
        <strong>{completion}% profile complete</strong>
      </div>
      <ol className="onboarding-steps">{STEP_LABELS.map((label, index) => <li key={label} className={step === index + 1 ? "current" : step > index + 1 ? "complete" : ""}><button type="button" onClick={() => setStep(index + 1)}><span>0{index + 1}</span>{label}</button></li>)}</ol>

      {step === 1 ? <section className="onboarding-step" aria-labelledby="profile-step-title">
        <div className="form-section-heading"><span>01</span><div><h2 id="profile-step-title">Your professional profile</h2><p>Start with the identity members will see in the directory and at events.</p></div></div>
        <div className="avatar-field">
          <div className="avatar-preview">{form.avatarUrl ? <img src={form.avatarUrl} alt="Your profile preview" /> : <span>{form.displayName.slice(0, 1).toUpperCase() || "H"}</span>}</div>
          <label><strong>Profile photo</strong><small>JPG, PNG or WebP · maximum 5 MB</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={uploading} /><span className="button button-outline">{uploading ? "Uploading…" : form.avatarUrl ? "Replace photo" : "Choose photo"}</span></label>
        </div>
        <div className="form-grid">
          <label>Full name<input value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)} autoComplete="name" required /></label>
          <label>Email address<input value={email} readOnly disabled /></label>
          <label>Role or title<input value={form.jobTitle} onChange={(event) => updateField("jobTitle", event.target.value)} placeholder="Founder, Director, Consultant…" required /></label>
          <label>Company or organisation<input value={form.company} onChange={(event) => updateField("company", event.target.value)} /></label>
          <label>Industry<select value={form.industry} onChange={(event) => updateField("industry", event.target.value)} required><option value="">Select your industry</option>{INDUSTRIES.map((industry) => <option key={industry}>{industry}</option>)}</select></label>
          <label>Country<input value={form.country} onChange={(event) => updateField("country", event.target.value)} autoComplete="country-name" required /></label>
          <label>City<input value={form.city} onChange={(event) => updateField("city", event.target.value)} autoComplete="address-level2" required /></label>
          <label>Languages <span>(comma separated)</span><input value={form.languages} onChange={(event) => updateField("languages", event.target.value)} placeholder="English, Kiswahili" required /></label>
          <label className="form-wide">Short professional bio<textarea value={form.bio} onChange={(event) => updateField("bio", event.target.value)} maxLength={1600} rows={5} placeholder="Share what you do, the work you care about, and the connections you hope to make." required /><small>{form.bio.length}/1600 characters</small></label>
        </div>
      </section> : null}

      {step === 2 ? <section className="onboarding-step" aria-labelledby="purpose-step-title">
        <div className="form-section-heading"><span>02</span><div><h2 id="purpose-step-title">What brings you to the table?</h2><p>Your goals are structured signals for useful introductions—not advertising data.</p></div></div>
        <fieldset className="goal-grid"><legend>Select up to six goals</legend>{GOALS.map(([value, label]) => <label key={value} className={form.goals.includes(value) ? "selected" : ""}><input type="checkbox" checked={form.goals.includes(value)} onChange={() => toggleGoal(value)} /><span>{label}</span></label>)}</fieldset>
        <div className="form-grid purpose-fields">
          <label className="form-wide">Professional interests <span>(comma separated)</span><input value={form.interests} onChange={(event) => updateField("interests", event.target.value)} placeholder="Leadership, investment, technology, public policy" required /></label>
          <label>Business name <span>(optional)</span><input value={form.businessName} onChange={(event) => updateField("businessName", event.target.value)} /></label>
          <label>Business or personal website <span>(optional)</span><input type="url" value={form.websiteUrl} onChange={(event) => updateField("websiteUrl", event.target.value)} placeholder="https://…" /></label>
        </div>
      </section> : null}

      {step === 3 ? <section className="onboarding-step" aria-labelledby="contact-step-title">
        <div className="form-section-heading"><span>03</span><div><h2 id="contact-step-title">Private contact details</h2><p>These are stored separately and are not placed in the public directory.</p></div></div>
        <div className="form-grid">
          <label>Phone number<input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} autoComplete="tel" placeholder="+254…" /></label>
          <label>WhatsApp number<input value={form.whatsappNumber} onChange={(event) => updateField("whatsappNumber", event.target.value)} placeholder="+254…" /></label>
          <label>LinkedIn profile<input type="url" value={form.linkedinUrl} onChange={(event) => updateField("linkedinUrl", event.target.value)} placeholder="https://linkedin.com/in/…" /></label>
          <label>Instagram profile<input type="url" value={form.instagramUrl} onChange={(event) => updateField("instagramUrl", event.target.value)} placeholder="https://instagram.com/…" /></label>
          <label className="form-wide">How did you hear about Her Africa Table?<input value={form.referralSource} onChange={(event) => updateField("referralSource", event.target.value)} placeholder="Friend, LinkedIn, event partner, Instagram…" /></label>
        </div>
        <label className="privacy-control"><input type="checkbox" checked={form.sharePhone} onChange={(event) => updateField("sharePhone", event.target.checked)} /><span><strong>Allow accepted connections to see my phone number</strong><small>This preference can be changed later. It never exposes your number publicly.</small></span></label>
      </section> : null}

      {step === 4 ? <section className="onboarding-step" aria-labelledby="trust-step-title">
        <div className="form-section-heading"><span>04</span><div><h2 id="trust-step-title">Trust at the table</h2><p>Review your completion and accept the agreements that protect this network.</p></div></div>
        <div className="profile-review"><strong>{form.displayName || "Your profile"}</strong><span>{[form.jobTitle, form.company, form.city, form.country].filter(Boolean).join(" · ")}</span><p>{form.goals.length} goals · {listFrom(form.interests).length} interests · {listFrom(form.languages).length} languages</p></div>
        <div className="agreement-list">
          <label><input type="checkbox" checked={agreements.terms} onChange={(event) => setAgreements((value) => ({ ...value, terms: event.target.checked }))} required /><span>I accept the <Link href="/terms" target="_blank">Terms</Link>.</span></label>
          <label><input type="checkbox" checked={agreements.privacy} onChange={(event) => setAgreements((value) => ({ ...value, privacy: event.target.checked }))} required /><span>I have read the <Link href="/privacy" target="_blank">Privacy Notice</Link>.</span></label>
          <label><input type="checkbox" checked={agreements.guidelines} onChange={(event) => setAgreements((value) => ({ ...value, guidelines: event.target.checked }))} required /><span>I agree to the <Link href="/community-guidelines" target="_blank">Community Guidelines</Link>.</span></label>
        </div>
      </section> : null}

      {message ? <p className={`auth-message ${message.kind}`} role="status">{message.text}</p> : null}
      <div className="wizard-actions">
        <button className="button button-outline" type="button" onClick={() => saveDraft()} disabled={saving || uploading}>{saving ? "Saving…" : "Save progress"}</button>
        <div>
          {step > 1 ? <button className="button text-button" type="button" onClick={() => setStep((current) => current - 1)} disabled={saving}>Back</button> : null}
          {step < 4 ? <button className="button button-primary" type="button" onClick={() => continueTo(step + 1)} disabled={saving || uploading}>{saving ? "Saving…" : "Save and continue"}</button> : <button className="button button-primary" type="submit" disabled={saving || completion < 100}>{saving ? "Activating…" : completion < 100 ? `Complete profile (${completion}%)` : "Complete profile"}</button>}
        </div>
      </div>
    </form>
  );
}
