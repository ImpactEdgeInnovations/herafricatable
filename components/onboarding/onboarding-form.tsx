"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { memberErrorMessage } from "@/lib/member-error";
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
  "Agriculture",
  "Creative industries",
  "Education",
  "Energy",
  "Finance",
  "Government & public service",
  "Healthcare",
  "Hospitality",
  "Legal",
  "Media",
  "Nonprofit & development",
  "Professional services",
  "Real estate",
  "Retail",
  "Technology",
  "Other",
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

const INTERESTS = [
  "Business growth",
  "Career growth",
  "Climate and sustainability",
  "Community building",
  "Creative work",
  "Investment and finance",
  "Leadership",
  "Mentorship",
  "Public policy",
  "Technology",
  "Trade across Africa",
  "Wellbeing",
] as const;

const LANGUAGES = [
  "English",
  "Kiswahili",
  "French",
  "Arabic",
  "Portuguese",
  "Amharic",
  "Somali",
] as const;

const STEP_LABELS = ["About you", "Your purpose", "Privacy and trust"];

export function OnboardingForm({
  email,
  userId,
  nextHref,
  initial,
}: {
  email: string;
  userId: string;
  nextHref: string | null;
  initial: InitialOnboarding;
}) {
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
    languages: initial.languages,
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
    interests: initial.interests,
    goals: initial.goals,
    sharePhone: initial.share_phone_with_connections,
  });
  const [agreements, setAgreements] = useState({
    terms: false,
    privacy: false,
    guidelines: false,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const missingEssentials = [
    !form.displayName.trim() ? "your name" : null,
    !form.jobTitle.trim() ? "your role or title" : null,
    !form.industry.trim() ? "your industry" : null,
    !form.country.trim() ? "your country" : null,
    !form.city.trim() ? "your city" : null,
    !form.bio.trim() ? "your introduction" : null,
    form.goals.length === 0 ? "at least one goal" : null,
    form.interests.length === 0 ? "at least one interest" : null,
  ].filter(Boolean) as string[];

  function updateField(
    field: keyof typeof form,
    value: string | boolean | string[],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleList(field: "goals" | "interests" | "languages", value: string) {
    setForm((current) => {
      const selected = current[field];
      const limit = field === "goals" ? 6 : field === "interests" ? 8 : 10;
      return {
        ...current,
        [field]: selected.includes(value)
          ? selected.filter((item) => item !== value)
          : selected.length < limit
            ? [...selected, value]
            : selected,
      };
    });
  }

  function draftPayload() {
    return {
      p_display_name: form.displayName,
      p_job_title: form.jobTitle,
      p_company: form.company,
      p_industry: form.industry,
      p_country: form.country,
      p_city: form.city,
      p_languages: form.languages,
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
      p_interests: form.interests,
      p_goals: form.goals,
    };
  }

  async function saveDraft(showSuccess = true) {
    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase.rpc(
      "save_member_onboarding_draft_v2",
      draftPayload(),
    );
    setSaving(false);
    if (error) {
      setMessage({
        kind: "error",
        text: memberErrorMessage(error, "save your onboarding progress"),
      });
      return false;
    }
    setCompletion(Number(data ?? 0));
    if (showSuccess)
      setMessage({ kind: "success", text: "Your progress is saved." });
    return true;
  }

  async function continueTo(nextStep: number) {
    const saved = await saveDraft(false);
    if (saved) {
      setStep(nextStep);
      setMessage({
        kind: "success",
        text: "Progress saved. You can return and continue at any time.",
      });
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
      setMessage({
        kind: "error",
        text: "Your profile photo must be 5 MB or smaller.",
      });
      return;
    }

    setUploading(true);
    setMessage(null);
    const path = `${userId}/profile`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });
    if (error) {
      setMessage({
        kind: "error",
        text: memberErrorMessage(error, "upload your profile photo"),
      });
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const cacheBustedUrl = `${data.publicUrl}?v=${Date.now()}`;
    setForm((current) => ({
      ...current,
      avatarPath: path,
      avatarUrl: cacheBustedUrl,
    }));
    setMessage({
      kind: "success",
      text: "Photo uploaded. Select Save progress to store it with your profile.",
    });
    setUploading(false);
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
      setMessage({
        kind: "error",
        text: memberErrorMessage(error, "complete your member profile"),
      });
      setSaving(false);
      return;
    }
    window.location.assign(nextHref ?? "/home");
  }

  return (
    <form className="onboarding-form onboarding-wizard" onSubmit={submit}>
      <div className="onboarding-progress" aria-label="Onboarding progress">
        <div>
          <span style={{ width: `${completion}%` }} />
        </div>
        <strong>{completion}% profile complete</strong>
      </div>
      <ol className="onboarding-steps">
        {STEP_LABELS.map((label, index) => (
          <li
            key={label}
            className={
              step === index + 1
                ? "current"
                : step > index + 1
                  ? "complete"
                  : ""
            }
          >
            <button type="button" onClick={() => setStep(index + 1)}>
              <span>0{index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <section
          className="onboarding-step"
          aria-labelledby="profile-step-title"
        >
          <div className="form-section-heading">
            <span>01</span>
            <div>
              <h2 id="profile-step-title">How should members know you?</h2>
              <p>
                Share only the essentials. You can add more to your profile later.
              </p>
            </div>
          </div>
          <div className="avatar-field">
            <div className="avatar-preview">
              {form.avatarUrl ? (
                <img src={form.avatarUrl} alt="Your profile preview" />
              ) : (
                <span>{form.displayName.slice(0, 1).toUpperCase() || "H"}</span>
              )}
            </div>
            <label>
              <strong>Profile photo <span>(optional)</span></strong>
              <small>JPG, PNG or WebP · maximum 5 MB</small>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadAvatar}
                disabled={uploading}
              />
              <span className="button button-outline">
                {uploading
                  ? "Uploading…"
                  : form.avatarUrl
                    ? "Replace photo"
                    : "Choose photo"}
              </span>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Full name
              <input
                value={form.displayName}
                onChange={(event) =>
                  updateField("displayName", event.target.value)
                }
                autoComplete="name"
                required
              />
            </label>
            <label>
              Email address
              <input value={email} readOnly disabled />
            </label>
            <label>
              Role or title
              <input
                value={form.jobTitle}
                onChange={(event) =>
                  updateField("jobTitle", event.target.value)
                }
                placeholder="Founder, Director, Consultant…"
                required
              />
            </label>
            <label>
              Company or organisation
              <input
                value={form.company}
                onChange={(event) => updateField("company", event.target.value)}
              />
            </label>
            <label>
              Industry
              <select
                value={form.industry}
                onChange={(event) =>
                  updateField("industry", event.target.value)
                }
                required
              >
                <option value="">Select your industry</option>
                {INDUSTRIES.map((industry) => (
                  <option key={industry}>{industry}</option>
                ))}
              </select>
            </label>
            <label>
              Country
              <input
                value={form.country}
                onChange={(event) => updateField("country", event.target.value)}
                autoComplete="country-name"
                required
              />
            </label>
            <label>
              City
              <input
                value={form.city}
                onChange={(event) => updateField("city", event.target.value)}
                autoComplete="address-level2"
                required
              />
            </label>
            <label className="form-wide">
              A short introduction
              <textarea
                value={form.bio}
                onChange={(event) => updateField("bio", event.target.value)}
                maxLength={1600}
                rows={5}
                placeholder="What do you do, and what kind of work matters to you?"
                required
              />
              <small>{form.bio.length}/1600 characters</small>
            </label>
          </div>
          <fieldset className="onboarding-choice-fieldset">
            <legend>Languages you are comfortable using <span>(optional)</span></legend>
            <p>Choose any that help members speak with you comfortably.</p>
            <div className="onboarding-choice-grid">
              {[...new Set([...LANGUAGES, ...form.languages])].map((language) => (
                <label
                  className={form.languages.includes(language) ? "selected" : ""}
                  key={language}
                >
                  <input
                    checked={form.languages.includes(language)}
                    onChange={() => toggleList("languages", language)}
                    type="checkbox"
                  />
                  <span>{language}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      ) : null}

      {step === 2 ? (
        <section
          className="onboarding-step"
          aria-labelledby="purpose-step-title"
        >
          <div className="form-section-heading">
            <span>02</span>
            <div>
              <h2 id="purpose-step-title">What brings you to the table?</h2>
              <p>
                Choose what feels useful now. You can change these choices later.
              </p>
            </div>
          </div>
          <fieldset className="goal-grid">
            <legend>Select up to six goals</legend>
            {GOALS.map(([value, label]) => (
              <label
                key={value}
                className={form.goals.includes(value) ? "selected" : ""}
              >
                <input
                  type="checkbox"
                  checked={form.goals.includes(value)}
                  onChange={() => toggleList("goals", value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="onboarding-choice-fieldset">
            <legend>What are you interested in?</legend>
            <p>Choose at least one. These help us make more useful introductions.</p>
            <div className="onboarding-choice-grid">
              {[...new Set([...INTERESTS, ...form.interests])].map((interest) => (
                <label
                  className={form.interests.includes(interest) ? "selected" : ""}
                  key={interest}
                >
                  <input
                    checked={form.interests.includes(interest)}
                    onChange={() => toggleList("interests", interest)}
                    type="checkbox"
                  />
                  <span>{interest}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
      ) : null}

      {step === 3 ? (
        <section
          className="onboarding-step"
          aria-labelledby="trust-step-title"
        >
          <div className="form-section-heading">
            <span>03</span>
            <div>
              <h2 id="trust-step-title">Privacy and trust</h2>
              <p>
                Review what members will see and accept the agreements that
                protect the table.
              </p>
            </div>
          </div>
          <div className="profile-review">
            <strong>{form.displayName || "Your profile"}</strong>
            <span>
              {[form.jobTitle, form.company, form.city, form.country]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <p>
              {form.goals.length} goals · {form.interests.length} interests
              {form.languages.length ? ` · ${form.languages.length} languages` : ""}
            </p>
          </div>
          {missingEssentials.length ? (
            <div className="onboarding-missing-essentials" role="status">
              <strong>A few essentials still need your attention.</strong>
              <p>{missingEssentials.join(", ")}.</p>
              <button
                className="button text-button"
                onClick={() =>
                  setStep(
                    form.goals.length === 0 || form.interests.length === 0 ? 2 : 1,
                  )
                }
                type="button"
              >
                Review the essentials
              </button>
            </div>
          ) : null}
          <details className="onboarding-optional-details">
            <summary>
              <span><strong>Add contact, business or social details</strong><small>Optional—you can do this later.</small></span>
            </summary>
            <div className="form-grid">
              <label>
                Phone number
                <input value={form.phone} onChange={(event) => updateField("phone", event.target.value)} autoComplete="tel" placeholder="+254…" />
              </label>
              <label>
                WhatsApp number
                <input value={form.whatsappNumber} onChange={(event) => updateField("whatsappNumber", event.target.value)} placeholder="+254…" />
              </label>
              <label>
                Business name
                <input value={form.businessName} onChange={(event) => updateField("businessName", event.target.value)} />
              </label>
              <label>
                Business or personal website
                <input type="url" value={form.websiteUrl} onChange={(event) => updateField("websiteUrl", event.target.value)} placeholder="https://…" />
              </label>
              <label>
                LinkedIn profile
                <input type="url" value={form.linkedinUrl} onChange={(event) => updateField("linkedinUrl", event.target.value)} placeholder="https://linkedin.com/in/…" />
              </label>
              <label>
                Instagram profile
                <input type="url" value={form.instagramUrl} onChange={(event) => updateField("instagramUrl", event.target.value)} placeholder="https://instagram.com/…" />
              </label>
              <label className="form-wide">
                How did you hear about Her Africa Table?
                <input value={form.referralSource} onChange={(event) => updateField("referralSource", event.target.value)} placeholder="Friend, event, LinkedIn or Instagram" />
              </label>
            </div>
            <label className="privacy-control">
              <input checked={form.sharePhone} onChange={(event) => updateField("sharePhone", event.target.checked)} type="checkbox" />
              <span>
                <strong>Let accepted connections see my phone number</strong>
                <small>This can be changed later. Your number is never public.</small>
              </span>
            </label>
          </details>
          <div className="agreement-list">
            <label>
              <input
                type="checkbox"
                checked={agreements.terms}
                onChange={(event) =>
                  setAgreements((value) => ({
                    ...value,
                    terms: event.target.checked,
                  }))
                }
                required
              />
              <span>
                I accept the{" "}
                <Link href="/terms" target="_blank">
                  Terms
                </Link>
                .
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={agreements.privacy}
                onChange={(event) =>
                  setAgreements((value) => ({
                    ...value,
                    privacy: event.target.checked,
                  }))
                }
                required
              />
              <span>
                I have read the{" "}
                <Link href="/privacy" target="_blank">
                  Privacy Notice
                </Link>
                .
              </span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={agreements.guidelines}
                onChange={(event) =>
                  setAgreements((value) => ({
                    ...value,
                    guidelines: event.target.checked,
                  }))
                }
                required
              />
              <span>
                I agree to the{" "}
                <Link href="/community-guidelines" target="_blank">
                  Community Guidelines
                </Link>
                .
              </span>
            </label>
          </div>
        </section>
      ) : null}

      {message ? (
        <p className={`auth-message ${message.kind}`} role="status">
          {message.text}
        </p>
      ) : null}
      <div className="wizard-actions">
        <button
          className="button button-outline"
          type="button"
          onClick={() => saveDraft()}
          disabled={saving || uploading}
        >
          {saving ? "Saving…" : "Save progress"}
        </button>
        <div>
          {step > 1 ? (
            <button
              className="button text-button"
              type="button"
              onClick={() => setStep((current) => current - 1)}
              disabled={saving}
            >
              Back
            </button>
          ) : null}
          {step < 3 ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => continueTo(step + 1)}
              disabled={saving || uploading}
            >
              {saving ? "Saving…" : "Save and continue"}
            </button>
          ) : (
            <button
              className="button button-primary"
              type="submit"
              disabled={saving || missingEssentials.length > 0}
            >
              {saving
                ? "Activating…"
                : "Enter the member network"}
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
