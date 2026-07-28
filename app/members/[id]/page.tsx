import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import { MemberProfileActions } from "@/components/member/member-profile-actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MemberProfile = {
  avatar_url: string | null;
  bio: string | null;
  business_name: string | null;
  city: string | null;
  company: string | null;
  connection_direction: string | null;
  connection_id: string | null;
  connection_status: string | null;
  country: string | null;
  display_name: string;
  goals: string[];
  industry: string | null;
  instagram_url: string | null;
  interests: string[];
  job_title: string | null;
  languages: string[];
  linkedin_url: string | null;
  phone: string | null;
  user_id: string;
  website_url: string | null;
  whatsapp_number: string | null;
};

const goalLabels: Record<string, string> = {
  be_mentored: "Find a mentor",
  build_business: "Build a business",
  find_clients: "Find clients or collaborators",
  invest: "Invest or find investment",
  learn: "Learn and grow",
  make_friends: "Build meaningful friendships",
  mentor: "Mentor other women",
  shop_african_brands: "Discover African brands",
  travel: "Connect through travel",
};

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/members/${id}`)}`);
  if (id === user.id) redirect("/profile");

  const { data, error } = await supabase.rpc("get_member_profile", {
    p_member_id: id,
  });
  const profile = (data as MemberProfile[] | null)?.[0] ?? null;

  if (!error && !profile) notFound();
  if (error) {
    return (
      <main className="member-profile-page">
        <MemberHeader active="members" label="Member profile" />
        <section className="admin-empty network-error" role="alert">
          <strong>This member profile is temporarily unavailable</strong>
          <p>
            Return to discovery and try again, or contact support if the problem
            continues.
          </p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/network">
              Return to members
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if (!profile) notFound();

  const [{ data: introductionNote }, { data: isSaved }] = await Promise.all([
    supabase.rpc("get_connection_introduction", { p_member_id: id }),
    supabase.rpc("is_member_profile_saved", { p_member_id: id }),
  ]);
  const location = [profile.city, profile.country].filter(Boolean).join(", ");
  const accepted = profile.connection_status === "accepted";

  return (
    <main className="member-profile-page">
      <MemberHeader active="members" label="Member profile" />
      <section className="member-profile-hero">
        <Link href="/network">← Back to members</Link>
        <div>
          <div className="member-profile-photo">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" />
            ) : (
              <span>{profile.display_name.slice(0, 1)}</span>
            )}
          </div>
          <div className="member-profile-intro">
            <p className="eyebrow">{location || "Her Africa Table member"}</p>
            <h1>{profile.display_name}</h1>
            <strong>
              {[profile.job_title, profile.company].filter(Boolean).join(" · ")}
            </strong>
            {profile.bio ? <p>{profile.bio}</p> : null}
            <MemberProfileActions
              connectionDirection={profile.connection_direction}
              connectionId={profile.connection_id}
              introductionNote={(introductionNote as string | null) ?? null}
              isSaved={Boolean(isSaved)}
              connectionStatus={profile.connection_status}
              memberId={profile.user_id}
            />
          </div>
        </div>
      </section>

      <section className="member-profile-context">
        <article>
          <p className="eyebrow">Professional context</p>
          <dl>
            {profile.industry ? (
              <div>
                <dt>Industry</dt>
                <dd>{profile.industry}</dd>
              </div>
            ) : null}
            {profile.business_name ? (
              <div>
                <dt>Business</dt>
                <dd>{profile.business_name}</dd>
              </div>
            ) : null}
            {profile.website_url ? (
              <div>
                <dt>Website</dt>
                <dd>
                  <a
                    href={profile.website_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Visit website ↗
                  </a>
                </dd>
              </div>
            ) : null}
            {profile.languages.length ? (
              <div>
                <dt>Languages</dt>
                <dd>{profile.languages.join(", ")}</dd>
              </div>
            ) : null}
          </dl>
        </article>
        <article>
          <p className="eyebrow">At the table for</p>
          <div className="member-profile-tags">
            {profile.goals.map((goal) => (
              <span key={goal}>{goalLabels[goal] ?? goal}</span>
            ))}
          </div>
          {profile.interests.length ? (
            <>
              <p className="eyebrow member-profile-interest-label">
                Interests
              </p>
              <div className="member-profile-tags is-muted">
                {profile.interests.map((interest) => (
                  <span key={interest}>{interest}</span>
                ))}
              </div>
            </>
          ) : null}
        </article>
      </section>

      <section className="member-profile-contact">
        <div>
          <p className="eyebrow">Private by design</p>
          <h2>
            {accepted ? "Contact shared with you." : "Connection comes first."}
          </h2>
          <p>
            {accepted
              ? "These details are visible because this connection is mutually accepted. Phone and WhatsApp appear only when she has chosen to share them."
              : "Private contact details and messaging remain closed until she accepts your connection request."}
          </p>
        </div>
        {accepted ? (
          <div className="member-profile-contact-links">
            {profile.linkedin_url ? (
              <a href={profile.linkedin_url} rel="noreferrer" target="_blank">
                LinkedIn ↗
              </a>
            ) : null}
            {profile.instagram_url ? (
              <a href={profile.instagram_url} rel="noreferrer" target="_blank">
                Instagram ↗
              </a>
            ) : null}
            {profile.phone ? <a href={`tel:${profile.phone}`}>Call</a> : null}
            {profile.whatsapp_number ? (
              <a
                href={`https://wa.me/${profile.whatsapp_number.replace(/\D/g, "")}`}
                rel="noreferrer"
                target="_blank"
              >
                WhatsApp ↗
              </a>
            ) : null}
            {!profile.linkedin_url &&
            !profile.instagram_url &&
            !profile.phone &&
            !profile.whatsapp_number ? (
              <span>No contact channels have been shared.</span>
            ) : null}
          </div>
        ) : (
          <span className="member-profile-lock">Mutual consent required</span>
        )}
      </section>
    </main>
  );
}
