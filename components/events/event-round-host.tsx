"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type EventRoundVolunteer = { user_id: string; display_name: string; interest: string };
export type EventRoundPlan = {
  id: string; title: string; prompt: string; starts_at: string; ends_at: string;
  status: "draft" | "submitted" | "changes_requested" | "approved" | "paused";
  review_note: string | null;
  tables: { id: string; label: string; capacity: number; seats: { user_id: string; display_name: string }[] }[];
};

function localDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function EventRoundHost({ eventId, eventSlug, eventTitle, eventStartsAt,
  eventEndsAt, timeZone, initialPlan, initialVolunteers, initialError }: {
  eventId: string; eventSlug: string; eventTitle: string; eventStartsAt: string;
  eventEndsAt: string; timeZone: string; initialPlan: EventRoundPlan[];
  initialVolunteers: EventRoundVolunteer[]; initialError: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [plan, setPlan] = useState(initialPlan);
  const [volunteers, setVolunteers] = useState(initialVolunteers);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const proposedStart = Math.min(new Date(eventStartsAt).getTime() + 15 * 60_000,
    new Date(eventEndsAt).getTime() - 10 * 60_000);
  const proposedEnd = Math.min(proposedStart + 30 * 60_000,
    new Date(eventEndsAt).getTime());
  const [startsAt, setStartsAt] = useState(localDateTime(new Date(proposedStart).toISOString()));
  const [endsAt, setEndsAt] = useState(localDateTime(new Date(proposedEnd).toISOString()));
  const [tableLabels, setTableLabels] = useState<Record<string, string>>({});
  const [tableCapacities, setTableCapacities] = useState<Record<string, number>>({});
  const [selectedGuests, setSelectedGuests] = useState<Record<string, string>>({});
  const [roundDrafts, setRoundDrafts] = useState<Record<string, { title: string; prompt: string; starts_at: string; ends_at: string }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(initialError);

  async function reload() {
    const [nextPlan, nextVolunteers] = await Promise.all([
      supabase.rpc("get_event_round_plan", { p_event_id: eventId }),
      supabase.rpc("list_event_round_volunteers", { p_event_id: eventId }),
    ]);
    if (nextPlan.error || nextVolunteers.error) {
      setMessage(memberErrorMessage(nextPlan.error ?? nextVolunteers.error, "load table planning"));
    } else {
      setPlan((nextPlan.data as EventRoundPlan[] | null) ?? []);
      setVolunteers((nextVolunteers.data as EventRoundVolunteer[] | null) ?? []);
    }
  }
  async function run(name: string, args: Record<string, unknown>, success: string) {
    setBusy(true);
    setMessage("");
    const result = await supabase.rpc(name, args);
    if (result.error) setMessage(memberErrorMessage(result.error, "update your table plan"));
    else { setMessage(success); await reload(); }
    setBusy(false);
  }
  function saveRound(round?: EventRoundPlan) {
    const draft = round ? roundDrafts[round.id] : null;
    const selectedTitle = draft?.title ?? round?.title ?? title;
    const selectedPrompt = draft?.prompt ?? round?.prompt ?? prompt;
    const selectedStarts = draft?.starts_at ?? round?.starts_at ?? startsAt;
    const selectedEnds = draft?.ends_at ?? round?.ends_at ?? endsAt;
    const start = new Date(selectedStarts);
    const end = new Date(selectedEnds);
    if (selectedTitle.trim().length < 5 || selectedPrompt.trim().length < 10 ||
      Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setMessage("Give the round a name, a short conversation prompt and valid times."); return;
    }
    void run("save_event_round", {
      p_event_id: eventId, p_round_id: round?.id ?? null, p_title: selectedTitle,
      p_prompt: selectedPrompt, p_starts_at: start.toISOString(), p_ends_at: end.toISOString(),
    }, round ? "Round saved privately." : "Round created privately. Add tables and opted-in guests before sending it for review.");
    if (!round) { setTitle(""); setPrompt(""); }
  }
  const editable = (round: EventRoundPlan) => ["draft", "changes_requested"].includes(round.status);
  function editRound(round: EventRoundPlan, key: "title" | "prompt" | "starts_at" | "ends_at", value: string) {
    setRoundDrafts((current) => ({ ...current, [round.id]: {
      title: current[round.id]?.title ?? round.title,
      prompt: current[round.id]?.prompt ?? round.prompt,
      starts_at: current[round.id]?.starts_at ?? localDateTime(round.starts_at),
      ends_at: current[round.id]?.ends_at ?? localDateTime(round.ends_at),
      [key]: value,
    } }));
  }
  async function removeRound(round: EventRoundPlan) {
    if (!await ask({ title: `Remove ${round.title}?`, description: "This private plan and its table places will be deleted. Approved schedules cannot be removed here.", confirmLabel: "Remove draft", tone: "danger" })) return;
    await run("delete_event_round", { p_round_id: round.id }, "Private round removed.");
  }
  async function removeTable(round: EventRoundPlan, table: EventRoundPlan["tables"][number]) {
    if (!await ask({ title: `Remove ${table.label}?`, description: "This will also remove its draft guest places. It will not affect event registrations or passes.", confirmLabel: "Remove table", tone: "danger" })) return;
    await run("remove_event_round_table", { p_round_id: round.id, p_table_id: table.id }, "Private table removed.");
  }
  if (initialError) return <main className="event-intro-page"><header className="legal-header"><Link className="brand" href="/">Her Africa Table</Link><Link href={`/events/${eventSlug}/host`}>Back to your event</Link></header><section className="event-pass-unavailable"><h1>Table planning is not available yet.</h1><p>The event team is preparing this feature. Your event programme and other Host tools still work.</p></section></main>;
  return <main className="event-intro-page">
    <header className="legal-header"><Link className="brand" href="/">Her Africa Table</Link><Link href={`/events/${eventSlug}/host`}>Back to your event</Link></header>
    <div className="event-intro-shell">
      <div className="event-intro-heading"><p className="eyebrow">Private Host planning</p><h1>Small tables, better conversations</h1><p>Plan short table rounds for {eventTitle}. Only confirmed guests who ask to take part appear here. You can see their names and discussion notes—not contact details. The event team reviews your plan before guests see their own schedules.</p></div>
      <section className="event-intro-panel"><h2>Guests who opted in · {volunteers.length}</h2><p>Table rounds must be opened by the event team before guests can opt in. A guest can leave at any time; her seat then disappears.</p>{volunteers.length ? <ul className="event-round-volunteers">{volunteers.map((person) => <li key={person.user_id}><strong>{person.display_name}</strong><span>{person.interest}</span></li>)}</ul> : <p>No guests have opted in yet.</p>}</section>
      <section className="event-intro-panel"><h2>Start a table round</h2><p>Choose 10 to 60 minutes within this event. These times follow your device; guests see {timeZone}.</p><div className="event-round-fields"><label>Round name<input value={title} maxLength={100} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="Founders’ introductions" /></label><label>Conversation starter<textarea value={prompt} maxLength={280} rows={3} disabled={busy} onChange={(event) => setPrompt(event.target.value)} placeholder="What are you building, and who would be useful to meet?" /></label><label>Starts<input type="datetime-local" value={startsAt} disabled={busy} onChange={(event) => setStartsAt(event.target.value)} /></label><label>Ends<input type="datetime-local" value={endsAt} disabled={busy} onChange={(event) => setEndsAt(event.target.value)} /></label></div><button className="button button-primary" disabled={busy || plan.length >= 12} type="button" onClick={() => saveRound()}>Create private round</button></section>
      {plan.map((round) => <section className="event-intro-panel" key={round.id}>
        <div className="event-round-heading"><div><p className="eyebrow">{round.status === "approved" ? "Approved · Private schedules sent" : round.status === "submitted" ? "With the event team" : round.status === "changes_requested" ? "Changes requested" : round.status === "paused" ? "Paused by the event team" : "Private draft"}</p><h2>{round.title}</h2><p>{round.prompt}</p><small>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(round.starts_at))}</small></div></div>
        {round.review_note ? <p role="status"><strong>From the event team:</strong> {round.review_note}</p> : null}
        {editable(round) ? <div className="event-round-fields"><label>Round name<input value={roundDrafts[round.id]?.title ?? round.title} maxLength={100} disabled={busy} onChange={(event) => editRound(round, "title", event.target.value)} /></label><label>Conversation starter<textarea rows={2} value={roundDrafts[round.id]?.prompt ?? round.prompt} maxLength={280} disabled={busy} onChange={(event) => editRound(round, "prompt", event.target.value)} /></label><label>Starts<input type="datetime-local" value={roundDrafts[round.id]?.starts_at ?? localDateTime(round.starts_at)} disabled={busy} onChange={(event) => editRound(round, "starts_at", event.target.value)} /></label><label>Ends<input type="datetime-local" value={roundDrafts[round.id]?.ends_at ?? localDateTime(round.ends_at)} disabled={busy} onChange={(event) => editRound(round, "ends_at", event.target.value)} /></label><button className="button button-outline" disabled={busy} type="button" onClick={() => saveRound(round)}>Save round details</button></div> : null}
        <div className="event-round-tables">{round.tables.map((table) => <article key={table.id}>
          <h3>{table.label} <small>{table.seats.length}/{table.capacity}</small></h3>
          {editable(round) ? <button className="button button-quiet" disabled={busy} type="button" onClick={() => void removeTable(round, table)}>Remove table</button> : null}
          {table.seats.length ? <ul>{table.seats.map((seat) => <li key={seat.user_id}>{seat.display_name}{editable(round) ? <button type="button" disabled={busy} onClick={() => void run("remove_event_round_seat", { p_round_id: round.id, p_user_id: seat.user_id }, "Guest removed from this draft round.")}>Remove</button> : null}</li>)}</ul> : <p>No one seated yet.</p>}
          {editable(round) ? <div className="event-round-add-seat"><label htmlFor={`guest-${table.id}`}>Add a guest</label><select id={`guest-${table.id}`} value={selectedGuests[table.id] ?? ""} disabled={busy || table.seats.length >= table.capacity} onChange={(event) => setSelectedGuests((current) => ({ ...current, [table.id]: event.target.value }))}><option value="">Choose an opted-in guest</option>{volunteers.filter((person) => !round.tables.some((other) => other.seats.some((seat) => seat.user_id === person.user_id))).map((person) => <option value={person.user_id} key={person.user_id}>{person.display_name}</option>)}</select><button className="button button-outline" type="button" disabled={busy || !selectedGuests[table.id]} onClick={() => void run("assign_event_round_seat", { p_round_id: round.id, p_table_id: table.id, p_user_id: selectedGuests[table.id] }, "Guest added to this draft table.")}>Add guest</button></div> : null}
        </article>)}</div>
        {editable(round) ? <div className="event-round-add-table"><label>New table name<input value={tableLabels[round.id] ?? ""} maxLength={60} disabled={busy} onChange={(event) => setTableLabels((current) => ({ ...current, [round.id]: event.target.value }))} placeholder="Table A" /></label><label>Places<select value={tableCapacities[round.id] ?? 4} disabled={busy} onChange={(event) => setTableCapacities((current) => ({ ...current, [round.id]: Number(event.target.value) }))}>{[2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}</select></label><button className="button button-outline" disabled={busy || (tableLabels[round.id] ?? "").trim().length < 2} type="button" onClick={() => void run("save_event_round_table", { p_round_id: round.id, p_table_id: null, p_label: tableLabels[round.id], p_capacity: tableCapacities[round.id] ?? 4 }, "Table added privately.")}>Add table</button></div> : null}
        {editable(round) ? <div className="portal-actions"><button className="button button-primary" disabled={busy || !round.tables.length} type="button" onClick={() => void run("submit_event_round", { p_round_id: round.id }, "Table plan sent to the event team for review.")}>Send plan for review</button><button className="button button-quiet" disabled={busy} type="button" onClick={() => void removeRound(round)}>Remove draft round</button></div> : null}
      </section>)}
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </div>
    {dialog}
  </main>;
}
