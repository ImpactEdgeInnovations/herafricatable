"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Scroll this strip only; do not move the page or interrupt the member's place. */
export function ScrollableTabs({ children, label, activeKey, className = "" }: { children: ReactNode; label: string; activeKey: string; className?: string }) {
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ before: false, after: false });
  const update = useCallback(() => {
    const node = strip.current;
    if (node) setEdges({ before: node.scrollLeft > 2, after: node.scrollLeft + node.clientWidth < node.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    const node = strip.current;
    if (!node) return;
    const selected = node.querySelector<HTMLElement>('[aria-current="page"], [aria-selected="true"]');
    function align() {
      if (!node) return;
      if (selected) {
        const bounds = node.getBoundingClientRect();
        const item = selected.getBoundingClientRect();
        if (item.left < bounds.left) node.scrollLeft += item.left - bounds.left;
        else if (item.right > bounds.right) node.scrollLeft += item.right - bounds.right;
      }
      update();
    }
    align();
    // Arrow visibility changes the strip's width. Only update edges here:
    // re-aligning the active tab would undo a person's deliberate scrolling.
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener("resize", align);
    return () => { observer.disconnect(); window.removeEventListener("resize", align); };
  }, [activeKey, update]);
  function move(direction: number) {
    const node = strip.current;
    if (!node) return;
    node.scrollLeft += direction * Math.max(120, node.clientWidth * .7);
    update();
  }
  return <div className={`scrollable-tabs ${className}`} data-overflow={edges.before || edges.after}>
    {edges.before ? <button type="button" className="scrollable-tabs-arrow" aria-label={`Show previous ${label}`} onClick={() => move(-1)}>‹</button> : null}
    <div className="scrollable-tabs-strip" ref={strip} onScroll={update}>{children}</div>
    {edges.after ? <button type="button" className="scrollable-tabs-arrow" aria-label={`Show more ${label}`} onClick={() => move(1)}>›</button> : null}
  </div>;
}
