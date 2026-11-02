"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEventLiveRead } from "./use-event-live-read";
import styles from "./event-day.module.css";

type AttendancePlan = { status: string; note: string; updated_at: string | null; can_edit: boolean };
export function EventAttendancePlan({ eventId }: { eventId: string }) {
  const client = useMemo(() => createClient(), []);
  const { data, error, refresh } = useEventLiveRead<AttendancePlan>("get_my_event_attendance_plan", { p_event_id: eventId });
  const [choice, setChoice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const lock = useRef(false);
  async function save(status: string) {
    if (lock.current || !data?.can_edit) return;
    lock.current = true; setBusy(true); setFeedback("");
    try {
      const result = await client.rpc("set_my_event_attendance_plan", { p_event_id: eventId, p_status: status, p_note: status === "as_planned" ? "" : note.trim() });
      if (result.error) throw result.error;
      setChoice(""); setNote(""); refresh();
      setFeedback("Your update is saved for the Host. Your booking and ticket have not changed.");
    } catch { setFeedback("Your update could not be confirmed. Please refresh to check before trying again. Your note is still here."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className={styles.plan} aria-labelledby="attendance-plan-title"><div><p className={styles.eyebrow}>Keep your Host informed</p><h2 id="attendance-plan-title">Has your plan changed?</h2><p>A quick update helps the event team. Only you, the Host and authorised event Admin can see your note—not check-in helpers.</p></div>
    {error ? <p role="alert">{error} <button type="button" onClick={refresh}>Try again</button></p> : !data ? <p role="status">Checking your attendance update…</p> : <>
      <p className={styles.planStatus}>{data.status === "running_late" ? "You told the Host you’re running late." : data.status === "not_attending" ? "You told the Host you can’t attend." : "You’re planning to attend."}</p>
      {!data.can_edit ? <p>Arrival updates are closed or your arrival is already recorded. Contact the Host if you need help.</p> : <>
        <div className={styles.planActions}><button type="button" disabled={busy} aria-pressed={choice === "running_late"} onClick={() => {setChoice("running_late"); setNote(data.note); setFeedback("");}}>I’m running late</button><button type="button" disabled={busy} aria-pressed={choice === "not_attending"} onClick={() => {setChoice("not_attending"); setNote(data.note); setFeedback("");}}>I can’t attend</button>{data.status !== "as_planned" ? <button className={styles.textButton} type="button" disabled={busy} onClick={() => void save("as_planned")}>I’m attending as planned</button> : null}</div>
        {choice ? <form className={styles.planForm} onSubmit={e => {e.preventDefault(); void save(choice);}}><label>Note for the Host (optional)<textarea maxLength={280} rows={2} value={note} disabled={busy} onChange={e => setNote(e.target.value)} placeholder={choice === "running_late" ? "For example: I expect to arrive at 6:30 pm." : "Anything useful for the Host. No private details needed."}/></label><p className={styles.hint}>This does not cancel your place, release it to someone else or request a refund. To change a booking, use “Manage my place”.</p><div className={styles.planActions}><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Send update to Host"}</button><button type="button" disabled={busy} onClick={() => setChoice("")}>Not now</button></div></form> : null}
      </>}
    </>}
    {feedback ? <p role="status" className={styles.feedback}>{feedback}</p> : null}
  </section>;
}
