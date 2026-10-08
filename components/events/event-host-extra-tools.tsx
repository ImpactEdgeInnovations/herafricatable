"use client";
import { type ReactNode, useEffect, useRef } from "react";

export function EventHostExtraTools({ children }: { children: ReactNode }) {
  const tools = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function openLinkedTool() {
      const id = window.location.hash.slice(1);
      if (!["host-invites", "host-bookings", "host-cancel"].includes(id)) return;
      const panel = tools.current?.querySelector<HTMLDetailsElement>(`details[id="${id}"]`);
      if (!panel) return;
      panel.open = true;
      panel.querySelector("summary")?.focus({ preventScroll: true });
    }
    openLinkedTool();
    window.addEventListener("hashchange", openLinkedTool);
    return () => window.removeEventListener("hashchange", openLinkedTool);
  }, []);
  return <div ref={tools} className="event-host-extra-tools" aria-label="Other event tools">{children}</div>;
}
