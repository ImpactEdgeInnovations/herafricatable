import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type MemberDestination = "account" | "events" | "home" | "members" | "messages";

const destinations: {
  href: string;
  key: MemberDestination;
  label: string;
  shortLabel: string;
}[] = [
  { href: "/home", key: "home", label: "Home", shortLabel: "Home" },
  { href: "/network", key: "members", label: "Members", shortLabel: "Members" },
  { href: "/events", key: "events", label: "Events", shortLabel: "Events" },
  {
    href: "/messages",
    key: "messages",
    label: "Messages",
    shortLabel: "Messages",
  },
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
    events: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
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
  active?: MemberDestination | "alerts";
  accountHref?: "/profile" | "/settings";
  accountLabel?: "Account" | "My profile";
  label: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: profile }, { count: unreadAlerts }] = user
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
      ])
    : [{ data: null }, { count: 0 }];
  const navigation = destinations.map((destination) =>
    destination.key === "account"
      ? { ...destination, href: accountHref, label: accountLabel }
      : destination,
  );
  const memberName = profile?.display_name?.trim() || "Member";
  const memberInitial = memberName.charAt(0).toUpperCase();
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
              aria-current={active === destination.key ? "page" : undefined}
              className={`member-nav-${destination.key}`}
              href={destination.href}
              key={destination.key}
            >
              {destination.label}
            </Link>
          ))}
        </nav>
        <div className="member-header-actions">
          <Link
            aria-current={active === "alerts" ? "page" : undefined}
            aria-label={
              unreadAlerts
                ? `${unreadAlerts} unread notification${unreadAlerts === 1 ? "" : "s"}`
                : "Notifications"
            }
            className="member-alert-link"
            href="/notifications"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
            <span>Alerts</span>
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
        </div>
      </header>
      <nav className="member-mobile-dock" aria-label="Member shortcuts">
        {navigation.map((destination) => (
          <Link
            aria-current={active === destination.key ? "page" : undefined}
            href={destination.href}
            key={destination.key}
          >
            <MemberIcon destination={destination.key} />
            {destination.shortLabel}
          </Link>
        ))}
      </nav>
    </>
  );
}
