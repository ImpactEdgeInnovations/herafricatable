"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityWelcomeMember = {
  user_id: string;
  display_name: string;
  job_title: string | null;
  company: string | null;
  joined_at: string;
  introduction_shared: boolean;
  first_contribution_shared: boolean;
  welcomed_at: string | null;
  can_welcome: boolean;
};

export function CommunityWelcomeQueue({
  communityId,
  members,
  migrationReady,
}: {
  communityId: string;
  members: CommunityWelcomeMember[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  if (!migrationReady) return null;

  const waiting = members.filter((member) => member.can_welcome);
  const welcomed = members.filter((member) => member.welcomed_at);

  async function welcome(member: CommunityWelcomeMember) {
    const confirmed = await ask({
      title: `Welcome ${member.display_name}?`,
      description:
        "She will receive one platform welcome from this Community. No private note or contact detail is shared.",
      confirmLabel: "Send welcome",
    });
    if (!confirmed) return;

    setBusy(member.user_id);
    setMessage("");
    const { error } = await supabase.rpc("send_community_member_welcome", {
      p_community_id: communityId,
      p_user_id: member.user_id,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "welcome this member")
        : `Welcome sent to ${member.display_name}.`,
    );
    if (!error) router.refresh();
  }

  return (
    <section className="community-welcome-queue" id="welcome">
      <header>
        <div>
          <p className="eyebrow">Welcome new members</p>
          <h2>A human hello makes the room feel smaller.</h2>
        </div>
        <p>
          Recent members who may need a welcome appear here. This is a private
          Host prompt, never a member score.
        </p>
      </header>

      {message ? <p className="community-welcome-message" role="status">{message}</p> : null}

      {waiting.length ? (
        <div className="community-welcome-list">
          {waiting.map((member) => (
            <article key={member.user_id}>
              <div className="community-welcome-avatar" aria-hidden="true">
                {member.display_name.trim().charAt(0).toUpperCase()}
              </div>
              <div>
                <strong>{member.display_name}</strong>
                <span>
                  {[member.job_title, member.company].filter(Boolean).join(" · ") ||
                    "Community member"}
                </span>
                <small>
                  Joined {new Intl.DateTimeFormat("en-KE", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(member.joined_at))}
                  {member.introduction_shared
                    ? " · Introduction shared"
                    : " · Introduction not shared yet"}
                </small>
              </div>
              <button
                type="button"
                disabled={busy === member.user_id}
                onClick={() => void welcome(member)}
              >
                {busy === member.user_id ? "Sending…" : "Send welcome"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="community-welcome-empty">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Every recent member has been welcomed.</strong>
            <p>New members will appear here for their first 30 days.</p>
          </div>
        </div>
      )}

      {welcomed.length ? (
        <details className="community-welcomed-history">
          <summary>Recently welcomed <span>{welcomed.length}</span></summary>
          <div>
            {welcomed.map((member) => (
              <p key={member.user_id}>
                <strong>{member.display_name}</strong>
                <span>
                  Welcomed {new Intl.DateTimeFormat("en-KE", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(member.welcomed_at!))}
                </span>
              </p>
            ))}
          </div>
        </details>
      ) : null}
      <p className="community-welcome-boundary">
        Hosts see only membership, introduction and first-contribution signals
        from this Community—not private conversations, notes or contact details.
      </p>
      {dialog}
    </section>
  );
}
