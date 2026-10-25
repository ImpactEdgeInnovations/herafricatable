"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrollableTabs } from "@/components/ui/scrollable-tabs";

export type CommunityArea =
  | "overview"
  | "conversations"
  | "gatherings"
  | "media"
  | "people";

const areas: { key: CommunityArea; label: string }[] = [
  { key: "conversations", label: "Conversations" },
  { key: "gatherings", label: "Meetups" },
  { key: "media", label: "Photos" },
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
  const router = useRouter();
  return (
    <nav className="community-local-navigation" aria-label="Inside this Community">
      <label className="community-mobile-menu">
        <span>Community menu</span>
        <select value={active} onChange={event => router.push(`/communities/${slug}?view=${event.target.value}`)}>
          <option value="overview">Home</option>
          {areas.map(area => <option key={area.key} value={area.key}>{area.label}</option>)}
        </select>
      </label>
      <ScrollableTabs className="community-local-tabs" label="Community sections" activeKey={active}>
        {areas.map((area) => (
          <Link
            aria-label={area.key === "media" ? "Photos and videos" : undefined}
            aria-current={active === area.key ? "page" : undefined}
            href={`/communities/${slug}?view=${area.key}`}
            key={area.key}
          >
            {area.label}
          </Link>
        ))}
      </ScrollableTabs>
      <div className="community-local-more">
        <Link className="community-overview-link" aria-current={active === "overview" ? "page" : undefined} href={`/communities/${slug}?view=overview`}>Home</Link>
        {canManage ? (
          <Link href={`/communities/${slug}/host`}>Host tools</Link>
        ) : null}
      </div>
    </nav>
  );
}
