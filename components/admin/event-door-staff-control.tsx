"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";

export type DoorStaff = { user_id: string; email: string; display_name: string | null; assigned_at: string };

export function EventDoorStaffControl({ eventId, eventSlug, staff, ready }: {
  eventId: string; eventSlug: string; staff: DoorStaff[]; ready: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function change(address: string, action: "assign" | "remove") {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("manage_event_door_staff", {
      p_event_id: eventId, p_email: address, p_action: action,
    });
    setBusy(false);
    setMessage(error ? adminErrorMessage(error, `${action} door access`) : action === "assign" ? "Door access assigned for this event only." : "Door access removed.");
    if (!error) { setEmail(""); router.refresh(); }
  }

  return <div className="admin-section">
    <p className="eyebrow">Door access</p>
    <h2>Who can welcome guests?</h2>
    <p>This gives a named person only the ability to scan or enter an event pass. It does not show the guest list, payments or event settings.</p>
    {!ready ? <p role="status">Door-only access will be available after the latest database migration is applied.</p> : <>
      <ul>{staff.map((person) => <li key={person.user_id}>
        {person.display_name || person.email} ({person.email}){" "}
        <button className="button button-outline" disabled={busy} onClick={() => void change(person.email, "remove")} type="button">Remove access</button>
      </li>)}</ul>
      {staff.length === 0 ? <p>No check-in lead assigned yet.</p> : null}
      <form onSubmit={(event) => { event.preventDefault(); void change(email.trim(), "assign"); }}>
        <label htmlFor="door-staff-email">Account email</label>
        <input id="door-staff-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
        <button className="button button-primary" disabled={busy || !email.trim()} type="submit">{busy ? "Saving…" : "Give door access"}</button>
      </form>
      <p><Link href={`/events/${eventSlug}/door`}>Open the door screen</Link> — available to the assigned person once the event is published.</p>
    </>}
    {message ? <p role="status">{message}</p> : null}
  </div>;
}
