"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";

export type PilotCancellation = { event_id: string; event_title: string; host_name: string | null; reason: string; cancelled_at: string; review_status: string; review_note: string | null };

export function PilotEventCancellation({ eventId, title, items = [], admin = false }: { eventId?: string; title?: string; items?: PilotCancellation[]; admin?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function act(id: string, decision?: string) {
    const answer = await ask({
      title: decision ? "Review this cancellation" : `Cancel ${title}?`,
      confirmLabel: decision === "accepted" ? "Accept cancellation" : decision ? "Reject · request new plan" : "Cancel event and notify guests",
      tone: decision ? "default" : "danger",
      description: decision ? "The event stays cancelled. No tickets are restored. The Host receives your note and must arrange fresh bookings for any replacement event." : "Bookings stop immediately. Your reason is sent to registered guests according to their notification settings, and Admin is informed. Tickets will not be restored automatically.",
      fields: [{ name: "note", label: decision ? "Your note to the Host" : "Tell guests why the event is cancelled", type: "textarea", required: true, minLength: decision ? 10 : 20, maxLength: 800 }],
    });
    if (!answer) return;
    setBusy(true); setMessage("");
    try {
      const note = String(answer.note).trim();
      const result = decision ? await supabase.rpc("review_pilot_event_cancellation", { p_event_id: id, p_decision: decision, p_note: note }) : await supabase.rpc("manage_event_lifecycle", { p_event_id: id, p_action: "cancel", p_reason: note, p_member_message: note });
      if (result.error) throw result.error;
      setMessage(decision ? "Review saved. The Host’s notification is queued." : "Event cancelled. Guest notifications are queued and Admin has been informed.");
      router.refresh();
    } catch (error) { setMessage(memberErrorMessage(error, decision ? "review this cancellation" : "cancel this event")); }
    finally { setBusy(false); }
  }
  if (!eventId && !items.length) return null;
  return <section className="host-workspace-panel"><h2>{eventId ? "Need to cancel?" : admin ? "Host cancellations" : "Your event is cancelled"}</h2><p>The event record stays available. Any replacement event needs fresh attendee bookings.</p>{eventId ? <button className="button button-outline danger-action" disabled={busy} type="button" onClick={() => void act(eventId)}>Cancel event</button> : null}{items.map(item => <article className="event-free-booking-control" key={item.event_id}><div><h3>{item.event_title}</h3>{admin ? <p>Host: {item.host_name || "Member"}</p> : null}<p>{item.reason}</p><small>{item.review_status === "pending" ? "Waiting for Admin review" : item.review_status === "accepted" ? "Cancellation accepted" : "Admin has requested a new plan"}</small>{item.review_note ? <p>Admin’s note: {item.review_note}</p> : null}</div>{admin && item.review_status === "pending" ? <div><button className="button button-outline" disabled={busy} type="button" onClick={() => void act(item.event_id,"accepted")}>Accept cancellation</button><button className="button button-outline" disabled={busy} type="button" onClick={() => void act(item.event_id,"reopening_requested")}>Reject · request new plan</button></div> : null}</article>)}{message ? <p role="status">{message}</p> : null}{dialog}</section>;
}
