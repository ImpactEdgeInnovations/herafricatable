"use client";

import { useState, type ReactNode } from "react";
import { useEventLiveRead } from "./use-event-live-read";
import styles from "./event-day.module.css";

export type EventDaySnapshot = {
  server_now: string; confirmed: number; checked_in: number; not_checked_in: number;
  running_late: number; not_attending: number; total: number; offset: number;
  guests: { user_id: string; name: string; checked_in_at: string | null; checked_in_by_name: string | null;
    plan: string; note: string | null; updated_at: string | null }[];
  networking: { status: string; disabled: boolean; starts_at: string; ends_at: string; round_no: number;
    counts: { talking: number; offered: number; waiting: number; away: number } | null } | null;
};

export function EventDayOverview({ eventId, slug, title, timeZone = "Africa/Nairobi", adminTools, scannerAvailable = true, networkingAvailable = true }: {
  eventId: string; slug: string; title: string; timeZone?: string; adminTools?: ReactNode; scannerAvailable?: boolean; networkingAvailable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const { data, error, age, refresh } = useEventLiveRead<EventDaySnapshot>("get_event_day_overview", {
    p_event_id: eventId, p_search: search.trim(), p_filter: filter, p_offset: offset,
  });
  const time = (value: string) => new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
  const session = data?.networking;
  const counts = session?.counts;
  const setGuestFilter = (value: string) => { setFilter(value); setOffset(0); };
  return <section className={styles.day} aria-labelledby="event-day-title">
    <header className={styles.header}><div><p className={styles.eyebrow}>Event day</p><h2 id="event-day-title">{title}</h2><p>Arrivals and networking, in one place.</p></div>
      {scannerAvailable ? <a className="button button-primary" href={`/events/${slug}/door`}>Open scanner</a> : null}</header>
    <div className={styles.freshness}><span>{data ? `Updated ${age ?? 0} seconds ago · Refreshes every 10 seconds` : error ? "Live figures unavailable" : "Checking the latest figures…"}</span><button className={styles.textButton} type="button" onClick={refresh}>Refresh</button></div>
    {error ? <p className={styles.error} role="alert">{error} No figures are shown until we reconnect.</p> : null}
    {data ? <>
      <dl className={styles.metrics}><div><dt>Confirmed guests</dt><dd>{data.confirmed}</dd></div><div><dt>Checked in</dt><dd>{data.checked_in}</dd></div><div><dt>Not checked in</dt><dd>{data.not_checked_in}</dd></div></dl>
      <p className={styles.hint}>Check-in records arrival, not who is still at the venue. “Not checked in” also includes guests who sent an update below.</p>
      <div className={styles.updates}><button type="button" onClick={() => setGuestFilter("running_late")} aria-pressed={filter === "running_late"}><strong>{data.running_late}</strong> running late</button><button type="button" onClick={() => setGuestFilter("not_attending")} aria-pressed={filter === "not_attending"}><strong>{data.not_attending}</strong> can’t attend</button><small>Updates shared privately by guests. Bookings are unchanged.</small></div>
      <section className={styles.network} aria-label="Networking overview"><div className={styles.networkHead}><h3>Networking</h3><span>{!session ? "Not scheduled" : session.disabled ? "Disabled by Admin" : session.status === "running" ? `Round ${session.round_no || 1}` : session.status === "paused" ? "Paused" : session.status === "finished" ? "Finished" : "Scheduled"}</span></div>
        {session ? <p>{time(session.starts_at)}–{time(session.ends_at)}</p> : <p>Set a time when guests can meet someone new.</p>}
        {counts ? <><dl className={styles.networkCounts}><div><dt>In conversations</dt><dd>{counts.talking}</dd></div><div><dt>Awaiting acceptance</dt><dd>{counts.offered}</dd></div><div><dt>Ready to meet</dt><dd>{counts.waiting}</dd></div></dl><p className={styles.hint}>People, not pairs. {counts.away > 0 ? `${counts.away} taking a break, away or deciding what to do next.` : "Both guests must accept before a conversation is counted."}</p></> : session ? <p className={styles.hint}>Live counts appear while networking is running.</p> : null}
        {!adminTools && networkingAvailable ? <a className={styles.textButton} href="#host-networking">Manage networking →</a> : null}
      </section>
    </> : null}
      <section aria-labelledby="event-day-guests"><div className={styles.networkHead}><h3 id="event-day-guests">Guest updates</h3>{!adminTools ? <a className={styles.textButton} href="#host-guests">Check-in team & activity →</a> : null}</div>
        <div className={styles.filters}><label>Find a guest<input type="search" maxLength={100} value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Guest name" /></label><label>Show<select value={filter} onChange={e => setGuestFilter(e.target.value)}><option value="all">All confirmed guests</option><option value="checked_in">Checked in</option><option value="not_checked_in">Not checked in</option><option value="running_late">Running late</option><option value="not_attending">Can’t attend</option></select></label></div>
        {data ? <><div className={styles.guestList} tabIndex={0} aria-label="Guest updates, scroll for more">{data.guests.length ? data.guests.map(guest => <article key={guest.user_id} className={styles.guest}><div><strong>{guest.name}</strong><span>{guest.checked_in_at ? `Checked in ${time(guest.checked_in_at)}${guest.checked_in_by_name ? ` · ${guest.checked_in_by_name}` : ""}` : guest.plan === "running_late" ? "Running late" : guest.plan === "not_attending" ? "Can’t attend" : "Not checked in"}</span></div>{guest.note ? <p><small>Private guest note{guest.updated_at ? ` · ${time(guest.updated_at)}` : ""}</small>{guest.note}</p> : null}</article>) : <p className={styles.empty}>No guests match this view. Try another name or filter.</p>}</div>
        <div className={styles.paging}><span>{data.total ? `${data.offset + 1}–${Math.min(data.offset + 25, data.total)} of ${data.total}` : "0 results"}</span><button type="button" disabled={data.offset === 0} onClick={() => setOffset(Math.max(0, data.offset - 25))}>Previous</button><button type="button" disabled={data.offset + 25 >= data.total} onClick={() => setOffset(data.offset + 25)}>Next</button></div>
        </> : <p role="status">{error ? "Guest updates are unavailable until we reconnect." : "Loading guest updates…"}</p>}
      </section>
    {adminTools}
  </section>;
}
