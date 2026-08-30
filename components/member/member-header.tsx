import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { FloatingTableGuide } from "@/components/member/floating-table-guide";
import { createClient } from "@/lib/supabase/server";

type MemberDestination =
  | "account"
  | "community"
  | "events"
  | "explore"
  | "home"
  | "members"
  | "messages";

type CommunityActivitySummary = {
  new_activity_count: number;
};

type TableGuideAccess = {
  assistant_enabled: boolean;
  feature_enabled: boolean;
  remaining_today: number;
};

const destinations: {
  href: string;
  key: MemberDestination;
  label: string;
  shortLabel: string;
}[] = [
  { href: "/home", key: "home", label: "Home", shortLabel: "Home" },
  {
    href: "/communities",
    key: "community",
    label: "Communities",
    shortLabel: "Community",
  },
  { href: "/network", key: "members", label: "Members", shortLabel: "Members" },
  { href: "/events", key: "events", label: "Events", shortLabel: "Events" },
  {
    href: "/messages",
    key: "messages",
    label: "Messages",
    shortLabel: "Messages",
  },
  { href: "/explore", key: "explore", label: "More", shortLabel: "More" },
  { href: "/profile", key: "account", label: "My profile", shortLabel: "Me" },
];

function MemberIcon({ destination }: { destination: MemberDestination }) {
  const paths = {
    account: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" />
      </>
    ),
    community: (
      <>
        <path d="M4 6.5h16v11H8l-4 3v-14Z" />
        <path d="M8 10h8M8 13.5h5" />
      </>
    ),
    events: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </>
    ),
    explore: (
      <>
        <circle cx="7" cy="7" r="1.5" />
        <circle cx="17" cy="7" r="1.5" />
        <circle cx="7" cy="17" r="1.5" />
        <circle cx="17" cy="17" r="1.5" />
      </>
    ),
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
      </>
    ),
    members: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 20c.7-4.2 2.8-6 6-6s5.3 1.8 6 6M15 15c3.4-.8 5.4.9 6 4" />
      </>
    ),
    messages: (
      <path d="M4 5h16v12H9l-5 4V5Z" />
    ),
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[destination]}
    </svg>
  );
}

export async function MemberHeader({
  active,
  accountHref = "/profile",
  accountLabel = "My profile",
  label,
}: {
  active?: MemberDestination | "alerts" | "guide" | "search";
  accountHref?: "/profile" | "/settings";
  accountLabel?: "Account" | "My profile";
  label: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [
    { data: profile },
    { count: unreadAlerts },
    { data: communityActivity },
    { data: tableGuideFlag },
    { data: tableGuideAccess },
  ] = user
    ? await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .is("read_at", null),
        supabase.rpc("list_my_community_activity"),
        supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "table_guide")
          .maybeSingle(),
        supabase.rpc("get_my_table_guide_access"),
      ])
    : [{ data: null }, { count: 0 }, { data: null }, { data: null }, { data: null }];
  const navigation = destinations.map((destination) =>
    destination.key === "account"
      ? { ...destination, href: accountHref, label: accountLabel }
      : destination,
  );
  const mobileNavigation = navigation.filter(
    (destination) =>
      destination.key !== "account" && destination.key !== "explore",
  );
  const memberName = profile?.display_name?.trim() || "Member";
  const memberInitial = memberName.charAt(0).toUpperCase();
  const guideAccess = ((tableGuideAccess as TableGuideAccess[] | null) ?? [])[0] ?? null;
  const newCommunityActivity = (
    (communityActivity as CommunityActivitySummary[] | null) ?? []
  ).reduce(
    (total, item) => total + Number(item.new_activity_count ?? 0),
    0,
  );
  return (
    <>
      <header className="member-home-header member-shell-header">
        <Link className="brand" href="/home">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            Her Africa Table<small>{label}</small>
          </span>
        </Link>
        <nav aria-label="Member navigation">
          {navigation.map((destination) => (
            <Link
              aria-label={
                destination.key === "community" && newCommunityActivity
                  ? `Community, ${newCommunityActivity} new update${newCommunityActivity === 1 ? "" : "s"}`
                  : destination.label
              }
              aria-current={active === destination.key ? "page" : undefined}
              className={`member-nav-${destination.key}`}
              href={destination.href}
              key={destination.key}
            >
              {destination.label}
              {destination.key === "community" && newCommunityActivity ? (
                <b aria-hidden="true" className="member-community-badge">
                  {newCommunityActivity > 9 ? "9+" : newCommunityActivity}
                </b>
              ) : null}
            </Link>
          ))}
        </nav>
        <div className="member-header-actions">
          {tableGuideFlag?.enabled ? (
            <Link
              aria-current={active === "guide" ? "page" : undefined}
              className="member-guide-link"
              href="/guide"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
              </svg>
              <span>Guide</span>
            </Link>
          ) : null}
          <Link
            aria-current={active === "search" ? "page" : undefined}
            aria-label="Search your table"
            className="member-search-link"
            href="/search"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6" />
              <path d="m16 16 5 5" />
            </svg>
            <span>Search</span>
          </Link>
          <Link
            aria-current={active === "alerts" ? "page" : undefined}
            aria-label={
              unreadAlerts
                ? `${unreadAlerts} unread notification${unreadAlerts === 1 ? "" : "s"}`
                : "Updates"
            }
            className="member-alert-link"
            href="/notifications"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            <span>Updates</span>
            {unreadAlerts ? (
              <b>{unreadAlerts > 9 ? "9+" : unreadAlerts}</b>
            ) : null}
          </Link>
          <Link
            aria-label={`${memberName}, open profile`}
            className="member-account-link"
            href={accountHref}
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              <span aria-hidden="true">{memberInitial}</span>
            )}
          </Link>
          <SignOutButton className="member-sign-out" />
        </div>
      </header>
      <nav className="member-mobile-dock" aria-label="Member shortcuts">
        {mobileNavigation.map((destination) => (
          <Link
            aria-label={
              destination.key === "community" && newCommunityActivity
                ? `Community, ${newCommunityActivity} new update${newCommunityActivity === 1 ? "" : "s"}`
                : destination.shortLabel
            }
            aria-current={active === destination.key ? "page" : undefined}
            href={destination.href}
            key={destination.key}
          >
            <MemberIcon destination={destination.key} />
            {destination.shortLabel}
            {destination.key === "community" && newCommunityActivity ? (
              <b aria-hidden="true" className="member-community-badge">
                {newCommunityActivity > 9 ? "9+" : newCommunityActivity}
              </b>
            ) : null}
          </Link>
        ))}
      </nav>
      {user ? (
        <FloatingTableGuide
          assistantEnabled={guideAccess?.assistant_enabled ?? false}
          featureEnabled={Boolean(guideAccess?.feature_enabled)}
          firstName={memberName.split(/\s+/)[0] || "Member"}
          installed={Boolean(guideAccess)}
          remainingToday={guideAccess?.remaining_today ?? 60}
        />
      ) : null}
    </>
  );
}
