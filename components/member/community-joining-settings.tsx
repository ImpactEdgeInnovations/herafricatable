"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunityJoiningSettings = {
  admission_mode: "open" | "approval";
  community_id: string;
  community_type: "official" | "private";
  effective_mode: "open" | "approval" | "invite_only";
};

export function CommunityJoiningSettingsPanel({
  communityId,
  owner,
  settings,
}: {
  communityId: string;
  owner: boolean;
  settings: CommunityJoiningSettings | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [selected, setSelected] = useState<"open" | "approval" | "invite_only">(
    settings?.effective_mode ?? "approval",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_community_joining_mode", {
      p_community_id: communityId,
      p_mode: selected,
    });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "update who can join")
        : selected === "open"
          ? "Active Her Africa Table members can now join immediately."
          : selected === "invite_only"
            ? "Only people you invite can now join this Community."
            : "New members will now wait for a Host or moderator to approve them.",
    );
    if (!error) router.refresh();
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
              disabled={!owner}
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
              disabled={!owner}
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
              disabled={!owner}
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
          disabled={busy || selected === settings.effective_mode}
          onClick={() => void save()}
          type="button"
        >
          {busy ? "Saving…" : "Save joining choice"}
        </button>
      ) : null}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </section>
  );
}
