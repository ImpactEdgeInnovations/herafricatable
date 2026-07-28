import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { memberErrorMessage } from "@/lib/member-error";
import {
  CommunityFeed,
  type CommunityPost,
} from "@/components/member/community-feed";
import {
  CohortActivation,
  type CohortIntroduction,
  type CohortRoom,
} from "@/components/member/cohort-activation";
import type { CommunitySummary } from "@/components/member/community-directory";
import { MemberHeader } from "@/components/member/member-header";
export const dynamic = "force-dynamic";
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "communities")
    .maybeSingle();
  if (!flag?.enabled) redirect("/communities");
  const communitiesResult = await supabase.rpc("list_communities");
  const community = (
    (communitiesResult.data as CommunitySummary[] | null) ?? []
  ).find((item) => item.slug === slug);
  if (!community) notFound();
  if (community.membership_status !== "active") redirect("/communities");
  const [postsResult, cohortResult, introductionResult] = await Promise.all([
    supabase.rpc("list_community_posts", {
      p_community_id: community.community_id,
      p_limit: 30,
      p_offset: 0,
    }),
    supabase.rpc("get_community_cohort", {
      p_community_id: community.community_id,
    }),
    supabase.rpc("list_community_introductions", {
      p_community_id: community.community_id,
    }),
  ]);
  const cohort = ((cohortResult.data as CohortRoom[] | null) ?? [])[0];
  return (
    <main className="community-page">
      <MemberHeader label={community.name} />
      <section className="community-room-hero">
        <div>
          <p className="eyebrow">{community.community_type} community</p>
          <h1>{community.name}</h1>
          <p>{community.description}</p>
          <Link href="/communities">← All communities</Link>
        </div>
        <span>{community.member_count} members</span>
      </section>
      {cohort ? (
        <CohortActivation
          currentUserId={user.id}
          introductions={
            (introductionResult.data as CohortIntroduction[] | null) ?? []
          }
          room={cohort}
        />
      ) : null}
      {postsResult.error ? (
        <section className="admin-empty opportunity-error" role="alert">
          <strong>Community feed unavailable</strong>
          <p>{memberErrorMessage(postsResult.error, "load this community")}</p>
          <div className="journey-state-actions">
            <Link
              className="button button-primary"
              href={`/communities/${slug}`}
            >
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <CommunityFeed
          communityId={community.community_id}
          currentUserId={user.id}
          initialPosts={(postsResult.data as CommunityPost[] | null) ?? []}
          prompt={
            cohort
              ? "Continue the table with one focused Ask, Offer or follow-up"
              : undefined
          }
          readOnly={cohort?.cohort_status === "read_only"}
        />
      )}
    </main>
  );
}
