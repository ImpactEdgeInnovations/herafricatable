import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MembershipApplicationForm,
  type MembershipApplication,
} from "@/components/onboarding/membership-application-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/admin")) return null;
  return value;
}

export default async function MembershipApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextHref = safeNext(next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/apply");

  const [profileResult, intakeResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("access_status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.rpc("get_membership_intake_mode"),
  ]);
  const profile = profileResult.data;
  const intakeMode =
    intakeResult.data === "closed" ||
    intakeResult.data === "trusted_auto" ||
    intakeResult.data === "manual_review"
      ? intakeResult.data
      : "manual_review";

  if (profile?.access_status === "onboarding") {
    redirect(
      nextHref ? `/onboarding?next=${encodeURIComponent(nextHref)}` : "/onboarding",
    );
  }
  if (profile && ["active", "dormant", "suspended"].includes(profile.access_status)) {
    redirect(nextHref ?? "/home");
  }

  const applicationResult = await supabase
    .from("membership_applications")
    .select(
      "display_name,city,country,professional_focus,reason,referral_source,referred_by,status,submitted_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // Keep the existing pending-member journey available until the migration has
  // been applied in this environment.
  if (applicationResult.error) redirect("/home");

  if (intakeMode === "closed" && !applicationResult.data) {
    return (
      <main className="membership-application-page">
        <header className="application-page-nav">
          <Link className="brand" href="/">
            <span className="brand-mark" aria-hidden="true">H</span>
            <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
          </Link>
          <span>Membership requests</span>
        </header>
        <section className="membership-intake-paused">
          <span className="application-complete-mark" aria-hidden="true">H</span>
          <p className="eyebrow">A carefully held table</p>
          <h1>New membership requests are taking a short pause.</h1>
          <p>
            We are giving current introductions and welcomes our full attention.
            Your verified account is safe, and you can return here when requests reopen.
          </p>
          <div className="portal-actions">
            <Link className="button button-primary" href="/events">Explore gatherings</Link>
            <Link className="button button-outline" href="/">Return home</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="membership-application-page">
      <header className="application-page-nav">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>Her Africa Table<small>Meet. Connect. Rise.</small></span>
        </Link>
        <span>Private membership request</span>
      </header>
      <div className="membership-application-shell">
        <aside className="application-welcome">
          <p className="eyebrow">A considered community</p>
          <h2>Every seat begins with intention.</h2>
          <p>
            We ask a few thoughtful questions so introductions remain useful,
            respectful and grounded in genuine shared purpose.
          </p>
          <blockquote>
            “The strongest tables are built with care—not simply filled.”
          </blockquote>
          <small>Your answers are visible only to the membership team.</small>
        </aside>
        <MembershipApplicationForm
          email={user.email ?? ""}
          initial={applicationResult.data as MembershipApplication | null}
          intakeMode={intakeMode}
          nextHref={nextHref}
        />
      </div>
    </main>
  );
}
