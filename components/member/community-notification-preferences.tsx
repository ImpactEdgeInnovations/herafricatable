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
          <small>Community notifications</small>
          <strong>Choose which updates you receive.</strong>
          <em>
            See replies in Activity, receive a weekly summary, or turn email
            updates on and off.
          </em>
        </span>
        <b>Change notifications</b>
      </summary>
      <form onSubmit={(event) => void save(event)}>
        <div>
          <p>
            These choices apply only to this community. Your main Activity
            settings still control all platform notifications.
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
            <strong>Show replies in Activity</strong>
            <small>
              Add replies from conversations you follow to your Activity page.
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
              Turn this on if you also want each reply sent by email.
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
            <strong>Weekly community summary</strong>
            <small>
              Receive one summary when there are new posts or an event is near.
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
            <strong>Email the weekly summary</strong>
            <small>
              Send the same weekly summary to your inbox.
            </small>
          </span>
        </label>
        <footer>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save notification choices"}
          </button>
          {message ? <p role="status">{message}</p> : null}
        </footer>
      </form>
    </details>
  );
}
