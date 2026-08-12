import Link from "next/link";

export type CommunityArea =
  | "overview"
  | "conversations"
  | "gatherings"
  | "people";

const areas: { key: CommunityArea; label: string }[] = [
  { key: "overview", label: "Overview" },
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
  return (
    <nav className="community-local-navigation" aria-label="Inside this Community">
      <div>
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
        <Link href={`/communities/${slug}/about`}>About</Link>
        {canManage ? <Link href={`/communities/${slug}/host`}>Host tools</Link> : null}
      </div>
    </nav>
  );
}
