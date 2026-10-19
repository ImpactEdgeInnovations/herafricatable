"use client";

import { useEffect, useMemo, useState } from "react";
import { createPosterRecovery } from "@/lib/events/poster-recovery";

export function useEventPoster(source?: string | null) {
  const [, render] = useState(0);
  const recovery = useMemo(() => createPosterRecovery(source, () => render(n => n + 1)), [source]);
  const state = recovery.read();
  const [loaded, setLoaded] = useState("");
  useEffect(() => {
    const resume = () => { if (document.visibilityState === "visible" && navigator.onLine) recovery.resume(); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("online", resume);
    resume();
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("online", resume);
    };
  }, [recovery]);
  useEffect(() => {
    if (!state.attempt || state.failed || loaded === state.url) return;
    const timer = window.setTimeout(() => recovery.timeout(state.url), 20_000);
    return () => window.clearTimeout(timer);
  }, [recovery, state.url, state.attempt, state.failed, loaded]);
  return { ...state, retry: () => recovery.retry(), onError: () => recovery.error(state.url), onLoad: () => setLoaded(state.url) };
}
