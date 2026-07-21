import Link from "next/link";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: accessProfile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!accessProfile || !["onboarding", "active"].includes(accessProfile.access_status)) {
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

  const [profileResult, privateResult, interestsResult, goalsResult] = await Promise.all([
    supabase.from("profiles").select("display_name, job_title, company, industry, country, city, languages, bio, business_name, website_url, referral_source, avatar_path, avatar_url, profile_completion").eq("id", user.id).maybeSingle(),
    supabase.from("profile_private").select("phone, whatsapp_number, linkedin_url, instagram_url, share_phone_with_connections").eq("user_id", user.id).maybeSingle(),
    supabase.from("profile_interests").select("interest").eq("user_id", user.id),
    supabase.from("member_goals").select("goal_key").eq("user_id", user.id),
  ]);

  if (profileResult.error || privateResult.error || interestsResult.error || goalsResult.error || !profileResult.data) {
    return (
      <main className="portal-page">
        <section className="portal-card">
          <p className="eyebrow">Database update required</p>
          <h1>Onboarding v2 is ready.</h1>
          <p>Apply <code>20260721120000_onboarding_v2.sql</code> in the Supabase SQL Editor, then reload this page. Your existing onboarding migration remains unchanged.</p>
          <div className="portal-actions"><Link className="button button-primary" href="/admin">Return to admin</Link><Link className="button button-outline" href="/home">View status</Link></div>
        </section>
      </main>
    );
  }

  const profile = profileResult.data;
  const privateProfile = privateResult.data;
  if (accessProfile.access_status === "active" && profile.profile_completion === 100) redirect("/home");

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
      <OnboardingForm email={user.email ?? ""} userId={user.id} initial={{
        display_name: profile.display_name,
        job_title: profile.job_title,
        company: profile.company,
        industry: profile.industry,
        country: profile.country,
        city: profile.city,
        languages: profile.languages ?? [],
        bio: profile.bio,
        business_name: profile.business_name,
        website_url: profile.website_url,
        referral_source: profile.referral_source,
        avatar_path: profile.avatar_path,
        avatar_url: profile.avatar_url,
        profile_completion: profile.profile_completion ?? 0,
        phone: privateProfile?.phone ?? null,
        whatsapp_number: privateProfile?.whatsapp_number ?? null,
        linkedin_url: privateProfile?.linkedin_url ?? null,
        instagram_url: privateProfile?.instagram_url ?? null,
        share_phone_with_connections: privateProfile?.share_phone_with_connections ?? false,
        interests: interestsResult.data?.map((row) => row.interest) ?? [],
        goals: goalsResult.data?.map((row) => row.goal_key) ?? [],
      }} />
    </main>
  );
}
