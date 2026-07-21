import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, job_title, company, industry, country, bio, access_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.access_status === "active") redirect("/home");

  if (profile?.access_status !== "onboarding") {
    return (
      <main className="portal-page">
        <section className="portal-card">
          <p className="eyebrow">Membership review</p>
          <h1>Your seat is being prepared.</h1>
          <p>Your identity is confirmed, but onboarding opens after your registration or administrator approval is recorded.</p>
          <div className="portal-actions"><Link className="button button-primary" href="/home">View status</Link><Link className="button button-outline" href="/">Return home</Link></div>
        </section>
      </main>
    );
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>
        <span>Member onboarding</span>
      </header>
      <section className="onboarding-intro">
        <p className="eyebrow">Welcome to the table</p>
        <h1>Introduce yourself<br />with intention.</h1>
        <p>Your profile is the beginning of every thoughtful introduction. Complete it once; it travels with you across every Her Africa Table event.</p>
      </section>
      <OnboardingForm email={user.email ?? ""} initialProfile={{
        display_name: profile.display_name,
        job_title: profile.job_title,
        company: profile.company,
        industry: profile.industry,
        country: profile.country,
        bio: profile.bio,
      }} />
    </main>
  );
}
