"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";

export type CommunityJoiningSettings = {
  admission_mode: "open" | "approval";
  community_id: string;
  community_type: "official" | "private";
  effective_mode: "open" | "approval" | "invite_only";
};

export function CommunityJoiningSettingsPanel({
  communityId,
  currentUserId,
  owner,
  settings,
}: {
  communityId: string;
  currentUserId: string;
  owner: boolean;
  settings: CommunityJoiningSettings | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected, clearSelected] = useCommunityDraft<"open" | "approval" | "invite_only">(
    communityDraftKey(currentUserId, "joining-settings", communityId),
    settings?.effective_mode ?? "approval",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedMode, setSavedMode] = useState(settings?.effective_mode ?? "approval");
  const dirty = selected !== savedMode;

  async function save() {
    if (!owner || !settings || busy || !dirty) return;
    setBusy(true);
    setMessage("");
    const submitted = selected;
    try {
    const { error } = await supabase.rpc("save_community_joining_mode", {
      p_community_id: communityId,
      p_mode: submitted,
    });
    setMessage(
      error
        ? memberErrorMessage(error, "update who can join")
        : selected === "open"
          ? "Active Her Africa Table members can now join immediately."
          : selected === "invite_only"
            ? "Only people you invite can now join this Community."
            : "New members will now wait for a Host or moderator to approve them.",
    );
    if (!error) { setSavedMode(submitted); clearSelected(submitted); router.refresh(); }
    } catch (error) { setMessage(memberErrorMessage(error, "update who can join")); }
    finally { setBusy(false); }
  }

  return (
    <section className="community-joining-settings" id="joining-settings">
      <header>
        <div>
          <p className="eyebrow">Who can join?</p>
          <h2>Choose how new members enter.</h2>
        </div>
        <p>
          Everyone must first be an approved Her Africa Table member. This
          choice only controls entry to this Community.
        </p>
      </header>

      {!settings ? (
        <div className="community-joining-settings-unavailable" role="status">
          <strong>This setting is almost ready.</strong>
          <p>The current joining rule remains unchanged.</p>
        </div>
      ) : (
        <div className="community-joining-options">
          <label className={selected === "open" ? "selected" : ""}>
            <input
              checked={selected === "open"}
              disabled={!owner || busy}
              name="joining-mode"
              onChange={() => setSelected("open")}
              type="radio"
            />
            <span>
              <strong>Open to all members</strong>
              <small>
                Any active Her Africa Table member can join immediately.
              </small>
            </span>
          </label>
          <label className={selected === "approval" ? "selected" : ""}>
            <input
              checked={selected === "approval"}
              disabled={!owner || busy}
              name="joining-mode"
              onChange={() => setSelected("approval")}
              type="radio"
            />
            <span>
              <strong>Review each request</strong>
              <small>
                The Host and moderators receive a request and choose Approve
                or Decline.
              </small>
            </span>
          </label>
          <label className={selected === "invite_only" ? "selected" : ""}>
            <input
              checked={selected === "invite_only"}
              disabled={!owner || busy}
              name="joining-mode"
              onChange={() => setSelected("invite_only")}
              type="radio"
            />
            <span>
              <strong>Invitation only</strong>
              <small>Only people you invite can join. Others cannot send a request.</small>
            </span>
          </label>
        </div>
      )}

      {settings && settings.community_type === "private" ? (
        <p className="community-joining-private-note">
          Your conversations remain for members only. If the Community is still a draft, no one else can join yet.
        </p>
      ) : null}
      {!owner && settings ? (
        <p className="community-joining-private-note">
          Only the Community owner can change this setting. Moderators can
          still review requests.
        </p>
      ) : null}
      {owner && settings ? (
        <button
          className="button button-primary"
          disabled={busy || !dirty}
          onClick={() => void save()}
          type="button"
        >
          {busy ? "Saving…" : "Save joining choice"}
        </button>
      ) : null}
      {owner && settings && dirty ? <p role="status">This joining choice is not saved yet. <button type="button" disabled={busy} onClick={() => clearSelected(savedMode)}>Discard changes</button></p> : null}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );
}
