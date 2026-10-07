"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Keep forms mounted (and drafts intact) while secondary Host tools are tucked away. */
export function CommunityHostSection({ children, title, id }: { children: ReactNode; title: string; id: string }) {
  const section = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function reveal() {
      const hash = window.location.hash.slice(1);
      const target = hash ? document.getElementById(hash) : null;
      if (section.current && (hash === id || (target && section.current.contains(target)))) {
        section.current.open = true;
        target?.scrollIntoView({ block: "start" });
      }
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [id]);
  return <details ref={section} id={id} className="community-host-section"><summary>{title}<span aria-hidden="true">+</span></summary><div>{children}</div></details>;
}
