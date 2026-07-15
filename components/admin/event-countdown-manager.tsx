"use client";

import { FormEvent, useMemo, useState } from "react";
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

function toLocalInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function EventCountdownManager({ canManage, initialSettings, userId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [eventName, setEventName] = useState(initialSettings?.event_name ?? "Her Africa Table — Nairobi");
  const [city, setCity] = useState(initialSettings?.city ?? "Nairobi");
  const [startsAt, setStartsAt] = useState(toLocalInputValue(initialSettings?.starts_at));
  const [isPublished, setIsPublished] = useState(initialSettings?.is_published ?? false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function saveCountdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (!startsAt) {
      setMessage("Choose the event date and time.");
      return;
    }

    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("site_event_countdown").upsert({
      id: true,
      event_name: eventName.trim(),
      city: city.trim(),
      starts_at: new Date(startsAt).toISOString(),
      is_published: isPublished,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });

    setSaving(false);
    setMessage(error
      ? "Could not save. Apply the latest Supabase migration and confirm your admin role."
      : isPublished
        ? "Countdown saved and published."
        : "Countdown saved as hidden.");
  }

  return (
    <section className="countdown-manager" aria-labelledby="countdown-manager-title">
      <div>
        <p className="eyebrow">Public site control</p>
        <h2 id="countdown-manager-title">Next event countdown</h2>
        <p>Set the event name, city, and start time. Keep it hidden until the schedule is ready to publish.</p>
      </div>

      {canManage ? (
        <form onSubmit={saveCountdown}>
          <label>Event name<input value={eventName} onChange={(event) => setEventName(event.target.value)} required /></label>
          <label>City<input value={city} onChange={(event) => setCity(event.target.value)} required /></label>
          <label>Date and time<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></label>
          <label className="publish-control"><input type="checkbox" checked={isPublished} onChange={(event) => setIsPublished(event.target.checked)} /><span>Publish on the landing page</span></label>
          <button className="button button-primary" disabled={saving} type="submit">{saving ? "Saving…" : "Save countdown"}</button>
          {message ? <p className="manager-message" role="status">{message}</p> : null}
        </form>
      ) : (
        <p className="manager-message">Only super admins and event staff can change the public countdown.</p>
      )}
    </section>
  );
}
