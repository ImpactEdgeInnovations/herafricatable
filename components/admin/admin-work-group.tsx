"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function AdminWorkGroup({
  children,
  defaultOpen = false,
  description,
  id,
  label,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  id: string;
  label: string;
  title: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (defaultOpen && detailsRef.current) {
      detailsRef.current.open = true;
    }

    function revealTarget() {
      const hash = window.location.hash.slice(1);
      if (!hash || !detailsRef.current) return;
      const target = document.getElementById(hash);
      if (hash === id || (target && detailsRef.current.contains(target))) {
        detailsRef.current.open = true;
      }
    }

    revealTarget();
    window.addEventListener("hashchange", revealTarget);
    return () => window.removeEventListener("hashchange", revealTarget);
  }, [defaultOpen, id]);

  return (
    <details className="admin-work-group" id={id} ref={detailsRef}>
      <summary>
        <span className="admin-work-group-index" aria-hidden="true">
          +
        </span>
        <div>
          <p className="eyebrow">{label}</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="admin-work-group-action">
          <span className="when-closed">Open this area</span>
          <span className="when-open">Close this area</span>
        </span>
      </summary>
      <div className="admin-work-group-content">{children}</div>
    </details>
  );
}
