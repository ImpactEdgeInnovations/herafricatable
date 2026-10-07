"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";

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
  currentUserId,
  communityName,
  migrationReady,
  owner,
  profile,
  slug,
  taglineReady,
}: {
  communityId: string;
  currentUserId: string;
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
  const initialDraft = {
    summary: profile?.about_summary ?? "", audience: profile?.audience_summary ?? "",
    benefits: Array.from({ length: 6 }, (_, index) => profile?.about_benefits[index] ?? ""),
    hostName: profile?.host_display_name ?? "", hostIntro: profile?.host_intro ?? "",
    memberCount: profile?.show_public_member_count ?? false, enabled: profile?.public_preview_enabled ?? false,
  };
  const [draft, setDraft, clearDraft] = useCommunityDraft(communityDraftKey(currentUserId, "public-profile", communityId), initialDraft);
  const [savedDraft, setSavedDraft] = useState(initialDraft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedDraft);

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
    if (!owner || busy || !dirty) return;
    const submitted = { ...draft, benefits: [...draft.benefits] };
    const enabled = submitted.enabled;
    const benefits = submitted.benefits.map(value => value.trim()).filter(Boolean);

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

    setBusy(true);
    setMessage("");
    try {
    if (enabled !== savedDraft.enabled) {
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

    const { error } = await supabase.rpc("save_community_public_profile", {
      p_about_benefits: benefits,
      p_about_summary: submitted.summary,
      p_audience_summary: submitted.audience,
      p_community_id: communityId,
      p_host_display_name: submitted.hostName,
      p_host_intro: submitted.hostIntro,
      p_public_preview_enabled: enabled,
      p_show_public_member_count: submitted.memberCount,
    });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "save this shareable Community page")
        : enabled
          ? "Public Community page saved and ready to share."
          : "Community page draft saved. It is not publicly visible.",
    );
    if (!error) { setSavedDraft(submitted); clearDraft(submitted); router.refresh(); }
    } catch (error) { setMessage(memberErrorMessage(error, "save this Community page")); }
    finally { setBusy(false); }
  }

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
              savedDraft.enabled
                ? "community-public-state is-live"
                : "community-public-state"
            }
          >
            <strong>
              {savedDraft.enabled ? "Public link on" : "Private draft"}
            </strong>
            <small>
              {savedDraft.enabled
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
              payments and private Host information never appear on this page. The Host name and introduction you choose below can be shared.
            </p>
          </div>
          {savedDraft.enabled ? (
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
          <fieldset disabled={busy} className="span-two" style={{ display: "contents" }}>
          <label className="span-two">
            Community overview
            <textarea
              value={draft.summary}
              onChange={event => setDraft(current => ({ ...current, summary: event.target.value }))}
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
              value={draft.audience}
              onChange={event => setDraft(current => ({ ...current, audience: event.target.value }))}
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
                    value={draft.benefits[index] ?? ""}
                    onChange={event => { const value = event.target.value; setDraft(current => ({ ...current, benefits: current.benefits.map((benefit, position) => position === index ? value : benefit) })); }}
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
              value={draft.hostName}
              onChange={event => setDraft(current => ({ ...current, hostName: event.target.value }))}
              maxLength={100}
              minLength={2}
              name="host_display_name"
              placeholder="Name or trusted public role"
            />
          </label>

          <label>
            Host introduction
            <textarea
              value={draft.hostIntro}
              onChange={event => setDraft(current => ({ ...current, hostIntro: event.target.value }))}
              maxLength={600}
              minLength={20}
              name="host_intro"
              placeholder="Explain why you lead this Community and how you support members."
            />
          </label>

          <label className="community-public-choice">
            <input
              checked={draft.memberCount}
              onChange={event => setDraft(current => ({ ...current, memberCount: event.target.checked }))}
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
              checked={draft.enabled}
              onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))}
              disabled={!openingReady && !savedDraft.enabled}
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
            <button className="button button-primary" disabled={busy || !dirty}>
              {busy ? "Saving page…" : "Save Community page"}
            </button>
          </footer>
          </fieldset>
        </form>
        {dirty ? <p role="status">Changes are not saved yet. <button type="button" disabled={busy} onClick={() => clearDraft(savedDraft)}>Discard changes</button></p> : null}

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
