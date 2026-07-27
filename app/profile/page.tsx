import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ProfileEditor,
  type EditableMemberProfile,
} from "@/components/member/profile-editor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [profileResult, privateResult, interestsResult, goalsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "access_status, display_name, avatar_url, job_title, company, industry, country, city, languages, bio, business_name, website_url",
        )
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("profile_private")
        .select(
          "phone, whatsapp_number, linkedin_url, instagram_url, share_phone_with_connections",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profile_interests")
        .select("interest")
        .eq("user_id", user.id),
      supabase
        .from("member_goals")
        .select("goal_key")
        .eq("user_id", user.id),
    ]);

  if (!profileResult.error && profileResult.data?.access_status !== "active")
    redirect("/home");

  const profile = profileResult.data;
  if (!profile) {
    return (
      <main className="profile-page">
        <header className="member-home-header">
          <Link className="brand" href="/home">
            <span className="brand-mark">H</span>
            <span>
              Her Africa Table<small>Your profile</small>
            </span>
          </Link>
        </header>
        <section className="admin-empty network-error" role="alert">
          <strong>Your profile could not be loaded</strong>
          <p>Please try again or contact support if the problem continues.</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/profile">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      </main>
    );
  }
  const privateProfile = privateResult.data;
  const initial: EditableMemberProfile = {
    avatar_url: profile.avatar_url,
    bio: profile.bio,
    business_name: profile.business_name,
    city: profile.city,
    company: profile.company,
    country: profile.country,
    display_name: profile.display_name,
    goals: goalsResult.data?.map((row) => row.goal_key) ?? [],
    industry: profile.industry,
    instagram_url: privateProfile?.instagram_url ?? null,
    interests: interestsResult.data?.map((row) => row.interest) ?? [],
    job_title: profile.job_title,
    languages: profile.languages ?? [],
    linkedin_url: privateProfile?.linkedin_url ?? null,
    phone: privateProfile?.phone ?? null,
    share_phone_with_connections:
      privateProfile?.share_phone_with_connections ?? false,
    website_url: profile.website_url,
    whatsapp_number: privateProfile?.whatsapp_number ?? null,
  };

  return (
    <main className="profile-page">
      <header className="member-home-header">
        <Link className="brand" href="/home">
          <span className="brand-mark">H</span>
          <span>
            Her Africa Table<small>Your profile</small>
          </span>
        </Link>
        <nav aria-label="Profile navigation">
          <Link href="/home">Member home</Link>
          <Link href="/network">Members</Link>
          <Link href="/settings">Account</Link>
        </nav>
      </header>
      {profileResult.error ||
      privateResult.error ||
      interestsResult.error ||
      goalsResult.error ? (
        <section className="admin-empty network-error" role="alert">
          <strong>Your profile could not be loaded</strong>
          <p>Please try again or contact support if the problem continues.</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/profile">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <ProfileEditor email={user.email ?? ""} initial={initial} userId={user.id} />
      )}
    </main>
  );
}
