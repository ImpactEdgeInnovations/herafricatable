"use client";

import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";

export type EditableMemberProfile = {
  avatar_url: string | null;
  bio: string | null;
  business_name: string | null;
  city: string | null;
  company: string | null;
  country: string | null;
  display_name: string | null;
  goals: string[];
  industry: string | null;
  instagram_url: string | null;
  interests: string[];
  job_title: string | null;
  languages: string[];
  linkedin_url: string | null;
  phone: string | null;
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

export function ProfileEditor({
  email,
  initial,
  userId,
}: {
  email: string;
  initial: EditableMemberProfile;
  userId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? "");
  const [goals, setGoals] = useState(initial.goals);
  const completedProfileFields = [
    initial.display_name,
    initial.job_title,
    initial.industry,
    initial.city,
    initial.country,
    initial.bio,
    initial.interests.length,
    initial.goals.length,
  ].filter(Boolean).length;
  const profileCompletion = Math.round((completedProfileFields / 8) * 100);

  function splitList(value: FormDataEntryValue | null) {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function toggleGoal(goal: string) {
    setGoals((current) =>
      current.includes(goal)
        ? current.filter((item) => item !== goal)
        : current.length < 6
          ? [...current, goal]
          : current,
    );
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setMessage("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Your profile photo must be 5 MB or smaller.");
      return;
    }
    setUploading(true);
    setMessage("");
    const path = `${userId}/profile`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });
    setUploading(false);
    if (error) {
      setMessage(memberErrorMessage(error, "replace your profile photo"));
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setAvatarUrl(`${data.publicUrl}?v=${Date.now()}`);
    setMessage("Photo updated. Your other changes are still ready to save.");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("update_member_profile", {
      p_bio: form.get("bio"),
      p_avatar_url: avatarUrl,
      p_business_name: form.get("business_name"),
      p_city: form.get("city"),
      p_company: form.get("company"),
      p_country: form.get("country"),
      p_display_name: form.get("display_name"),
      p_goals: goals,
      p_industry: form.get("industry"),
      p_instagram_url: form.get("instagram_url"),
      p_interests: splitList(form.get("interests")),
      p_job_title: form.get("job_title"),
      p_languages: splitList(form.get("languages")),
      p_linkedin_url: form.get("linkedin_url"),
      p_phone: form.get("phone"),
      p_share_phone: form.get("share_phone") === "on",
      p_website_url: form.get("website_url"),
      p_whatsapp_number: form.get("whatsapp_number"),
    });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "save your profile")
        : "Your profile is up to date.",
    );
    if (!error) router.refresh();
  }

  return (
    <form className="profile-editor" onSubmit={(event) => void save(event)}>
      <header>
        <div>
          <p className="eyebrow">Your member identity</p>
          <h1>Your profile.</h1>
          <p>
            Help trusted members understand who you are and what brings you to
            the table. Private contact details remain protected until a
            connection is mutually accepted.
          </p>
        </div>
        <div className="profile-editor-summary">
          <div className="profile-editor-avatar">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <span>{initial.display_name?.slice(0, 1) ?? "H"}</span>
            )}
            <label>
              <strong>{uploading ? "Uploading…" : "Change photo"}</strong>
              <small>JPG, PNG or WebP · up to 5 MB</small>
              <input
                accept="image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => void uploadAvatar(event)}
                type="file"
              />
            </label>
          </div>
          <div className="profile-completion">
            <span>
              <strong>{profileCompletion}%</strong> profile ready
            </span>
            <i aria-hidden="true">
              <b style={{ width: `${profileCompletion}%` }} />
            </i>
          </div>
          <Link href="/settings">Account and privacy settings →</Link>
        </div>
      </header>

      <section aria-labelledby="profile-public-title">
        <div className="profile-editor-section-title">
          <span>01</span>
          <div>
            <h2 id="profile-public-title">How members know you</h2>
            <p>Active members can see this when they are looking for people to meet.</p>
          </div>
        </div>
        <div className="profile-editor-grid">
          <label>
            Full name
            <input
              defaultValue={initial.display_name ?? ""}
              name="display_name"
              required
            />
          </label>
          <label>
            Email
            <input disabled readOnly value={email} />
          </label>
          <label>
            Role or title
            <input
              defaultValue={initial.job_title ?? ""}
              name="job_title"
              required
            />
          </label>
          <label>
            Company or organisation
            <input defaultValue={initial.company ?? ""} name="company" />
          </label>
          <label>
            Industry
            <select
              defaultValue={initial.industry ?? ""}
              name="industry"
              required
            >
              <option disabled value="">
                Choose your industry
              </option>
              {INDUSTRIES.map((industry) => (
                <option key={industry}>{industry}</option>
              ))}
            </select>
          </label>
          <label>
            City
            <input defaultValue={initial.city ?? ""} name="city" required />
          </label>
          <label>
            Country
            <input
              defaultValue={initial.country ?? ""}
              name="country"
              required
            />
          </label>
          <label>
            Languages
            <input
              defaultValue={initial.languages.join(", ")}
              name="languages"
              placeholder="English, Kiswahili"
              required
            />
            <small>Separate multiple languages with commas.</small>
          </label>
          <label className="wide">
            Short introduction
            <textarea
              defaultValue={initial.bio ?? ""}
              maxLength={1600}
              name="bio"
              required
              rows={5}
            />
          </label>
          <label>
            Business name
            <input
              defaultValue={initial.business_name ?? ""}
              name="business_name"
            />
          </label>
          <label>
            Website
            <input
              defaultValue={initial.website_url ?? ""}
              name="website_url"
              placeholder="https://"
              type="url"
            />
          </label>
          <label className="wide">
            Interests
            <input
              defaultValue={initial.interests.join(", ")}
              name="interests"
              placeholder="Entrepreneurship, finance, wellness"
              required
            />
            <small>Use commas to add a few specific interests.</small>
          </label>
        </div>
      </section>

      <section aria-labelledby="profile-purpose-title">
        <div className="profile-editor-section-title">
          <span>02</span>
          <div>
            <h2 id="profile-purpose-title">What brings you to the table</h2>
            <p>Choose up to six goals. Select at least one.</p>
          </div>
        </div>
        <fieldset className="profile-goals">
          <legend className="sr-only">Member goals</legend>
          {GOALS.map(([value, label]) => (
            <label key={value}>
              <input
                checked={goals.includes(value)}
                onChange={() => toggleGoal(value)}
                type="checkbox"
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <section aria-labelledby="profile-contact-title">
        <div className="profile-editor-section-title">
          <span>03</span>
          <div>
            <h2 id="profile-contact-title">Private contact preferences</h2>
            <p>
              These are not shown in directories, events, or community rooms.
            </p>
          </div>
        </div>
        <div className="profile-editor-grid">
          <label>
            Phone number
            <input
              autoComplete="tel"
              defaultValue={initial.phone ?? ""}
              name="phone"
            />
          </label>
          <label>
            WhatsApp number
            <input
              defaultValue={initial.whatsapp_number ?? ""}
              name="whatsapp_number"
            />
          </label>
          <label>
            LinkedIn profile
            <input
              defaultValue={initial.linkedin_url ?? ""}
              name="linkedin_url"
              placeholder="https://"
              type="url"
            />
          </label>
          <label>
            Instagram profile
            <input
              defaultValue={initial.instagram_url ?? ""}
              name="instagram_url"
              placeholder="https://"
              type="url"
            />
          </label>
        </div>
        <label className="profile-sharing-choice">
          <input
            defaultChecked={initial.share_phone_with_connections}
            name="share_phone"
            type="checkbox"
          />
          <span>
            <strong>Share my phone and WhatsApp with accepted connections</strong>
            <small>
              A request alone is never enough. You can change this at any time.
            </small>
          </span>
        </label>
      </section>

      <footer>
        <p role="status">{message}</p>
        <button
          className="button button-primary"
          disabled={busy || uploading || goals.length === 0}
        >
          {busy ? "Saving…" : "Save profile"}
        </button>
      </footer>
    </form>
  );
}
