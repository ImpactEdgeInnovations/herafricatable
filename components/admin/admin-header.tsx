import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export type AdminRole = "super_admin" | "event_staff" | "moderator";

type AdminDestination =
  | "cohort"
  | "delivery"
  | "events"
  | "invitations"
  | "members"
  | "operations"
  | "privacy"
  | "safety"
  | "support"
  | "today";

type NavigationItem = {
  href: string;
  key: AdminDestination;
  label: string;
  shortLabel: string;
};

function AdminIcon({ destination }: { destination: AdminDestination | "member" }) {
  const paths = {
    cohort: (
      <>
        <circle cx="8" cy="9" r="3" />
        <circle cx="16" cy="9" r="3" />
        <path d="M3 20c.5-3.8 2.2-5.5 5-5.5s4.5 1.7 5 5.5M11 20c.5-3.8 2.2-5.5 5-5.5s4.5 1.7 5 5.5" />
      </>
    ),
    delivery: (
      <>
        <path d="M4 6h16v12H4z" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    events: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </>
    ),
    invitations: (
      <>
        <path d="M4 7h16v11H4z" />
        <path d="m4 8 8 6 8-6M18 3v5M15.5 5.5h5" />
      </>
    ),
    member: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" />
      </>
    ),
    members: (
      <>
        <circle cx="9" cy="8" r="3" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M3 20c.7-4.2 2.8-6 6-6s5.3 1.8 6 6M15 15c3.4-.8 5.4.9 6 4" />
      </>
    ),
    operations: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="8" cy="7" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="10" cy="17" r="1.5" />
      </>
    ),
    privacy: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    safety: (
      <>
        <path d="M12 3 5 6v5c0 5 2.7 8.2 7 10 4.3-1.8 7-5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    support: (
      <>
        <path d="M5 14v-2a7 7 0 0 1 14 0v2" />
        <path d="M5 13H3v5h4v-5H5ZM19 13h2v5h-4v-5h2ZM17 19c-1 1.3-2.7 2-5 2" />
      </>
    ),
    today: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[destination]}
    </svg>
  );
}

export async function AdminHeader({
  active,
  label,
  role,
}: {
  active: AdminDestination;
  label: string;
  role: AdminRole;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const betaExpiry =
    typeof user?.user_metadata?.beta_admin_expires_at === "string"
      ? new Date(user.user_metadata.beta_admin_expires_at)
      : null;
  const hasBetaExpiry = Boolean(
    betaExpiry && !Number.isNaN(betaExpiry.getTime()),
  );
  const canManageEvents = role === "super_admin" || role === "event_staff";
  const canModerate = role === "super_admin" || role === "moderator";
  const primary: NavigationItem[] = [
    { href: "/admin", key: "today", label: "Today", shortLabel: "Today" },
    ...(role === "super_admin"
      ? [
          {
            href: "/admin/members",
            key: "members" as const,
            label: "Members",
            shortLabel: "People",
          },
        ]
      : []),
    ...(canManageEvents
      ? [
          {
            href: "/admin/events",
            key: "events" as const,
            label: "Events",
            shortLabel: "Events",
          },
        ]
      : []),
    ...(canModerate
      ? [
          {
            href: "/admin/safety",
            key: "safety" as const,
            label: "Safety",
            shortLabel: "Safety",
          },
        ]
      : []),
    {
      href: "/admin/operations",
      key: "operations",
      label: "All tools",
      shortLabel: "Tools",
    },
  ];
  const services: NavigationItem[] =
    role === "super_admin"
      ? [
          {
            href: "/admin/cohort",
            key: "cohort",
            label: "Founding members",
            shortLabel: "Founders",
          },
          {
            href: "/admin/support",
            key: "support",
            label: "Member support",
            shortLabel: "Support",
          },
          {
            href: "/admin/privacy",
            key: "privacy",
            label: "Privacy requests",
            shortLabel: "Privacy",
          },
          {
            href: "/admin/invitations",
            key: "invitations",
            label: "Invitation review",
            shortLabel: "Invites",
          },
          {
            href: "/admin/notifications",
            key: "delivery",
            label: "Message delivery",
            shortLabel: "Delivery",
          },
        ]
      : [];
  const activeServiceItem = services.find((item) => item.key === active);
  const activeService = Boolean(activeServiceItem);
  const mobilePrimary = activeServiceItem
    ? [
        primary[0],
        ...primary.filter((item) => item.key === "members").slice(0, 1),
        primary[primary.length - 1],
        activeServiceItem,
      ]
    : primary.slice(0, 4);
  if (
    !activeServiceItem &&
    !mobilePrimary.some((item) => item.key === "operations")
  ) {
    mobilePrimary[mobilePrimary.length - 1] = primary[primary.length - 1];
  }

  return (
    <>
      <header className="admin-header admin-shell-header">
        <Link className="brand" href="/admin">
          <span className="brand-mark" aria-hidden="true">
            H
          </span>
          <span>
            Her Africa Table<small>{label}</small>
          </span>
        </Link>
        <nav className="admin-primary-nav" aria-label="Admin navigation">
          {primary.map((item) => (
            <Link
              aria-current={active === item.key ? "page" : undefined}
              href={item.href}
              key={item.key}
            >
              {item.label}
            </Link>
          ))}
          {services.length ? (
            <details className="admin-tools-menu">
              <summary className={activeService ? "is-current" : undefined}>
                Admin services
              </summary>
              <div>
                {services.map((item) => (
                  <Link
                    aria-current={active === item.key ? "page" : undefined}
                    href={item.href}
                    key={item.key}
                  >
                    {item.label}
                  </Link>
                ))}
                <Link href="/home">Open member view</Link>
                <Link href="/">View public site</Link>
              </div>
            </details>
          ) : null}
        </nav>
        <div className="admin-session-actions">
          <span className="admin-role">
            {role.replace("_", " ")}
            {hasBetaExpiry ? (
              <small>
                Beta until{" "}
                {new Intl.DateTimeFormat("en-KE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(betaExpiry!)}
              </small>
            ) : null}
          </span>
          <SignOutButton className="admin-sign-out" />
        </div>
      </header>
      <nav
        className="admin-mobile-dock"
        aria-label="Admin shortcuts"
        style={{
          gridTemplateColumns: `repeat(${mobilePrimary.length + 1}, minmax(0, 1fr))`,
        }}
      >
        {mobilePrimary.map((item) => (
          <Link
            aria-current={active === item.key ? "page" : undefined}
            href={item.href}
            key={item.key}
          >
            <AdminIcon destination={item.key} />
            {item.shortLabel}
          </Link>
        ))}
        <Link href="/home">
          <AdminIcon destination="member" />
          Member
        </Link>
      </nav>
    </>
  );
}
