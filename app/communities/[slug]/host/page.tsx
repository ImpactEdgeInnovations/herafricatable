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
import {
  CommunityFinancialStatement,
  type CommunityFinancialSummary,
  type CommunitySettlement,
  type CommunityStatementEntry,
} from "@/components/member/community-financial-statement";
import {
  CommunityHostCapabilitiesPanel,
  type CommunityHostCapabilities,
} from "@/components/member/community-host-capabilities";
import {
  CommunityBrandingPanel,
  type CommunityBrandIdentity,
} from "@/components/member/community-branding-panel";
import {
  CommunityCircleHostPanel,
  type CommunityCircleOption,
} from "@/components/member/community-circle-host-panel";
import {
  CommunityPublicProfilePanel,
  type CommunityPublicProfile,
} from "@/components/member/community-public-profile-panel";
import {
  CommunityWelcomeQueue,
  type CommunityWelcomeMember,
} from "@/components/member/community-welcome-queue";

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

  const [capabilityResult, brandingResult, publicProfileResult] = await Promise.all([
    supabase.rpc("get_community_host_capabilities", {
      p_community_id: community.community_id,
    }),
    supabase.rpc("list_community_brand_identities", {
      p_community_id: community.community_id,
    }),
    community.membership_role === "owner"
      ? supabase.rpc("get_community_public_profile_admin", {
          p_community_id: community.community_id,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const capabilities =
    ((capabilityResult.data as CommunityHostCapabilities[] | null) ?? [])[0] ??
    null;
  const brandIdentity =
    ((brandingResult.data as CommunityBrandIdentity[] | null) ?? [])[0] ?? null;
  const publicProfile =
    ((publicProfileResult.data as CommunityPublicProfile[] | null) ?? [])[0] ??
    null;
  const [iconSigned, coverSigned] = await Promise.all([
    brandIdentity?.icon_storage_path
      ? supabase.storage
          .from("community-media")
          .createSignedUrl(brandIdentity.icon_storage_path, 3600)
      : Promise.resolve({ data: null }),
    brandIdentity?.cover_storage_path
      ? supabase.storage
          .from("community-media")
          .createSignedUrl(brandIdentity.cover_storage_path, 3600)
      : Promise.resolve({ data: null }),
  ]);
  const signedBrandIdentity = brandIdentity
    ? {
        ...brandIdentity,
        cover_url: coverSigned.data?.signedUrl ?? null,
        icon_url: iconSigned.data?.signedUrl ?? null,
      }
    : null;
  const loadAdvancedInsights =
    capabilityResult.error || Boolean(capabilities?.advanced_analytics);

  const [
    healthResult,
    memberResult,
    programmingResult,
    circleOptionResult,
    continuityResult,
    introductionResult,
    outcomeResult,
    commerceResult,
    hostPlanResult,
    hostBillingResult,
    financialSummaryResult,
    financialStatementResult,
    settlementResult,
    welcomeQueueResult,
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
    supabase.rpc("list_community_circle_options", {
      p_community_id: community.community_id,
    }),
    loadAdvancedInsights
      ? supabase.rpc("get_community_continuity_summary", {
          p_community_id: community.community_id,
        })
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("list_community_introduction_followups", {
      p_community_id: community.community_id,
    }),
    loadAdvancedInsights
      ? supabase.rpc("list_community_outcome_trends", {
          p_community_id: community.community_id,
        })
      : Promise.resolve({ data: [], error: null }),
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
    community.membership_role === "owner"
      ? supabase.rpc("get_community_financial_summary", {
          p_community_id: community.community_id,
        })
      : Promise.resolve({ data: [], error: null }),
    community.membership_role === "owner"
      ? supabase.rpc("list_community_financial_statement", {
          p_community_id: community.community_id,
          p_limit: 50,
          p_offset: 0,
        })
      : Promise.resolve({ data: [], error: null }),
    community.membership_role === "owner"
      ? supabase.rpc("list_community_settlement_batches", {
          p_community_id: community.community_id,
        })
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("list_community_welcome_queue", {
      p_community_id: community.community_id,
      p_limit: 12,
    }),
  ]);

  const migrationReady =
    !healthResult.error && !memberResult.error && !programmingResult.error;
  const continuityReady =
    !capabilityResult.error &&
    Boolean(capabilities?.advanced_analytics) &&
    !continuityResult.error &&
    !introductionResult.error &&
    !outcomeResult.error;
  const health = (
    (healthResult.data as CommunityHostHealth[] | null) ?? []
  )[0] ?? null;
  const continuity = (
    (continuityResult.data as CommunityContinuitySummary[] | null) ?? []
  )[0] ?? null;
  const hostBilling = (
    (hostBillingResult.data as CommunityHostBilling[] | null) ?? []
  )[0] ?? null;
  const commerce =
    ((commerceResult.data as CommunityHostCommerce[] | null) ?? [])[0] ?? null;
  const financialSummaries =
    (financialSummaryResult.data as CommunityFinancialSummary[] | null) ?? [];
  const primaryFinancialSummary =
    financialSummaries.find(
      (summary) => summary.currency === commerce?.offer_currency,
    ) ?? financialSummaries[0];

  return (
    <main className="community-page community-host-page">
      <MemberHeader active="community" label={`${community.name} · Manage`} />
      <section className="community-host-hero">
        <div>
          <p className="eyebrow">Manage community</p>
          <h1>Lead with clarity<br />and care.</h1>
          <p>
            Review join requests, support members, add events and learning, and
            keep this community safe—all from one private place.
          </p>
          <Link href={`/communities/${slug}`}>← Return to community</Link>
        </div>
        <aside>
          <span>Your access</span>
          <strong>
            {community.membership_role === "owner" ? "Owner" : "Moderator"}
          </strong>
          <small>Important changes are recorded for safety.</small>
        </aside>
      </section>
      <nav className="community-room-navigation" aria-label="Host workspace areas">
        <a href="#host-tools">Plan &amp; tools</a>
        <a href="#welcome">Welcome</a>
        {community.membership_role === "owner" ? (
          <>
            <a href="#identity">Look &amp; feel</a>
            <a href="#public-page">Public page</a>
          </>
        ) : null}
        <a href="#continuity">Member health</a>
        <a href="#admissions">Join requests</a>
        <a href="#people">Members</a>
        <a href="#gatherings">Events</a>
        <a href="#resources">Learning</a>
        <a href="#circle-programming">Circles</a>
        {community.membership_role === "owner" ? (
          <>
            <a href="#commerce">Payments</a>
            <a href="#statement">Earnings</a>
          </>
        ) : null}
      </nav>
      <div id="host-tools">
        <CommunityHostCapabilitiesPanel
          capabilities={capabilities}
          migrationReady={!capabilityResult.error}
          owner={community.membership_role === "owner"}
        />
      </div>
      <CommunityWelcomeQueue
        communityId={community.community_id}
        members={
          (welcomeQueueResult.data as CommunityWelcomeMember[] | null) ?? []
        }
        migrationReady={!welcomeQueueResult.error}
      />
      <CommunityBrandingPanel
        communityId={community.community_id}
        identity={signedBrandIdentity}
        migrationReady={!brandingResult.error}
        owner={community.membership_role === "owner"}
      />
      <CommunityPublicProfilePanel
        communityId={community.community_id}
        communityName={community.name}
        migrationReady={!publicProfileResult.error}
        owner={community.membership_role === "owner"}
        profile={publicProfile}
        slug={community.slug}
        taglineReady={Boolean(brandIdentity?.tagline)}
      />
      <CommunityCircleHostPanel
        communityId={community.community_id}
        migrationReady={!circleOptionResult.error}
        options={
          (circleOptionResult.data as CommunityCircleOption[] | null) ?? []
        }
      />
      {community.membership_role === "owner" ? (
        <CommunityCommercePanel
          billing={hostBilling}
          billingReady={
            !hostPlanResult.error &&
            !hostBillingResult.error &&
            Number.isInteger(hostBilling?.grace_days)
          }
          commerce={
            commerce
              ? {
                  ...commerce,
                  held_minor:
                    primaryFinancialSummary?.available_minor ??
                    commerce.held_minor,
                  settled_minor:
                    primaryFinancialSummary?.settled_minor ??
                    commerce.settled_minor,
                }
              : null
          }
          communityId={community.community_id}
          migrationReady={!commerceResult.error}
          plans={
            (hostPlanResult.data as CommunityHostPlanOption[] | null) ?? []
          }
        />
      ) : null}
      {community.membership_role === "owner" ? (
        <CommunityFinancialStatement
          entries={
            (financialStatementResult.data as
              | CommunityStatementEntry[]
              | null) ?? []
          }
          migrationReady={
            !financialSummaryResult.error &&
            !financialStatementResult.error &&
            !settlementResult.error
          }
          settlements={
            (settlementResult.data as CommunitySettlement[] | null) ?? []
          }
          summaries={financialSummaries}
        />
      ) : null}
      <CommunityHostWorkspace
        communityId={community.community_id}
        advancedAnalytics={Boolean(capabilities?.advanced_analytics)}
        automations={Boolean(capabilities?.automations)}
        capabilitiesReady={!capabilityResult.error}
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
