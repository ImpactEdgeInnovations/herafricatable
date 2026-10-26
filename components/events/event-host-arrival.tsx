"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import styles from "./event-host-arrival.module.css";

export type HostArrival = {
  expected: number; arrived: number; total: number; offset: number;
  guests: { user_id: string; name: string; checked_in_at: string | null }[];
  helpers: { name: string; email: string; active: boolean }[];
};

export function EventHostArrival({ eventId, slug, title, timeZone, upcoming }: {
  eventId: string; slug: string; title: string; timeZone: string; upcoming: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [data, setData] = useState<HostArrival | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const query = useRef({ search: "", filter: "all", offset: 0 });
  const request = useRef(0);
  const alive = useRef(true);
  const lock = useRef(false);
  const reading = useRef(false);
  const load = useCallback(async (next = query.current, silent = false) => {
    const token = ++request.current; query.current = next; reading.current = true; if (!silent) setLoading(true); setError("");
    try {
      const result = await supabase.rpc("get_my_event_arrival", { p_event_id: eventId, p_search: next.search, p_filter: next.filter, p_offset: next.offset });
      if (result.error || !result.data) throw result.error ?? new Error("No attendance response");
      if (alive.current && token === request.current) setData(result.data as HostArrival);
    } catch { if (alive.current && token === request.current) { setData(null); setError("We couldn’t load your guest list. Try again before checking attendance."); } }
    finally { if (alive.current && token === request.current) { reading.current = false; setLoading(false); } }
  }, [eventId, supabase]);
  useEffect(() => {
    alive.current = true; void load();
    const timer = setInterval(() => { if (!document.hidden && !lock.current && !reading.current) void load(query.current, true); }, 15000);
    return () => { alive.current = false; ++request.current; clearInterval(timer); };
  }, [load]);

  async function helper(address: string, action: "assign" | "remove") {
    if (lock.current) return;
    if (action === "remove" && !await ask({ title: "Remove this check-in helper?", description: "Her delegated scanner access for this event will end. Attendance already recorded will stay saved.", confirmLabel: "Remove helper", tone: "danger" })) return;
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage("");
    try {
      const result = await supabase.rpc("manage_my_event_door_helper", { p_event_id: eventId, p_email: address.trim(), p_action: action });
      if (result.error) throw result.error;
      if (action === "assign") setEmail("");
      await load();
      setMessage(action === "assign" ? "Helper added. She’ll receive an in-app notification; email follows her notification settings. You can also share the check-in link below." : "Delegated access removed. Any separate access assigned by Admin is managed by Admin.");
    } catch (failure) {
      const domain = failure as { code?: string; message?: string };
      setMessage(domain.code === "P0001" && /^(Use the email of a verified, active member|You already have access as the Host|This event already has ten check-in helpers|Choose an upcoming published event)$/.test(domain.message ?? "") ? domain.message! : memberErrorMessage(failure, "update your check-in helpers"));
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const doorHref = `/events/${encodeURIComponent(slug)}/door`;
  return <section className={styles.panel} aria-labelledby="host-arrival-title">
    <header className={styles.heading}><div><p className={styles.eyebrow}>Guests & check-in</p><h2 id="host-arrival-title">Welcome your guests</h2><p>{title}</p></div><button type="button" className="button button-outline" disabled={loading || busy} onClick={() => void load()}>Refresh</button></header>
    {upcoming ? <div className={styles.scanner}><div><h3>Check passes at the door</h3><p>Scan the guest’s QR pass or enter its private code. This scanner accepts passes for this event only.</p></div><a className="button button-primary" href={doorHref}>Open scanner</a></div> : null}
    {error ? <p className={styles.notice} role="alert">{error}</p> : null}
    {loading ? <p role="status">Updating attendance…</p> : null}
    {data && !loading ? <>
      <div className={styles.counts}><div><strong>{data.expected}</strong><span>Registered</span></div><div><strong>{data.arrived}</strong><span>Arrived</span></div><div><strong>{Math.max(0, data.expected-data.arrived)}</strong><span>Still expected</span></div></div>
      <form className={styles.search} onSubmit={e => { e.preventDefault(); void load({ ...query.current, search, offset: 0 }); }}><label>Find a guest<input value={search} maxLength={100} placeholder="Guest’s name" onChange={e => setSearch(e.target.value)} /></label><button className="button button-outline" disabled={busy}>Search</button></form>
      <div className={styles.filters} aria-label="Guest list filter">{[["all","All guests"],["arrived","Arrived"],["expected","Still expected"]].map(([key,label]) => <button type="button" key={key} aria-pressed={query.current.filter===key} disabled={busy} onClick={() => void load({ ...query.current, filter:key, offset:0 })}>{label}</button>)}</div>
      <ul className={styles.guests}>{data.guests.map(g => <li key={g.user_id}><span className={styles.initial} aria-hidden="true">{g.name.slice(0,1)}</span><strong>{g.name}</strong><span>{g.checked_in_at ? <><small>Arrived</small><time dateTime={g.checked_in_at}>{new Intl.DateTimeFormat("en-KE", { hour:"numeric",minute:"2-digit",timeZone }).format(new Date(g.checked_in_at))}</time></> : "Not arrived"}</span></li>)}</ul>
      {!data.guests.length ? <p>No guests match this view.</p> : null}
      {data.total>25 ? <div className={styles.paging}><button type="button" disabled={busy || data.offset===0} onClick={() => void load({ ...query.current, offset:Math.max(0,data.offset-25) })}>Previous</button><span>{data.offset+1}–{Math.min(data.offset+25,data.total)} of {data.total}</span><button type="button" disabled={busy || data.offset+25>=data.total} onClick={() => void load({ ...query.current, offset:data.offset+25 })}>Next</button></div> : null}
      {upcoming || data.helpers.length>0 ? <details className={styles.helpers}><summary>Your check-in team <span>{data.helpers.length}</span></summary><p>{upcoming ? "Add up to ten verified members. They can scan passes for this event—not see your guest list, payments or Host settings." : "You can remove delegated access after the event. Attendance already recorded stays saved."}</p>
        {upcoming ? <form className={styles.search} onSubmit={e => { e.preventDefault(); void helper(email,"assign"); }}><label>Helper’s sign-in email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label><button className="button button-primary" disabled={busy}>Add helper</button></form> : null}
        <ul className={styles.helperList}>{data.helpers.map(h => <li key={h.email}><div><strong>{h.name || "Check-in helper"}</strong><small>{h.email} · {h.active ? "Access active" : "Access inactive"}</small></div><button type="button" className="button button-outline" disabled={busy} onClick={() => void helper(h.email,"remove")}>Remove</button></li>)}</ul>
        {upcoming ? <><label className={styles.share}>Check-in link to share<input readOnly value={`https://www.herafricatable.com${doorHref}`} onFocus={e => e.currentTarget.select()} /></label><p>Helpers sign in with their own email. Sharing the link alone does not grant access. Admin-appointed staff are managed separately.</p></> : null}
      </details> : null}
    </> : null}
    {message ? <p className={styles.notice} role="status">{message}</p> : null}{dialog}
  </section>;
}
