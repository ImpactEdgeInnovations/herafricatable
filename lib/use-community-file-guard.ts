"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { communityDraftEpoch } from "./community-drafts";
import type { useActionDialog } from "@/components/ui/action-dialog";

type Guard = {
  ask: ReturnType<typeof useActionDialog>["ask"];
  busy: boolean;
  epoch: number;
  discard: () => void;
  blocked: () => void;
  navigate: (url: URL) => void;
};
const guards = new Map<symbol, Guard>();
let attached = false;
let deciding = false;
const active = () => [...guards.values()].filter(item => item.epoch === communityDraftEpoch());
function unload(event: BeforeUnloadEvent) {
  if (active().length) { event.preventDefault(); event.returnValue = ""; }
}
async function click(event: MouseEvent) {
  const anchor = (event.target as Element)?.closest?.("a");
  const items = active();
  if (!anchor || !items.length || anchor.target === "_blank" || anchor.hasAttribute("download") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return;
  const url = new URL(href, window.location.href);
  if (!["http:", "https:"].includes(url.protocol)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const saving = items.find(item => item.busy);
  if (saving) { saving.blocked(); return; }
  if (deciding) return;
  deciding = true;
  try {
    const accepted = await items[0].ask({ title: "Leave without saving selected files?", description: "Unsaved files cannot be restored after leaving. You will need to choose them again.", confirmLabel: "Leave page", tone: "danger" });
    if (!accepted) return;
    const current = active();
    if (!current.length) return;
    const nowSaving = current.find(item => item.busy);
    if (nowSaving) { nowSaving.blocked(); return; }
    current.forEach(item => item.discard());
    current[0].navigate(url);
  } finally { deciding = false; }
}
function syncListeners() {
  if (guards.size && !attached) {
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    attached = true;
  } else if (!guards.size && attached) {
    window.removeEventListener("beforeunload", unload);
    document.removeEventListener("click", click, true);
    attached = false;
  }
}
export function useCommunityFileGuard(dirty: boolean, options: Omit<Guard, "epoch" | "navigate">) {
  const id = useRef(Symbol("community-files")).current;
  const router = useRouter();
  useEffect(() => {
    if (dirty) guards.set(id, { ...options, epoch: communityDraftEpoch(), navigate: url => {
      if (url.origin === window.location.origin) router.push(url.pathname + url.search + url.hash);
      else window.location.assign(url.href);
    } });
    else guards.delete(id);
    syncListeners();
    return () => { guards.delete(id); syncListeners(); };
  }, [dirty, id, options, router]);
}
