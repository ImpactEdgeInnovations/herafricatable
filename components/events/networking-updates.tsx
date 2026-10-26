"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./networking-updates.module.css";

export type NetworkingUpdatesData = {
  server_now: string;
  live: { event_id: string; slug: string; title: string; ends_at: string; timezone: string }[];
  recent: { event_id: string; slug: string; title: string; ends_at: string; timezone: string; people_met: number }[];
};

export function NetworkingUpdatesView({ data, dismissed, onDismiss, showRecent }: {
  data: NetworkingUpdatesData; dismissed: string[]; onDismiss: (id: string) => void; showRecent: boolean;
}) {
  const live = data.live.filter(e => !dismissed.includes(`${e.event_id}:${e.ends_at}`));
  if (!live.length && (!showRecent || !data.recent.length)) return null;
  return <aside className={styles.updates} aria-label="Your event networking">
    {live.map(e => <div className={styles.live} key={e.event_id}><span className={styles.dot} aria-hidden="true"/><div className={styles.copy}><strong>Networking is live</strong><p>{e.title} · Ends {new Intl.DateTimeFormat("en-KE", { hour:"numeric", minute:"2-digit", timeZone:e.timezone }).format(new Date(e.ends_at))}</p><small>You’re checked in. Joining is optional.</small></div><div className={styles.liveActions}><a href={`/events/${encodeURIComponent(e.slug)}#event-networking`}>Open networking <span aria-hidden="true">→</span></a><button type="button" onClick={() => onDismiss(`${e.event_id}:${e.ends_at}`)}>Not now</button></div></div>)}
    {showRecent && data.recent.length ? <details className={styles.recent}><summary>People you met <span>Recent events</span></summary><p>Revisit completed introductions from the last 14 days. Connections are always your choice.</p><ul>{data.recent.map(e => <li key={e.event_id}><div><strong>{e.title}</strong><small>{e.people_met} {e.people_met === 1 ? "person" : "people"} · {new Intl.DateTimeFormat("en-KE", { day:"numeric", month:"short", timeZone:e.timezone }).format(new Date(e.ends_at))}</small></div><a href={`/events/${encodeURIComponent(e.slug)}#event-networking`}>View introductions <span aria-hidden="true">→</span></a></li>)}</ul></details> : null}
  </aside>;
}

export function NetworkingUpdates() {
  const supabase = useMemo(() => createClient(), []);
  const path = usePathname();
  const [data, setData] = useState<NetworkingUpdatesData | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const alive = useRef(true), reading = useRef(false);
  const eventPage = path.startsWith("/events/");
  const refresh = useCallback(async () => {
    if (reading.current) return;
    reading.current = true;
    try {
      const response = await supabase.rpc("get_my_networking_updates");
      if (response.error || !response.data?.server_now) throw response.error ?? new Error("Unavailable");
      if (alive.current) setData(response.data as NetworkingUpdatesData);
    } catch { if (alive.current) setData(null); }
    finally { reading.current = false; }
  }, [supabase]);
  useEffect(() => {
    alive.current = true;
    if (eventPage) return () => { alive.current = false; };
    void refresh();
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    const resume = () => { if (!document.hidden) { setData(null); void refresh(); } };
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume);
    return () => { alive.current = false; clearInterval(interval); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); };
  }, [eventPage, refresh]);
  return !eventPage && data ? <NetworkingUpdatesView data={data} dismissed={dismissed} onDismiss={id => setDismissed(old => [...old,id])} showRecent={path === "/home" || path === "/events"} /> : null;
}
