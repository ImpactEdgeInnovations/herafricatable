"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Foreground-only, bounded reads. Never replace a failed read with zero counts.
// Each query owns its abort controller, so an older search cannot win a race.
export function useEventLiveRead<T>(name: string, args: Record<string, unknown>) {
  const client = useMemo(() => createClient(), []);
  const key = JSON.stringify(args);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [age, setAge] = useState<number | null>(null);
  useEffect(() => {
    let active = true, pending = false, sampled = 0, rerun = false;
    let controller: AbortController | null = null;
    setData(null); setAge(null); setError("");
    const read = async () => {
      if (!active || pending || document.hidden) return;
      if (!navigator.onLine) { setData(null); setError("You’re offline. Reconnect to see the latest update."); return; }
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15000);
      try {
        const result = await client.rpc(name, JSON.parse(key)).abortSignal(controller.signal);
        if (!active) return;
        if (result.error || result.data == null) throw new Error("Read unavailable");
        sampled = performance.now(); setAge(0); setData(result.data as T); setError("");
      } catch {
        if (active) { setData(null); setAge(null); setError("The latest update could not load. Please try again."); }
      } finally { clearTimeout(timeout); pending = false; if (rerun && active) { rerun = false; void read(); } }
    };
    const resume = () => {
      controller?.abort();
      setData(null); setAge(null);
      if (!document.hidden) {
        // The aborted request releases its lock in finally; retry once then.
        if (pending) rerun = true; else void read();
      }
    };
    const offline = () => { controller?.abort(); setData(null); setAge(null); setError("You’re offline. Reconnect to see the latest update."); };
    void read();
    const poll = setInterval(() => void read(), 10000);
    const clock = setInterval(() => {
      if (!sampled || document.hidden) return;
      const seconds = Math.floor((performance.now() - sampled) / 1000);
      setAge(seconds);
      if (seconds > 45) { setData(null); setError("Live updates have paused. Please refresh before relying on these figures."); }
    }, 1000);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume); window.addEventListener("online", resume); window.addEventListener("offline", offline);
    return () => {
      active = false; controller?.abort(); clearInterval(poll); clearInterval(clock);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume); window.removeEventListener("online", resume); window.removeEventListener("offline", offline);
    };
  }, [client, name, key, revision]);
  return { data, error, age, refresh: () => setRevision(v => v + 1) };
}
