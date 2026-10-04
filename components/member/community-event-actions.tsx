"use client";

import { ChangeEvent, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { eventCalendarFile } from "@/lib/events/calendar-file";

export type CommunityEventPreference = {
  event_id: string;
  timezone: string;
  registration_status: string | null;
  reminder_window: "day_before" | "hour_before" | null;
  reminder_status: string | null;
  remind_at: string | null;
};

type CalendarEvent = {
  event_id: string;
  slug: string;
  title: string;
  summary: string | null;
  starts_at: string;
  ends_at: string;
  venue_name: string | null;
  city: string | null;
  country: string | null;
};

export function CommunityEventActions({
  communityId,
  event,
  migrationReady,
  preference,
}: {
  communityId: string;
  event: CalendarEvent;
  migrationReady: boolean;
  preference: CommunityEventPreference | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [reminderWindow, setReminderWindow] = useState(
    preference?.reminder_window ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const past = new Date(event.ends_at).getTime() <= Date.now();

  async function updateReminder(change: ChangeEvent<HTMLSelectElement>) {
    const next = change.target.value as "" | "day_before" | "hour_before";
    setReminderWindow(next);
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_my_community_event_reminder", {
      p_community_id: communityId,
      p_event_id: event.event_id,
      p_reminder_window: next || null,
    });
    setBusy(false);
    if (error) {
      setReminderWindow(preference?.reminder_window ?? "");
      setMessage(memberErrorMessage(error, "save this event reminder"));
      return;
    }
    setMessage(next ? "Reminder saved." : "Reminder removed.");
  }

  function addToCalendar() {
    const location = [event.venue_name, event.city, event.country]
      .filter(Boolean)
      .join(", ");
    const ics = eventCalendarFile({
      endsAt: event.ends_at,
      eventId: event.event_id,
      location,
      slug: event.slug,
      startsAt: event.starts_at,
      summary: event.summary,
      title: event.title,
    }, window.location.origin);
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${event.slug}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Calendar file prepared.");
  }

  return (
    <div className="community-event-actions">
      <Link href={`/events/${event.slug}`}>View event →</Link>
      {!past ? (
        <button type="button" onClick={addToCalendar}>
          Add to calendar
        </button>
      ) : null}
      {!past && migrationReady ? (
        <label>
          <span>Remind me</span>
          <select
            aria-label={`Reminder for ${event.title}`}
            disabled={busy}
            onChange={(change) => void updateReminder(change)}
            value={reminderWindow}
          >
            <option value="">No reminder</option>
            <option value="day_before">One day before</option>
            <option value="hour_before">One hour before</option>
          </select>
        </label>
      ) : null}
      {message ? <small role="status">{message}</small> : null}
      {preference?.registration_status ? (
        <em>
          {preference.registration_status === "confirmed"
            ? "Your seat is confirmed"
            : `Registration: ${preference.registration_status.replaceAll("_", " ")}`}
        </em>
      ) : !past ? (
        <em>A reminder does not reserve a seat</em>
      ) : null}
    </div>
  );
}
