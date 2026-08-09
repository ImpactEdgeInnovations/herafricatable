import Link from "next/link";
import { redirect } from "next/navigation";
import {
  MembershipApplicationForm,
  type MembershipApplication,
} from "@/components/onboarding/membership-application-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MembershipApplicationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in?next=/apply");

  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_status === "onboarding") redirect("/onboarding");
  if (profile && ["active", "dormant", "suspended"].includes(profile.access_status)) {
    redirect("/home");
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
        />
      </div>
    </main>
  );
}
