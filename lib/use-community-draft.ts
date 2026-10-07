"use client";
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { communityDraftEpoch, readCommunityDraft, removeCommunityDraft, writeCommunityDraft } from "./community-drafts";

export function useCommunityDraft<T>(key: string, initial: T | (() => T)) {
  const resolve = () => typeof initial === "function" ? (initial as () => T)() : initial;
  const baseline = useRef({ key, value: resolve() });
  if (baseline.current.key !== key) baseline.current = { key, value: resolve() };
  const [state, setState] = useState(() => ({ key, value: baseline.current.value }));
  const [restored, setRestored] = useState(false);
  const current = useRef({ key, value: baseline.current.value, epoch: communityDraftEpoch() });
  const value = state.key === key ? state.value : baseline.current.value;
  current.current.key = key; current.current.value = value;
  useEffect(() => {
    const saved = readCommunityDraft<T>(key);
    setRestored(saved !== undefined);
    current.current = { key, value: saved ?? baseline.current.value, epoch: communityDraftEpoch() };
    setState({ key, value: current.current.value });
  }, [key]);
  const setValue: Dispatch<SetStateAction<T>> = useCallback(next => {
    const previous = current.current.key === key ? current.current.value : baseline.current.value;
    const updated = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
    current.current = { key, value: updated, epoch: communityDraftEpoch() };
    if (JSON.stringify(updated) === JSON.stringify(baseline.current.value)) removeCommunityDraft(key);
    else writeCommunityDraft(key, updated);
    setState({ key, value: updated });
  }, [key]);
  const clear = useCallback((next?: T) => {
    const updated = next === undefined ? baseline.current.value : next;
    baseline.current = { key, value: updated };
    removeCommunityDraft(key); current.current = { key, value: updated, epoch: communityDraftEpoch() };
    setState({ key, value: updated }); setRestored(false);
  }, [key]);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (current.current.epoch === communityDraftEpoch()
        && JSON.stringify(current.current.value) !== JSON.stringify(baseline.current.value)) {
        event.preventDefault(); event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [key]);
  return [value, setValue, clear, restored] as const;
}
