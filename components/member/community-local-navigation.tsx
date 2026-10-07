"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export type CommunityArea =
  | "overview"
  | "conversations"
  | "gatherings"
  | "people";

const areas: { key: CommunityArea; label: string }[] = [
  { key: "overview", label: "Home" },
  { key: "conversations", label: "Conversations" },
  { key: "gatherings", label: "Gatherings" },
  { key: "people", label: "People" },
];

export function CommunityLocalNavigation({
  active,
  canManage,
  slug,
}: {
  active: CommunityArea;
  canManage: boolean;
  slug: string;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = tabs.current;
    const selected = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!container || !selected) return;
    // Scroll only the local tab strip, never the page or member's feed position.
    const bounds = container.getBoundingClientRect();
    const selectedBounds = selected.getBoundingClientRect();
    if (selectedBounds.left < bounds.left) {
      container.scrollLeft = container.scrollLeft + selectedBounds.left - bounds.left;
    } else if (selectedBounds.right > bounds.right) {
      container.scrollLeft = container.scrollLeft + selectedBounds.right - bounds.right;
    }
  }, [active]);
  return (
    <nav className="community-local-navigation" aria-label="Inside this Community">
      <div className="community-local-tabs" ref={tabs}>
        {areas.map((area) => (
          <Link
            aria-current={active === area.key ? "page" : undefined}
            href={`/communities/${slug}?view=${area.key}`}
            key={area.key}
          >
            {area.label}
          </Link>
        ))}
      </div>
      <div className="community-local-more">
        {canManage ? (
          <Link href={`/communities/${slug}/host`}>Host tools</Link>
        ) : null}
      </div>
    </nav>
  );
}
