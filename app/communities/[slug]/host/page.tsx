import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MemberHeader } from "@/components/member/member-header";
import type { CommunitySummary } from "@/components/member/community-directory";
import {
  CommunityCommercePanel,
  type CommunityHostBilling,
  type CommunityHostCommerce,
  type CommunityHostPlanOption,
} from "@/components/member/community-commerce-panel";
import {
  CommunityHostWorkspace,
  type CommunityContinuitySummary,
  type CommunityHostHealth,
  type CommunityHostMember,
  type CommunityIntroductionFollowup,
  type CommunityOutcomeTrend,
  type CommunityProgrammingOption,
} from "@/components/member/community-host-workspace";

export const dynamic = "force-dynamic";

export default async function CommunityHostPage({
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

  const communitiesResult = await supabase.rpc("list_communities");
  const community = (
    (communitiesResult.data as CommunitySummary[] | null) ?? []
  ).find((item) => item.slug === slug);

  if (!community) notFound();
  if (
    community.membership_status !== "active" ||
    !["owner", "moderator"].includes(community.membership_role ?? "")
  ) {
    redirect(`/communities/${slug}`);
  }

  const [
    healthResult,
    memberResult,
    programmingResult,
    continuityResult,
    introductionResult,
    outcomeResult,
    commerceResult,
    hostPlanResult,
    hostBillingResult,
  ] = await Promise.all([
    supabase.rpc("get_community_host_health", {
      p_community_id: community.community_id,
    }),
    supabase.rpc("list_community_members", {
      p_community_id: community.community_id,
    }),
    supabase.rpc("list_community_programming_options", {
      p_community_id: community.community_id,
    }),
    supabase.rpc("get_community_continuity_summary", {
      p_community_id: community.community_id,
    }),
    supabase.rpc("list_community_introduction_followups", {
      p_community_id: community.community_id,
    }),
    supabase.rpc("list_community_outcome_trends", {
      p_community_id: community.community_id,
    }),
    community.membership_role === "owner"
      ? supabase.rpc("get_community_host_commerce", {
          p_community_id: community.community_id,
        })
      : Promise.resolve({ data: [], error: null }),
    community.membership_role === "owner"
      ? supabase
          .from("community_host_plans")
          .select(
            "id,name,description,price_minor,currency,duration_months,platform_fee_bps,max_moderators,features",
          )
          .eq("status", "published")
          .gt("price_minor", 0)
          .order("price_minor")
      : Promise.resolve({ data: [], error: null }),
    community.membership_role === "owner"
      ? supabase.rpc("get_community_host_billing", {
          p_community_id: community.community_id,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const migrationReady =
    !healthResult.error && !memberResult.error && !programmingResult.error;
  const continuityReady =
    !continuityResult.error && !introductionResult.error && !outcomeResult.error;
  const health = (
    (healthResult.data as CommunityHostHealth[] | null) ?? []
  )[0] ?? null;
  const continuity = (
    (continuityResult.data as CommunityContinuitySummary[] | null) ?? []
  )[0] ?? null;
  const hostBilling = (
    (hostBillingResult.data as CommunityHostBilling[] | null) ?? []
  )[0] ?? null;

  return (
    <main className="community-page community-host-page">
      <MemberHeader active="community" label={`${community.name} · Host`} />
      <section className="community-host-hero">
        <div>
          <p className="eyebrow">Private host workspace</p>
          <h1>Steward the room,<br />not the noise.</h1>
          <p>
            Make careful admission decisions, notice where members need support,
            and connect only the programming that serves this community.
          </p>
          <Link href={`/communities/${slug}`}>← Return to community</Link>
        </div>
        <aside>
          <span>Your role</span>
          <strong>{community.membership_role}</strong>
          <small>Every access and programming change is audited.</small>
        </aside>
      </section>
      <nav className="community-room-navigation" aria-label="Host workspace areas">
        <a href="#continuity">Continuity</a>
        <a href="#admissions">Admissions</a>
        <a href="#people">People</a>
        <a href="#gatherings">Gatherings</a>
        <a href="#resources">Resources</a>
        {community.membership_role === "owner" ? (
          <a href="#commerce">Commerce</a>
        ) : null}
      </nav>
      {community.membership_role === "owner" ? (
        <CommunityCommercePanel
          billing={hostBilling}
          billingReady={
            !hostPlanResult.error &&
            !hostBillingResult.error &&
            Number.isInteger(hostBilling?.grace_days)
          }
          commerce={
            ((commerceResult.data as CommunityHostCommerce[] | null) ?? [])[0] ??
            null
          }
          communityId={community.community_id}
          migrationReady={!commerceResult.error}
          plans={
            (hostPlanResult.data as CommunityHostPlanOption[] | null) ?? []
          }
        />
      ) : null}
      <CommunityHostWorkspace
        communityId={community.community_id}
        continuity={continuity}
        continuityReady={continuityReady}
        health={health}
        introductionFollowups={
          (introductionResult.data as CommunityIntroductionFollowup[] | null) ??
          []
        }
        members={(memberResult.data as CommunityHostMember[] | null) ?? []}
        migrationReady={migrationReady}
        options={
          (programmingResult.data as CommunityProgrammingOption[] | null) ?? []
        }
        outcomeTrends={
          (outcomeResult.data as CommunityOutcomeTrend[] | null) ?? []
        }
      />
    </main>
  );
}
