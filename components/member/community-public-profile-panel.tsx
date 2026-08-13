"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunityPublicProfile = {
  about_benefits: string[];
  about_summary: string | null;
  audience_summary: string | null;
  community_id: string;
  community_status: string;
  host_display_name: string | null;
  host_intro: string | null;
  public_preview_enabled: boolean;
  release_ready: boolean;
  show_public_member_count: boolean;
  updated_at: string | null;
};

export function CommunityPublicProfilePanel({
  communityId,
  communityName,
  migrationReady,
  owner,
  profile,
  slug,
  taglineReady,
}: {
  communityId: string;
  communityName: string;
  migrationReady: boolean;
  owner: boolean;
  profile: CommunityPublicProfile | null;
  slug: string;
  taglineReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!owner) return null;

  if (!migrationReady) {
    return (
      <section className="community-public-profile-panel" id="public-page">
        <div className="community-host-unavailable" role="status">
          <strong>The shareable Community page is being prepared.</strong>
          <p>
            Nothing is public. The sharing controls will appear here when they
            are ready.
          </p>
        </div>
      </section>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const enabled = form.get("public_preview_enabled") === "on";
    const benefits = Array.from({ length: 6 }, (_, index) =>
      String(form.get(`benefit_${index + 1}`) ?? "").trim(),
    ).filter(Boolean);

    if (enabled && benefits.length < 3) {
      setMessage("Add at least three clear member benefits before sharing.");
      return;
    }
    if (enabled && !taglineReady) {
      setMessage(
        "Add a short tagline in Look & feel before sharing this page.",
      );
      return;
    }

    if (enabled !== Boolean(profile?.public_preview_enabled)) {
      const confirmed = await ask({
        title: enabled
          ? `Share ${communityName} publicly?`
          : `Hide ${communityName} from public view?`,
        description: enabled
          ? "Anyone with the link will see only the approved overview, host introduction, access price and next public event. Posts and member identities remain private."
          : "The shareable page will stop opening immediately. Existing members and Community content are unchanged.",
        confirmLabel: enabled ? "Share public page" : "Hide public page",
        tone: enabled ? "default" : "danger",
      });
      if (!confirmed) return;
    }

    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_community_public_profile", {
      p_about_benefits: benefits,
      p_about_summary: String(form.get("about_summary") ?? ""),
      p_audience_summary: String(form.get("audience_summary") ?? ""),
      p_community_id: communityId,
      p_host_display_name: String(form.get("host_display_name") ?? ""),
      p_host_intro: String(form.get("host_intro") ?? ""),
      p_public_preview_enabled: enabled,
      p_show_public_member_count: form.get("show_member_count") === "on",
    });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "save this shareable Community page")
        : enabled
          ? "Public Community page saved and ready to share."
          : "Community page draft saved. It is not publicly visible.",
    );
    if (!error) router.refresh();
  }

  const benefits = profile?.about_benefits ?? [];
  const openingReady =
    profile?.community_status === "published" &&
    profile.release_ready &&
    taglineReady;

  return (
    <>
      <section className="community-public-profile-panel" id="public-page">
        <header>
          <div>
            <p className="eyebrow">Shareable Community page</p>
            <h2>Help the right women understand this Community.</h2>
          </div>
          <div
            className={
              profile?.public_preview_enabled
                ? "community-public-state is-live"
                : "community-public-state"
            }
          >
            <strong>
              {profile?.public_preview_enabled ? "Public link on" : "Private draft"}
            </strong>
            <small>
              {profile?.public_preview_enabled
                ? "Only approved profile information is visible."
                : "Nothing on this page is public yet."}
            </small>
          </div>
        </header>

        <aside className="community-public-boundary">
          <div>
            <strong>Always private</strong>
            <p>
              Posts, replies, member names, contact details, joining instructions,
              payments and Host information never appear on this page.
            </p>
          </div>
          {profile?.public_preview_enabled ? (
            <Link href={`/communities/${slug}/about`} target="_blank">
              Open public page ↗
            </Link>
          ) : null}
        </aside>

        {!openingReady ? (
          <div className="community-public-readiness" role="status">
            <strong>Finish these private checks before sharing.</strong>
            <ul>
              {profile?.community_status !== "published" ? (
                <li>Our team must approve the Community.</li>
              ) : null}
              {!profile?.release_ready ? (
                <li>Our team must finish the final opening review.</li>
              ) : null}
              {!taglineReady ? (
                <li>Add a short tagline under Look &amp; feel.</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <form className="community-public-profile-form" onSubmit={(event) => void save(event)}>
          <label className="span-two">
            Community overview
            <textarea
              defaultValue={profile?.about_summary ?? ""}
              maxLength={900}
              minLength={60}
              name="about_summary"
              placeholder="Explain the purpose, the experience and the change members should expect."
            />
            <small>60–900 characters. Keep this warm, specific and easy to scan.</small>
          </label>

          <label className="span-two">
            Who is this for?
            <textarea
              defaultValue={profile?.audience_summary ?? ""}
              maxLength={400}
              minLength={20}
              name="audience_summary"
              placeholder="For example: Women building or leading businesses in Nairobi who want trusted peers and practical support."
            />
          </label>

          <fieldset className="span-two community-public-benefits">
            <legend>What members will receive</legend>
            <p>Add at least three short, concrete benefits.</p>
            <div>
              {Array.from({ length: 6 }, (_, index) => (
                <label key={index}>
                  Benefit {index + 1}
                  <input
                    defaultValue={benefits[index] ?? ""}
                    maxLength={180}
                    minLength={8}
                    name={`benefit_${index + 1}`}
                    placeholder={
                      index === 0
                        ? "A trusted monthly gathering"
                        : index === 1
                          ? "Warm introductions to relevant members"
                          : index === 2
                            ? "Practical conversations and shared resources"
                            : "Optional"
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>

          <label>
            Public host name
            <input
              defaultValue={profile?.host_display_name ?? ""}
              maxLength={100}
              minLength={2}
              name="host_display_name"
              placeholder="Name or trusted public role"
            />
          </label>

          <label>
            Host introduction
            <textarea
              defaultValue={profile?.host_intro ?? ""}
              maxLength={600}
              minLength={20}
              name="host_intro"
              placeholder="Explain why you lead this Community and how you support members."
            />
          </label>

          <label className="community-public-choice">
            <input
              defaultChecked={profile?.show_public_member_count ?? false}
              name="show_member_count"
              type="checkbox"
            />
            <span>
              <strong>Show the total member count</strong>
              <small>Only the number appears—never names or profiles.</small>
            </span>
          </label>

          <label className="community-public-choice is-primary">
            <input
              defaultChecked={profile?.public_preview_enabled ?? false}
              disabled={!openingReady}
              name="public_preview_enabled"
              type="checkbox"
            />
            <span>
              <strong>Make this page shareable</strong>
              <small>
                This opens after our team completes the final review.
              </small>
            </span>
          </label>

          <footer className="span-two">
            <div>
              <strong>Save safely</strong>
              <small>
                You can save an incomplete private draft. Sharing is blocked
                until every required detail and safety check is complete.
              </small>
            </div>
            <button className="button button-primary" disabled={busy}>
              {busy ? "Saving page…" : "Save Community page"}
            </button>
          </footer>
        </form>

        {message ? (
          <p className="community-host-message" role="status">
            {message}
          </p>
        ) : null}
      </section>
      {dialog}
    </>
  );
}
