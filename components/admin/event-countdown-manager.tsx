"use client";

import { FormEvent, useMemo, useState } from "react";
import { adminErrorMessage } from "@/lib/admin-error";
import { formatEventTimeInput, parseEventTimeInput } from "@/lib/events/zoned-datetime";
import { createClient } from "@/lib/supabase/client";

export type CountdownSettings = {
  city: string;
  event_name: string;
  is_published: boolean;
  starts_at: string;
};

type Props = {
  canManage: boolean;
  initialSettings: CountdownSettings | null;
  userId: string;
};

export function EventCountdownManager({
  canManage,
  initialSettings,
  userId,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [eventName, setEventName] = useState(
    initialSettings?.event_name ?? "Her Africa Table — Nairobi",
  );
  const [city, setCity] = useState(initialSettings?.city ?? "Nairobi");
  const [startsAt, setStartsAt] = useState(
    initialSettings?.starts_at
      ? formatEventTimeInput(initialSettings.starts_at, "Africa/Nairobi")
      : "",
  );
  const [isPublished, setIsPublished] = useState(
    initialSettings?.is_published ?? false,
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveCountdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (!startsAt) {
      setMessage("Choose the event date and time.");
      return;
    }

    let publishedAt: string;
    try {
      publishedAt = parseEventTimeInput(startsAt, "Africa/Nairobi");
    } catch {
      setMessage("Choose a valid Nairobi date and time.");
      return;
    }
    if (isPublished && Date.parse(publishedAt) <= Date.now()) {
      setMessage("That date has passed. Choose a future date or keep the countdown hidden.");
      return;
    }

    setSaving(true);
    setMessage("");
    if (isPublished) {
      const matchingEvent = await supabase.from("events")
        .select("id")
        .eq("status", "published")
        .eq("audience", "public")
        .eq("title", eventName.trim())
        .eq("starts_at", publishedAt)
        .maybeSingle();
      if (matchingEvent.error || !matchingEvent.data) {
        setSaving(false);
        setMessage(matchingEvent.error
          ? adminErrorMessage(matchingEvent.error, "check the public event")
          : "Publish the matching public event in Event details first. Its name and start time must match this countdown.");
        return;
      }
    }
    const { error } = await supabase.from("site_event_countdown").upsert({
      id: true,
      event_name: eventName.trim(),
      city: city.trim(),
      starts_at: publishedAt,
      is_published: isPublished,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);
    setMessage(
      error
        ? adminErrorMessage(error, "save the public countdown")
        : isPublished
          ? "Countdown saved. The public page should update within a minute."
          : "Countdown saved as hidden.",
    );
  }

  return (
    <section
      className="countdown-manager"
      aria-labelledby="countdown-manager-title"
    >
      <div>
        <p className="eyebrow">Public site control</p>
        <h2 id="countdown-manager-title">Next event countdown</h2>
        <p>
          Feature a future public event on the homepage. The event must be
          published before its countdown can appear.
        </p>
      </div>

      {canManage ? (
        <form onSubmit={saveCountdown} aria-describedby="event-countdown-guide">
          <p className="admin-form-guide" id="event-countdown-guide">
            Use the exact event name and start time from Event details. The
            time below is shown in Nairobi time, whatever your device settings.
          </p>
          <label>
            Event name
            <input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              required
            />
          </label>
          <label>
            City
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              required
            />
          </label>
          <label>
            Date and time
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              required
            />
          </label>
          <label className="publish-control">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
            />
            <span>Publish on the landing page</span>
          </label>
          {isPublished && initialSettings?.is_published &&
          Date.parse(initialSettings.starts_at) <= Date.now() ? (
            <p className="manager-message" role="status">
              The previous date has passed, so the homepage hides this countdown.
              Choose a future published event or turn it off.
            </p>
          ) : null}
          <button
            className="button button-primary"
            disabled={saving}
            type="submit"
          >
            {saving ? "Saving…" : "Save countdown"}
          </button>
          {message ? (
            <p className="manager-message" role="status">
              {message}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="manager-message">
          Only super admins and event staff can change the public countdown.
        </p>
      )}
    </section>
  );
}
