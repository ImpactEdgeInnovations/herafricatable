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
    label: "Grow and benefit",
    description: "Use learning, invitations and carefully reviewed benefits.",
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

  return (
    <main className="member-explore-page">
      <MemberHeader label="Explore" />
      <section className="member-explore-hero">
        <div>
          <p className="eyebrow">Your wider membership</p>
          <h1>More ways to use the table.</h1>
        </div>
        <p>
          Start with what is useful today. Areas marked “Preparing” stay
          unavailable until their content, safety and support paths are ready.
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
          {groups.map((group) => (
            <section key={group.label}>
              <header>
                <h2>{group.label}</h2>
                <p>{group.description}</p>
              </header>
              <div>
                {group.tools.map((tool) => {
                  const available =
                    (!tool.requiresActive || isActive) &&
                    (!tool.flag || enabledFlags.has(tool.flag));
                  const content = (
                    <>
                      <span>{available ? "Ready" : "Preparing"}</span>
                      <strong>{tool.label}</strong>
                      <p>{tool.description}</p>
                      <small>{available ? "Open tool →" : "Nothing needed from you"}</small>
                    </>
                  );
                  return available ? (
                    <Link href={tool.href} key={tool.href}>{content}</Link>
                  ) : (
                    <article aria-disabled="true" key={tool.href}>{content}</article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
