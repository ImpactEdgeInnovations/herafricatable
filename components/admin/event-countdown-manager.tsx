"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";

export type CountdownSettings = {
  city: string;
  event_name: string;
  is_published: boolean;
  starts_at: string;
};

export type CountdownCandidate = {
  id: string;
  title: string;
  starts_at: string;
  timezone: string;
  venues: { city: string } | null;
};

type Props = {
  canManage: boolean;
  candidates: CountdownCandidate[];
  candidatesUnavailable: boolean;
  initialSettings: CountdownSettings | null;
  userId: string;
};

export function EventCountdownManager({
  canManage,
  candidates,
  candidatesUnavailable,
  initialSettings,
  userId,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [selectedEventId, setSelectedEventId] = useState(
    candidates.find((candidate) =>
      candidate.title === initialSettings?.event_name &&
      Date.parse(candidate.starts_at) === Date.parse(initialSettings?.starts_at ?? ""),
    )?.id ?? "",
  );
  const [hasCountdown, setHasCountdown] = useState(Boolean(initialSettings));
  const [isPublished, setIsPublished] = useState(
    initialSettings?.is_published ?? false,
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveCountdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (!isPublished && !hasCountdown) {
      setMessage("There is no homepage countdown to hide yet.");
      return;
    }
    if (isPublished && !selectedEventId) {
      setMessage("Choose a published public event first.");
      return;
    }

    setSaving(true);
    setMessage("");
    if (!isPublished) {
      const { error } = await supabase.from("site_event_countdown")
        .update({ is_published: false, updated_by: userId, updated_at: new Date().toISOString() })
        .eq("id", true);
      setSaving(false);
      if (!error) setIsPublished(false);
      setMessage(error ? adminErrorMessage(error, "hide the public countdown") : "Countdown hidden from the homepage.");
      return;
    }

    const matchingEvent = await supabase.from("events")
        .select("id,title,starts_at,timezone,venues(city)")
        .eq("id", selectedEventId)
        .eq("status", "published")
        .eq("audience", "public")
        .gt("starts_at", new Date().toISOString())
        .maybeSingle();
    if (matchingEvent.error || !matchingEvent.data) {
      setSaving(false);
      setMessage(matchingEvent.error
        ? adminErrorMessage(matchingEvent.error, "check the public event")
        : "This event is no longer available. Refresh the page and choose a future published public event.");
      return;
    }
    const { error } = await supabase.from("site_event_countdown").upsert({
      id: true,
      event_name: matchingEvent.data.title,
      city: (Array.isArray(matchingEvent.data.venues)
        ? matchingEvent.data.venues[0]?.city
        : (matchingEvent.data.venues as { city: string } | null)?.city) ?? "Online",
      starts_at: matchingEvent.data.starts_at,
      is_published: true,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);
    if (!error) setHasCountdown(true);
    setMessage(
      error
        ? adminErrorMessage(error, "save the public countdown")
        : "Countdown saved. The public page should update within a minute.",
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
            Choose an event that is already public. Its name and date will be copied automatically.
          </p>
          <label>
            Event
            <select value={selectedEventId} onChange={(event) => setSelectedEventId(event.target.value)}>
              <option value="">Choose a published event</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title} · {new Intl.DateTimeFormat("en-KE", {
                    dateStyle: "medium", timeStyle: "short", timeZone: candidate.timezone || "Africa/Nairobi",
                  }).format(new Date(candidate.starts_at))} · {Array.isArray(candidate.venues)
                    ? (candidate.venues as { city: string }[])[0]?.city ?? "Online"
                    : candidate.venues?.city ?? "Online"}
                </option>
              ))}
            </select>
          </label>
          {candidatesUnavailable ? (
            <p className="manager-message" role="status">The event list could not load. Refresh this page before publishing a countdown.</p>
          ) : candidates.length === 0 ? (
            <p className="manager-message">No future public event is published yet. <Link href="/admin/events">Review events</Link> first.</p>
          ) : null}
          <label className="publish-control">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(event) => setIsPublished(event.target.checked)}
            />
            <span>Publish on the landing page</span>
          </label>
          {initialSettings?.is_published &&
          Date.parse(initialSettings.starts_at) <= Date.now() ? (
            <p className="manager-message" role="status">
              The previous date has passed, so the homepage hides this countdown.
              Choose a future published event or turn it off.
            </p>
          ) : null}
          <button
            className="button button-primary"
            disabled={saving || (isPublished && (candidatesUnavailable || !selectedEventId))}
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
