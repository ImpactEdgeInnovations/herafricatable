import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MemberHeader } from "@/components/member/member-header";
import { CommunityHostSection } from "@/components/member/community-host-section";
import { PilotCommunityOpenControl } from "@/components/member/pilot-community-open-control";
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
import {
  CommunityEventProposalPanel,
  type CommunityEventProposal,
} from "@/components/community/community-event-proposal-panel";
import {
  CommunityJoiningSettingsPanel,
  type CommunityJoiningSettings,
} from "@/components/member/community-joining-settings";
import type { DestinationInvitation } from "@/components/member/destination-invitation-panel";
import { CommunityPhotoAlbums } from "@/components/community/community-photo-albums";

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

  const [capabilityResult, brandingResult, publicProfileResult, joiningSettingsResult] = await Promise.all([
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
    supabase.rpc("list_community_joining_settings", {
      p_community_id: community.community_id,
    }),
  ]);
  const { data: pilotEligible } = community.status === "draft" && community.membership_role === "owner"
    ? await supabase.rpc("community_pilot_member_ready") : { data: false };
  const capabilities =
    ((capabilityResult.data as CommunityHostCapabilities[] | null) ?? [])[0] ??
    null;
  const brandIdentity =
    ((brandingResult.data as CommunityBrandIdentity[] | null) ?? [])[0] ?? null;
  const publicProfile =
    ((publicProfileResult.data as CommunityPublicProfile[] | null) ?? [])[0] ??
    null;
  const joiningSettings =
    ((joiningSettingsResult.data as CommunityJoiningSettings[] | null) ?? [])[0] ??
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
    eventProposalResult,
    invitationResult,
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
    supabase.rpc("list_my_community_event_proposals", {
      p_community_id: community.community_id,
    }),
    supabase.rpc("list_my_table_invitations", {
      p_destination_id: community.community_id,
      p_destination_type: "community",
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
      {pilotEligible === true ? <PilotCommunityOpenControl communityId={community.community_id} /> : null}
      <section className="community-host-hero">
        <div>
          <p className="eyebrow">Manage community</p>
          <h1>{community.name}</h1>
          <p>
            Invite people, manage members and plan your next gathering.
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
        <a href="#invite-people">Invite people</a>
        <a href="#admissions">Join requests</a>
        <a href="#people">Members</a>
        <a href="#gathering-proposals">Plan a gathering</a>
        <a href="#gatherings">Link an event</a>
        <a href="#joining-settings">Who can join?</a>
        <a href="#community-photos">Photos</a>
        {community.membership_role === "owner" ? (
          <>
            <a href="#identity">Look &amp; feel</a>
          </>
        ) : null}
        <details className="community-host-more-nav"><summary>More tools</summary><div>
        <a href="#welcome">Welcome</a>
        {community.membership_role === "owner" ? <a href="#public-page">Public page</a> : null}
        <a href="#continuity">Member health</a>
        <a href="#resources">Learning</a>
        <a href="#circle-programming">Circles</a>
        <a href="#host-tools">Plans &amp; tools</a>
        {community.membership_role === "owner" ? (
          <>
            <a href="#commerce">Payments</a>
            <a href="#statement">Earnings</a>
          </>
        ) : null}
        </div></details>
      </nav>
      <CommunityHostSection id="host-tools" title="Plans and tools">
        <CommunityHostCapabilitiesPanel
          capabilities={capabilities}
          migrationReady={!capabilityResult.error}
          owner={community.membership_role === "owner"}
        />
      </CommunityHostSection>
      <CommunityJoiningSettingsPanel
        communityId={community.community_id}
        currentUserId={user.id}
        owner={community.membership_role === "owner"}
        settings={joiningSettings}
      />
      <CommunityEventProposalPanel
        communityId={community.community_id}
        communitySlug={slug}
        currentUserId={user.id}
        migrationReady={!eventProposalResult.error}
        proposals={
          (eventProposalResult.data as CommunityEventProposal[] | null) ?? []
        }
      />
      <CommunityPhotoAlbums communityId={community.community_id} currentUserId={user.id} />
      <CommunityHostSection id="welcome-area" title="Welcome new members">
      <CommunityWelcomeQueue
        communityId={community.community_id}
        members={
          (welcomeQueueResult.data as CommunityWelcomeMember[] | null) ?? []
        }
        migrationReady={!welcomeQueueResult.error}
      />
      </CommunityHostSection>
      <CommunityHostSection id="identity-area" title="Community image and appearance">
      <CommunityBrandingPanel
        currentUserId={user.id}
        communityId={community.community_id}
        identity={signedBrandIdentity}
        migrationReady={!brandingResult.error}
        owner={community.membership_role === "owner"}
      />
      </CommunityHostSection>
      <CommunityHostSection id="public-page-area" title="Shareable Community page">
      <CommunityPublicProfilePanel
        currentUserId={user.id}
        communityId={community.community_id}
        communityName={community.name}
        migrationReady={!publicProfileResult.error}
        owner={community.membership_role === "owner"}
        profile={publicProfile}
        slug={community.slug}
        taglineReady={Boolean(brandIdentity?.tagline)}
      />
      </CommunityHostSection>
      <CommunityHostSection id="circle-area" title="Small groups">
      <CommunityCircleHostPanel
        communityId={community.community_id}
        migrationReady={!circleOptionResult.error}
        options={
          (circleOptionResult.data as CommunityCircleOption[] | null) ?? []
        }
      />
      </CommunityHostSection>
      {community.membership_role === "owner" ? (
        <CommunityHostSection id="payments-area" title="Plans and payments">
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
        </CommunityHostSection>
      ) : null}
      {community.membership_role === "owner" ? (
        <CommunityHostSection id="earnings-area" title="Earnings and statements">
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
        </CommunityHostSection>
      ) : null}
      <CommunityHostWorkspace
        currentUserId={user.id}
        communityId={community.community_id}
        communityName={community.name}
        communityStatus={community.status}
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
        invitations={
          (invitationResult.data as DestinationInvitation[] | null) ?? []
        }
        invitationsReady={!invitationResult.error}
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
