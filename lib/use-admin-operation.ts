"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { adminErrorMessage } from "@/lib/admin-error";

/** One decision at a time, including its confirmation dialog. No automatic retry. */
export function useAdminOperation<T extends string | boolean | null>(
  idle: T,
  pending: T,
  setMessage: Dispatch<SetStateAction<string>>,
  clearDraft?: (key: string) => void,
) {
  const active = useRef<{ key: string; saved: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  const [value, setBusy] = useState<T>(idle);

  function markSaved() {
    if (!active.current) return;
    active.current.saved = true;
    clearDraft?.(active.current.key);
  }

  async function runAdminAction(key: string, action: () => Promise<unknown>) {
    if (active.current) return;
    active.current = { key, saved: false };
    setRunning(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      if (active.current.saved) {
        setMessage((current) => `${current || "Your change was saved."} This view could not update. Refresh before doing anything else.`);
      } else {
        setMessage(`${adminErrorMessage(error, "confirm this change")} Refresh to check its current status before trying again.`);
      }
    } finally {
      active.current = null;
      setBusy(idle);
      setRunning(false);
    }
  }

  return {
    // Existing handlers may clear their row indicator before a refresh finishes.
    // Keep every decision disabled until the entire operation actually settles.
    busy: running && !value ? pending : value,
    setBusy,
    runAdminAction,
    markSaved,
  };
}
