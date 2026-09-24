"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type EventRoundSchedule = {
  round_id: string;
  title: string;
  prompt: string;
  starts_at: string;
  ends_at: string;
  table_label: string;
  tablemates: { name: string; interest: string }[];
};

export function EventRoundAttendee({ eventId, eventSlug, eventTitle, timeZone,
  initialOptedIn, initialInterest, schedule, scheduleError, eventEnded }: {
  eventId: string; eventSlug: string; eventTitle: string; timeZone: string;
  initialOptedIn: boolean; initialInterest: string; schedule: EventRoundSchedule[];
  scheduleError: boolean;
  eventEnded: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [optedIn, setOptedIn] = useState(initialOptedIn);
  const [interest, setInterest] = useState(initialInterest);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(value: boolean) {
    setBusy(true);
    setMessage("");
    const result = await supabase.rpc("save_my_event_round_interest", {
      p_event_id: eventId, p_opted_in: value, p_interest: interest.trim(),
    });
    setBusy(false);
    if (result.error) setMessage(memberErrorMessage(result.error, "save your table choice"));
    else {
      setOptedIn(value);
      setMessage(value ? "You are on the list for a table round. Your table is not confirmed until the event team publishes the plan." : "You have left table rounds. Any table place you had is removed immediately.");
      router.refresh();
    }
  }
  const formatTime = (value: string) => new Intl.DateTimeFormat("en-KE", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone,
  }).format(new Date(value));
  const formatEndTime = (value: string) => new Intl.DateTimeFormat("en-KE", {
    hour: "numeric", minute: "2-digit", timeZone,
  }).format(new Date(value));
  return <main className="event-intro-page">
    <header className="legal-header"><Link className="brand" href="/">Her Africa Table</Link><Link href={`/events/${eventSlug}`}>Back to event</Link></header>
    <div className="event-intro-shell">
      <div className="event-intro-heading"><p className="eyebrow">Optional · For confirmed guests</p><h1>Find your table</h1><p>{eventTitle} may include short, guided conversations with a few other guests. It is your choice to join. This does not share your email or phone number, and it does not join you to the wider member network.</p></div>
      <div className="event-intro-grid">
        <section className="event-intro-panel">
          <h2>Your choice</h2>
          <p>{optedIn ? "You asked to join a table round." : "You have not joined table rounds."} The Host sees your name and the note below only if you opt in. The event team reviews every table plan.</p>
          {eventEnded ? <p>The event has ended. You can review your schedule or leave table rounds, but new requests are closed.</p> : null}
          <label htmlFor="event-round-interest">What would you enjoy discussing?</label>
          <textarea id="event-round-interest" rows={4} maxLength={280} value={interest} disabled={busy || eventEnded} onChange={(event) => setInterest(event.target.value)} placeholder="I would love to meet women building businesses in regional trade." />
          <p className="event-intro-help">10–280 characters when joining. Please leave out contact details and links.</p>
          <div className="portal-actions">{!eventEnded ? <button className="button button-primary" type="button" disabled={busy || interest.trim().length < 10} onClick={() => void save(true)}>{busy ? "Saving…" : optedIn ? "Save my note" : "Join table rounds"}</button> : null}{optedIn ? <button className="button button-outline" type="button" disabled={busy} onClick={() => void save(false)}>Leave table rounds</button> : null}</div>
          {message ? <p className="manager-message" role="status">{message}</p> : null}
        </section>
        <section className="event-intro-panel">
          <h2>Your private schedule</h2>
          {scheduleError ? <p role="alert">We could not load your table schedule. Please refresh this page or contact the event team.</p>
            : !optedIn ? <p>Join only if this feels right for you. You can leave at any time.</p>
            : schedule.length ? <ul className="event-intro-requests">{schedule.map((round) => <li key={round.round_id}><div><strong>{round.title}</strong><span>{formatTime(round.starts_at)} – {formatEndTime(round.ends_at)} · {round.table_label}</span><p>{round.prompt}</p>{round.tablemates.length ? <p>At your table: {round.tablemates.map((person) => person.name).join(", ")}</p> : <p>Your table companions may change before the event.</p>}</div></li>)}</ul>
              : <p>No table has been confirmed yet. We will notify you when the event team approves a plan; your entry pass is unaffected.</p>}
          <p className="event-intro-help">Only people placed at your table can see your name and discussion note in their own schedule. You can report a safety concern to the event team.</p>
        </section>
      </div>
    </div>
  </main>;
}
