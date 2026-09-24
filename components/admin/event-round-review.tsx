"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import type { EventRoundPlan } from "@/components/events/event-round-host";

export function EventRoundReview({ eventId }: { eventId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [rounds, setRounds] = useState<EventRoundPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { setOpen(false); setEnabled(null); setRounds([]); setMessage(""); }, [eventId]);

  async function load() {
    setLoading(true);
    const [setting, plan] = await Promise.all([
      supabase.rpc("get_event_round_enabled", { p_event_id: eventId }),
      supabase.rpc("get_event_round_plan", { p_event_id: eventId }),
    ]);
    setLoading(false);
    if (setting.error || plan.error) setMessage(adminErrorMessage(setting.error ?? plan.error, "load table rounds"));
    else { setEnabled(Boolean(setting.data)); setRounds((plan.data as EventRoundPlan[] | null) ?? []); setMessage(""); }
  }
  async function changeAvailability() {
    const opening = !enabled;
    if (!await ask({
      title: opening ? "Invite confirmed guests to table rounds?" : "Pause table rounds?",
      description: opening ? "Guests can opt in. Hosts may see only opted-in names and discussion notes. Rehearse privacy, capacity and blocked-pair checks before opening." : "Guests will no longer see schedules and new opt-ins will stop. Event passes remain valid.",
      confirmLabel: opening ? "Open table rounds" : "Pause table rounds",
      tone: opening ? "default" : "danger",
    })) return;
    setBusy(true);
    const result = await supabase.rpc("set_event_round_enabled", { p_event_id: eventId, p_enabled: opening });
    setBusy(false);
    setMessage(result.error ? adminErrorMessage(result.error, "change table availability") : opening ? "Confirmed guests may now opt in." : "Table rounds are paused for guests.");
    if (!result.error) await load();
  }
  async function review(round: EventRoundPlan, action: "approve" | "request_changes" | "pause" | "restore") {
    const response = await ask({
      title: action === "approve" ? `Approve ${round.title}?` : action === "request_changes" ? `Send ${round.title} back?` : action === "pause" ? `Pause ${round.title}?` : `Restore ${round.title}?`,
      description: action === "approve" ? "Each opted-in guest will receive a private schedule. Check timing, table sizes and safety first." : action === "request_changes" ? "The Host will receive your private note, adjust the table plan and resubmit." : action === "pause" ? "The schedule disappears for guests immediately; the event team can restore it later." : "Eligibility and blocked pairs will be checked again before schedules return.",
      confirmLabel: action === "approve" ? "Approve and notify guests" : action === "request_changes" ? "Send back" : action === "pause" ? "Pause round" : "Restore round",
      tone: action === "pause" ? "danger" : "default",
      fields: ["request_changes", "pause"].includes(action) ? [{ name: "note", label: "Private reason", type: "textarea", required: true, minLength: 10, maxLength: 500 }] : [],
    });
    if (!response) return;
    setBusy(true);
    const result = await supabase.rpc("review_event_round", {
      p_round_id: round.id, p_action: action, p_note: String(response.note ?? ""),
    });
    setBusy(false);
    setMessage(result.error ? adminErrorMessage(result.error, "review this table round") : "Table round updated. The private plan reflects your decision.");
    if (!result.error) await load();
  }

  return <div className="event-intro-admin-safety"><details open={open} onToggle={(event) => {
    if (event.target !== event.currentTarget) return;
    const next = event.currentTarget.open;
    setOpen(next);
    if (next && !loading) void load();
  }}><summary>Table conversations and private schedules</summary>
    <p>Off by default. Confirmed guests must opt in before the Host can include them. Admin approves each plan; no table place changes membership or the entry pass.</p>
    {enabled !== null ? <div className="event-intro-setting"><strong>{enabled ? "Open for guest opt-in" : "Not open yet"}</strong><button className="button button-outline" type="button" disabled={busy} onClick={() => void changeAvailability()}>{enabled ? "Pause table rounds" : "Open table rounds"}</button></div> : null}
    {loading ? <p role="status">Loading private plans…</p> : rounds.length ? <ul>{rounds.map((round) => <li key={round.id}><div><strong>{round.title}</strong><small>{round.status.replaceAll("_", " ")} · {round.tables.length} table{round.tables.length === 1 ? "" : "s"} · {round.tables.reduce((sum, table) => sum + table.seats.length, 0)} guests</small><p>{round.prompt}</p>{round.review_note ? <p>Review note: {round.review_note}</p> : null}<details><summary>See table plan</summary>{round.tables.map((table) => <p key={table.id}><strong>{table.label}</strong> ({table.seats.length}/{table.capacity}): {table.seats.map((seat) => seat.display_name).join(", ") || "No one seated"}</p>)}</details></div><div className="portal-actions">{round.status === "submitted" ? <><button className="button button-primary" disabled={busy} type="button" onClick={() => void review(round, "approve")}>Approve</button><button className="button button-outline" disabled={busy} type="button" onClick={() => void review(round, "request_changes")}>Ask for changes</button></> : null}{round.status === "approved" ? <button className="button button-outline" disabled={busy} type="button" onClick={() => void review(round, "pause")}>Pause</button> : null}{round.status === "paused" ? <><button className="button button-outline" disabled={busy} type="button" onClick={() => void review(round, "restore")}>Restore</button><button className="button button-outline" disabled={busy} type="button" onClick={() => void review(round, "request_changes")}>Ask Host to replan</button></> : null}</div></li>)}</ul> : <p>No Host table plans have been submitted yet.</p>}
    {message ? <p role="status">{message}</p> : null}
  </details>{dialog}</div>;
}
