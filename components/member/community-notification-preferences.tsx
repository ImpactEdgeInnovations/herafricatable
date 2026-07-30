"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunityNotificationPreference = {
  in_app_replies: boolean;
  email_replies: boolean;
  weekly_briefing: boolean;
  weekly_briefing_email: boolean;
};

export function CommunityNotificationPreferences({
  communityId,
  initialPreferences,
}: {
  communityId: string;
  initialPreferences: CommunityNotificationPreference;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc(
      "update_community_notification_preferences",
      {
        p_community_id: communityId,
        p_email_replies: preferences.email_replies,
        p_in_app_replies: preferences.in_app_replies,
        p_weekly_briefing: preferences.weekly_briefing,
        p_weekly_briefing_email: preferences.weekly_briefing_email,
      },
    );
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "save your community update choices")
        : "Your choices for this community have been saved.",
    );
  }

  return (
    <details className="community-update-preferences" id="room-updates">
      <summary>
        <span>
          <small>Room updates</small>
          <strong>Keep what is useful. Quiet the rest.</strong>
          <em>
            Replies and one useful weekly summary stay in Activity by default;
            email remains your choice.
          </em>
        </span>
        <b>Choose updates</b>
      </summary>
      <form onSubmit={(event) => void save(event)}>
        <div>
          <p>
            These choices apply only to this community. Your main Activity
            settings still control whether notifications can reach you.
          </p>
          <Link href="/notifications">Open main Activity settings</Link>
        </div>
        <label>
          <input
            checked={preferences.in_app_replies}
            onChange={(event) =>
              setPreferences((value) => ({
                ...value,
                in_app_replies: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>
            <strong>Replies in Activity</strong>
            <small>
              Show replies to conversations you follow in your private Activity
              feed.
            </small>
          </span>
        </label>
        <label>
          <input
            checked={preferences.email_replies}
            onChange={(event) =>
              setPreferences((value) => ({
                ...value,
                email_replies: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>
            <strong>Email me about replies</strong>
            <small>
              Off by default to avoid an email for every community reply.
            </small>
          </span>
        </label>
        <label>
          <input
            checked={preferences.weekly_briefing}
            onChange={(event) =>
              setPreferences((value) => ({
                ...value,
                weekly_briefing: event.target.checked,
                weekly_briefing_email: event.target.checked
                  ? value.weekly_briefing_email
                  : false,
              }))
            }
            type="checkbox"
          />
          <span>
            <strong>Weekly room briefing</strong>
            <small>
              One aggregate update only when the room moved or a gathering is
              near.
            </small>
          </span>
        </label>
        <label className={!preferences.weekly_briefing ? "is-disabled" : ""}>
          <input
            checked={preferences.weekly_briefing_email}
            disabled={!preferences.weekly_briefing}
            onChange={(event) =>
              setPreferences((value) => ({
                ...value,
                weekly_briefing_email: event.target.checked,
              }))
            }
            type="checkbox"
          />
          <span>
            <strong>Send the briefing by email</strong>
            <small>
              The same quiet summary can also appear in your inbox.
            </small>
          </span>
        </label>
        <footer>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save room updates"}
          </button>
          {message ? <p role="status">{message}</p> : null}
        </footer>
      </form>
    </details>
  );
}
