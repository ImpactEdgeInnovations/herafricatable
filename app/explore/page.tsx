import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Tool = {
  description: string;
  flag?: string;
  href: string;
  label: string;
  requiresActive?: boolean;
};

const groups: { description: string; label: string; tools: Tool[] }[] = [
  {
    label: "Connect and contribute",
    description: "Share value and find smaller spaces built around trust.",
    tools: [
      {
        label: "Asks & Offers",
        href: "/opportunities",
        description: "Ask for something specific or offer practical help.",
        requiresActive: true,
      },
      {
        label: "Communities",
        href: "/communities",
        description: "Join focused spaces with clear hosts and boundaries.",
        flag: "communities",
        requiresActive: true,
      },
      {
        label: "Circles",
        href: "/circles",
        description: "Meet a small guided peer group for a defined season.",
        flag: "circles",
        requiresActive: true,
      },
    ],
  },
  {
    label: "Learn and invite",
    description: "Learn, invite someone you trust and use member benefits.",
    tools: [
      {
        label: "Learning studio",
        href: "/learning",
        description: "Build practical skills through curated courses.",
        flag: "learning",
        requiresActive: true,
      },
      {
        label: "Partner benefits",
        href: "/perks",
        description: "Access useful offers with transparent terms.",
        flag: "partner_perks",
        requiresActive: true,
      },
      {
        label: "Member invitations",
        href: "/referrals",
        description: "Recommend a woman you know and trust.",
        flag: "referrals",
        requiresActive: true,
      },
    ],
  },
  {
    label: "Your account",
    description: "Keep your access, preferences and private support in one place.",
    tools: [
      {
        label: "Membership",
        href: "/membership",
        description: "Review your standing, plans and renewal history.",
        flag: "memberships",
      },
      {
        label: "Account settings",
        href: "/settings",
        description: "Control notifications, privacy and availability.",
      },
      {
        label: "Private support",
        href: "/support",
        description: "Ask the team for help and keep replies together.",
      },
    ],
  },
];

export default async function ExplorePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: flags, error: flagError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("access_status")
        .eq("id", user.id)
        .maybeSingle(),
      supabase.from("feature_flags").select("key,enabled"),
    ]);
  if (!profile || !["active", "dormant"].includes(profile.access_status)) {
    redirect("/home");
  }

  const enabledFlags = new Set(
    (flags ?? []).filter((flag) => flag.enabled).map((flag) => flag.key),
  );
  const isActive = profile.access_status === "active";
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      tools: group.tools.filter(
        (tool) =>
          (!tool.requiresActive || isActive) &&
          (!tool.flag || enabledFlags.has(tool.flag)),
      ),
    }))
    .filter((group) => group.tools.length > 0);

  return (
    <main className="member-explore-page">
      <MemberHeader active="explore" label="More" />
      <section className="member-explore-hero">
        <div>
          <p className="eyebrow">More from your membership</p>
          <h1>What would you like to do?</h1>
        </div>
        <p>
          Connect, learn, invite someone or get private help. Only available
          areas appear here.
        </p>
      </section>

      {flagError ? (
        <section className="admin-empty network-error" role="alert">
          <strong>Member tools are temporarily unavailable</strong>
          <p>No account setting has changed. Try again shortly or contact support.</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/explore">Try again</Link>
            <Link className="button button-outline" href="/support">Contact support</Link>
          </div>
        </section>
      ) : (
        <div className="member-explore-groups">
          {visibleGroups.map((group) => (
            <section key={group.label}>
              <header>
                <h2>{group.label}</h2>
                <p>{group.description}</p>
              </header>
              <div>
                {group.tools.map((tool) => {
                  const content = (
                    <>
                      <strong>{tool.label}</strong>
                      <p>{tool.description}</p>
                      <small>Go there →</small>
                    </>
                  );
                  return <Link href={tool.href} key={tool.href}>{content}</Link>;
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
