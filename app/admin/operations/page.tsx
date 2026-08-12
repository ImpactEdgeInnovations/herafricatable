import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  EventCountdownManager,
  type CountdownSettings,
} from "@/components/admin/event-countdown-manager";
import {
  MemberReview,
  type AdminMember,
} from "@/components/admin/member-review";
import {
  MembershipIntakeControl,
  type MembershipIntakeAdmin,
} from "@/components/admin/membership-intake-control";
import { RoadmapOverview } from "@/components/admin/roadmap-overview";
import {
  TableGuideControl,
  type TableGuideAdmin,
} from "@/components/admin/table-guide-control";
import {
  EventManager,
  type AdminEvent,
} from "@/components/admin/event-manager";
import {
  EventContentManager,
  type AdminAnnouncement,
  type AdminSession,
  type AdminSponsor,
} from "@/components/admin/event-content-manager";
import {
  EventMenuManager,
  type AdminMenu,
  type AdminMenuCourse,
  type AdminMenuFeedback,
  type AdminMenuItem,
} from "@/components/admin/event-menu-manager";
import {
  EventGalleryManager,
  type AdminGalleryAlbum,
  type AdminMediaAsset,
} from "@/components/admin/event-gallery-manager";
import {
  RegistrationManager,
  type AdminPaymentAttempt,
  type AdminRefund,
  type AdminRegistration,
  type AdminTicket,
} from "@/components/admin/registration-manager";
import {
  ModerationQueue,
  type MemberReport,
} from "@/components/admin/moderation-queue";
import {
  EventCheckinConsole,
  type CheckinAttendee,
} from "@/components/admin/event-checkin-console";
import {
  MarketplaceModeration,
  type MarketplaceReport,
} from "@/components/admin/marketplace-moderation";
import {
  EventFeedbackManager,
  type AdminEventFeedback,
  type EventFeedbackSummary,
  type EventRecap,
} from "@/components/admin/event-feedback-manager";
import {
  CommunityManager,
  type CommunityMember,
} from "@/components/admin/community-manager";
import {
  CommunityHostApplicationManager,
  type CommunityHostApplicationAdmin,
} from "@/components/admin/community-host-application-manager";
import {
  CommunityCreatorCommerceManager,
  type CommunityCommerceAdmin,
  type CommunityHostPlan,
  type CommunityOrderAdmin,
} from "@/components/admin/community-creator-commerce-manager";
import {
  CommunityHostBillingManager,
  type CommunityHostBillingAdmin,
  type CommunityHostPlanOrderAdmin,
} from "@/components/admin/community-host-billing-manager";
import {
  CommunityFinanceManager,
  type CommunityFinanceSummaryAdmin,
  type CommunityFinancialCaseAdmin,
  type CommunitySettlementAdmin,
} from "@/components/admin/community-finance-manager";
import {
  CommunityModeration,
  type CommunityReport,
} from "@/components/admin/community-moderation";
import type { CommunitySummary } from "@/components/member/community-directory";
import {
  LearningManager,
  type AdminLesson,
  type CourseOrder,
} from "@/components/admin/learning-manager";
import type { CourseSummary } from "@/components/member/learning-catalog";
import {
  ReferralManager,
  type AdminReferral,
  type AdminReferralCampaign,
} from "@/components/admin/referral-manager";
import {
  MembershipManager,
  type AdminMembership,
  type AdminMembershipPlan,
  type MembershipOrder,
} from "@/components/admin/membership-manager";
import {
  CircleManager,
  type CircleParticipant,
} from "@/components/admin/circle-manager";
import type { CircleCycle } from "@/components/member/circles-hub";
import {
  PerksManager,
  type AdminPartner,
  type PerkRedemption,
} from "@/components/admin/perks-manager";
import type { PartnerPerk } from "@/components/member/perks-gallery";
import {
  AnalyticsReadiness,
  type ProductAnalytic,
  type ReadinessMetric,
} from "@/components/admin/analytics-readiness";
import {
  LaunchGateControl,
  type LaunchGateCheck,
} from "@/components/admin/launch-gate-control";
import { AdminHeader } from "@/components/admin/admin-header";
import { AdminWorkGroup } from "@/components/admin/admin-work-group";
import {
  CuratedIntroductionManager,
  type AdminConnectionAvailability,
  type AdminCuratedIntroduction,
} from "@/components/admin/curated-introduction-manager";
import {
  CommunityOutcomeSummary,
  type CommunityOutcome,
} from "@/components/admin/community-outcome-summary";
import { OperationalHealthPanel } from "@/components/admin/operational-health-panel";
import {
  DatabaseReadinessPanel,
  type DatabaseReleaseCheck,
} from "@/components/admin/database-readiness-panel";
import {
  ModuleReleaseGate,
  type ModuleReleaseCheck,
} from "@/components/admin/module-release-gate";
import { assessOperationalHealth } from "@/lib/operational-health";
import {
  CommunityEventProposalManager,
  type CommunityEventProposalAdmin,
} from "@/components/admin/community-event-proposal-manager";
import {
  MemberEventProposalManager,
  type MemberEventProposalAdmin,
} from "@/components/admin/member-event-proposal-manager";
import {
  MemberEventArchiveManager,
  type EventMediaSubmissionAdmin,
  type MemberEventArchiveAdmin,
} from "@/components/admin/member-event-archive-manager";

type ManagedEventRow = Omit<AdminEvent, "id" | "venues"> & {
  address_line: string | null;
  city: string | null;
  country: string | null;
  event_id: string;
  map_url: string | null;
  online_url: string | null;
  venue_name: string | null;
};

type WorkArea =
  | "event-work"
  | "member-programs"
  | "people-and-launch"
  | "release-tools"
  | "safety-work";

const workAreas: {
  description: string;
  id: WorkArea;
  label: string;
  roles: string[];
  title: string;
}[] = [
  {
    description:
      "Review applications, member readiness and privacy-safe launch health.",
    id: "people-and-launch",
    label: "People",
    roles: ["super_admin"],
    title: "Membership and readiness",
  },
  {
    description:
      "Create events, publish content, manage registration and welcome guests.",
    id: "event-work",
    label: "Events",
    roles: ["super_admin", "event_staff"],
    title: "Events and registrations",
  },
  {
    description:
      "Review submitted concerns without exposing unrelated private activity.",
    id: "safety-work",
    label: "Safety",
    roles: ["super_admin", "moderator"],
    title: "Trust and moderation",
  },
  {
    description:
      "Manage membership plans and carefully gated community benefits.",
    id: "member-programs",
    label: "Programmes",
    roles: ["super_admin"],
    title: "Programmes and benefits",
  },
  {
    description:
      "Review the delivery roadmap and control the public event countdown.",
    id: "release-tools",
    label: "Release",
    roles: ["super_admin", "event_staff", "moderator"],
    title: "Launch controls",
  },
];

export const dynamic = "force-dynamic";

export default async function AdminOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  const { area: requestedArea } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["super_admin", "event_staff", "moderator"])
    .limit(1)
    .maybeSingle();

  if (!role) {
    return (
      <main className="portal-page">
        <section className="portal-card">
          <p className="eyebrow">Access restricted</p>
          <h1>Admin role required.</h1>
          <p>
            Your identity was verified, but this account does not have an
            approved Her Africa Table team role. Choosing the Admin sign-in page
            never grants administrative access.
          </p>
          <div className="portal-actions">
            <Link className="button button-primary" href="/home">
              Continue as a member
            </Link>
            <Link className="button button-outline" href="/">
              Return home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const canManageEvents =
    role.role === "super_admin" || role.role === "event_staff";
  const canModerate = role.role === "super_admin" || role.role === "moderator";
  const availableAreas = workAreas.filter((area) =>
    area.roles.includes(role.role),
  );
  const fallbackArea =
    role.role === "event_staff"
      ? "event-work"
      : role.role === "moderator"
        ? "safety-work"
        : "people-and-launch";
  const activeArea =
    availableAreas.find((area) => area.id === requestedArea)?.id ??
    fallbackArea;
  const activeAreaDetails =
    availableAreas.find((area) => area.id === activeArea) ?? availableAreas[0];
  const loadPeople = activeArea === "people-and-launch";
  const loadEvents = activeArea === "event-work";
  const loadSafety = activeArea === "safety-work";
  const loadPrograms = activeArea === "member-programs";
  const loadRelease = activeArea === "release-tools";
  const loadEventList = loadEvents || loadPrograms;
  const [
    { data: countdown },
    memberApplicationResult,
    membershipIntakeResult,
    eventResult,
    operationalHealth,
    communityEventProposalResult,
    memberEventProposalResult,
    memberEventProposalContextResult,
    memberEventArchiveResult,
    memberEventMediaResult,
  ] = await Promise.all([
    loadRelease
      ? supabase
          .from("site_event_countdown")
          .select("event_name, city, starts_at, is_published")
          .eq("id", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    role.role === "super_admin" && loadPeople
      ? supabase.rpc("list_admin_members_v3")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadPeople
      ? supabase.rpc("get_membership_intake_admin")
      : Promise.resolve({ data: [], error: null }),
    canManageEvents && loadEventList
      ? supabase.rpc("list_managed_events")
      : Promise.resolve({ data: [], error: null }),
    loadRelease
      ? assessOperationalHealth()
      : Promise.resolve(null),
    role.role === "super_admin" && loadEvents
      ? supabase.rpc("list_admin_community_event_proposals")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadEvents
      ? supabase.rpc("list_admin_member_event_proposals")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadEvents
      ? supabase.rpc("list_member_event_proposal_communities")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadEvents
      ? supabase.rpc("list_admin_member_event_archives")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadEvents
      ? supabase.rpc("list_admin_event_media_submissions")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const memberFallbackResult =
    role.role === "super_admin" && loadPeople && memberApplicationResult.error
      ? await supabase.rpc("list_admin_members_v2")
      : null;
  const memberResult = memberFallbackResult ?? memberApplicationResult;
  const tableGuideAdminResult =
    role.role === "super_admin" && loadPeople
      ? await supabase.rpc("get_table_guide_admin")
      : { data: [], error: null };
  const members = (memberResult.data as AdminMember[] | null) ?? [];
  const memberEventProposalContexts = (memberEventProposalContextResult.data as
    | {
        community_id: string | null;
        community_name: string | null;
        community_slug: string | null;
        community_type: string | null;
        proposal_id: string;
      }[]
    | null) ?? [];
  const memberEventProposals = (((memberEventProposalResult.data as
    | MemberEventProposalAdmin[]
    | null) ?? []).map((proposal) => {
      const context = memberEventProposalContexts.find(
        (item) => item.proposal_id === proposal.proposal_id,
      );
      return {
        ...proposal,
        community_id: context?.community_id ?? null,
        community_name: context?.community_name ?? null,
        community_slug: context?.community_slug ?? null,
        community_type: context?.community_type ?? null,
      };
    }));
  const eventMediaSubmissions = await Promise.all(
    (((memberEventMediaResult.data as EventMediaSubmissionAdmin[] | null) ?? [])).map(async (item) => {
      const signed = await supabase.storage.from("event-media").createSignedUrl(item.storage_path, 3600);
      return { ...item, image_url: signed.data?.signedUrl ?? null };
    }),
  );
  const managedRows = (eventResult.data as ManagedEventRow[] | null) ?? [];
  const events: AdminEvent[] = managedRows.map((event) => ({
    capacity: event.capacity,
    ends_at: event.ends_at,
    format: event.format,
    id: event.event_id,
    is_featured: event.is_featured,
    registration_mode: event.registration_mode,
    slug: event.slug,
    starts_at: event.starts_at,
    status: event.status,
    summary: event.summary,
    timezone: event.timezone,
    title: event.title,
    venues:
      event.venue_name && event.city && event.country
        ? {
            address_line: event.address_line,
            city: event.city,
            country: event.country,
            map_url: event.map_url,
            name: event.venue_name,
          }
        : null,
  }));
  const privateEvents = managedRows.map((event) => ({
    event_id: event.event_id,
    online_url: event.online_url,
  }));
  const canManageCountdown =
    role.role === "super_admin" || role.role === "event_staff";
  const isProgramAdmin = role.role === "super_admin" && loadPrograms;
  const [
    reportResult,
    marketplaceReportResult,
    communityReportResult,
    communityResult,
    communityHostApplicationResult,
    featureFlagResult,
    communityAcceptanceFlagResult,
    communityHostPlanResult,
    communityCommerceResult,
    communityOrderResult,
    communityCommerceFlagResult,
    hostBillingConfigResult,
    hostPlanOrderResult,
    communityFinanceResult,
    communityFinancialCaseResult,
    communitySettlementResult,
    learningCourseResult,
    courseOrderResult,
    learningFlagResult,
    referralCampaignResult,
    referralResult,
    referralFlagResult,
    membershipPlanResult,
    membershipPeriodResult,
    membershipOrderResult,
    membershipFlagResult,
    circleCycleResult,
    circleFlagResult,
    partnerResult,
    perkResult,
    perkRedemptionResult,
    perkFlagResult,
    readinessResult,
    analyticsResult,
    launchGateResult,
    databaseReadinessResult,
    moduleReleaseResult,
    curatedIntroductionResult,
    connectionAvailabilityResult,
    connectionOutcomeResult,
  ] = await Promise.all([
    canModerate && loadSafety
      ? supabase.rpc("list_member_reports")
      : Promise.resolve({ data: [], error: null }),
    canModerate && loadSafety
      ? supabase.rpc("list_marketplace_reports")
      : Promise.resolve({ data: [], error: null }),
    canModerate && loadSafety
      ? supabase.rpc("list_community_safety_reports")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_communities")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_community_host_applications_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "communities")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isProgramAdmin
      ? supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "community_acceptance_mode")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isProgramAdmin
      ? supabase.rpc("list_community_host_plans")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_community_commerce_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_community_orders_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "community_creator_commerce")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isProgramAdmin
      ? supabase.rpc("get_community_host_billing_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_community_host_plan_orders_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_community_finance_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_community_financial_cases_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_community_settlements_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_courses")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_course_orders")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "learning")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isProgramAdmin
      ? supabase
          .from("referral_campaigns")
          .select(
            "id,name,slug,description,status,starts_at,ends_at,max_referrals_per_member,max_total_referrals",
          )
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_referrals_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "referrals")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isProgramAdmin
      ? supabase
          .from("membership_plans")
          .select(
            "id,slug,name,description,price_minor,currency,duration_months,grace_days,payment_mode,status",
          )
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_memberships_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_membership_orders")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "memberships")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isProgramAdmin
      ? supabase.rpc("list_circle_cycles")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "circles")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    isProgramAdmin
      ? supabase
          .from("partners")
          .select(
            "id,slug,name,description,website_url,logo_url,category,city,country,status",
          )
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_partner_perks")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase.rpc("list_perk_redemptions_admin")
      : Promise.resolve({ data: [], error: null }),
    isProgramAdmin
      ? supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "partner_perks")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    role.role === "super_admin" && loadPeople
      ? supabase.rpc("get_launch_readiness_metrics")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadPeople
      ? supabase.rpc("get_product_analytics", { p_days: 30 })
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadRelease
      ? supabase.rpc("list_launch_gate_checks")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadRelease
      ? supabase.rpc("list_database_release_readiness")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadRelease
      ? supabase.rpc("list_module_release_acceptance")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadPeople
      ? supabase.rpc("list_curated_introductions_admin")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadPeople
      ? supabase.rpc("list_connection_availability_admin")
      : Promise.resolve({ data: [], error: null }),
    role.role === "super_admin" && loadPeople
      ? supabase.rpc("get_connection_outcome_summary", { p_days: 365 })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const communityJoiningResult = isProgramAdmin
    ? await supabase.rpc("list_community_joining_settings", {
        p_community_id: null,
      })
    : { data: [], error: null };
  const joiningByCommunity = new Map(
    ((communityJoiningResult.data as {
      admission_mode: "open" | "approval";
      community_id: string;
      effective_mode: "open" | "approval";
    }[] | null) ?? []).map((item) => [item.community_id, item]),
  );
  const communities = (
    (communityResult.data as CommunitySummary[] | null) ?? []
  ).map((community) => ({
    ...community,
    ...(joiningByCommunity.get(community.community_id) ?? {}),
  }));
  const adminCourses =
    (learningCourseResult.data as CourseSummary[] | null) ?? [];
  const learningCourseIds = adminCourses.map((item) => item.course_id);
  const circleCycles = (circleCycleResult.data as CircleCycle[] | null) ?? [];
  const [communityMemberResults, lessonResult, circleParticipantResults] =
    await Promise.all([
      isProgramAdmin
        ? Promise.all(
            communities.map((item) =>
              supabase.rpc("list_community_members", {
                p_community_id: item.community_id,
              }),
            ),
          )
        : Promise.resolve([]),
      isProgramAdmin && learningCourseIds.length
        ? supabase
            .from("course_lessons")
            .select(
              "id,course_id,title,summary,lesson_type,content,asset_path,external_url,duration_minutes,status,sort_order",
            )
            .in("course_id", learningCourseIds)
            .order("sort_order")
        : Promise.resolve({ data: [], error: null }),
      isProgramAdmin
        ? Promise.all(
            circleCycles.map((item) =>
              supabase.rpc("list_circle_participants_admin", {
                p_cycle_id: item.cycle_id,
              }),
            ),
          )
        : Promise.resolve([]),
    ]);
  const communityMembers = communityMemberResults.flatMap((result, index) =>
    ((result.data as Omit<CommunityMember, "community_id">[] | null) ?? []).map(
      (item) => ({ ...item, community_id: communities[index].community_id }),
    ),
  );
  const circleParticipants = circleParticipantResults.flatMap((result, index) =>
    ((result.data as Omit<CircleParticipant, "cycle_id">[] | null) ?? []).map(
      (item) => ({ ...item, cycle_id: circleCycles[index].cycle_id }),
    ),
  );
  const eventIds = events.map((event) => event.id);
  const [
    { data: sessionData },
    { data: announcementData },
    { data: sponsorData },
  ] = loadEvents && eventIds.length
    ? await Promise.all([
        supabase
          .from("programme_sessions")
          .select(
            "id, event_id, title, description, starts_at, ends_at, room, status",
          )
          .in("event_id", eventIds)
          .order("starts_at", { ascending: true }),
        supabase
          .from("event_announcements")
          .select("id, event_id, title, body, status, published_at")
          .in("event_id", eventIds)
          .order("updated_at", { ascending: false }),
        supabase
          .from("event_sponsors")
          .select(
            "id, event_id, name, tier, website_url, logo_url, is_published, sort_order",
          )
          .in("event_id", eventIds)
          .order("sort_order", { ascending: true }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const sessions = (sessionData as AdminSession[] | null) ?? [];
  const sessionIds = sessions.map((session) => session.id);
  const { data: speakerLinks } = loadEvents && sessionIds.length
    ? await supabase
        .from("session_speakers")
        .select("session_id, event_speakers(name, job_title, company)")
        .in("session_id", sessionIds)
        .order("sort_order", { ascending: true })
    : { data: [] };
  const menuResult = loadEvents && eventIds.length
    ? await supabase
        .from("event_menus")
        .select("id, event_id, title, introduction, embassy_note, status")
        .in("event_id", eventIds)
    : { data: [], error: null };
  const menus = (menuResult.data as AdminMenu[] | null) ?? [];
  const menuIds = menus.map((menu) => menu.id);
  const courseResult = loadEvents && menuIds.length
    ? await supabase
        .from("menu_courses")
        .select("id, menu_id, name, description, sort_order")
        .in("menu_id", menuIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  const courses = (courseResult.data as AdminMenuCourse[] | null) ?? [];
  const courseIds = courses.map((course) => course.id);
  const itemResult = loadEvents && courseIds.length
    ? await supabase
        .from("menu_items")
        .select(
          "id, course_id, name, description, cultural_origin, cultural_story, ingredients, dietary_tags, allergen_notes, status, sort_order",
        )
        .in("course_id", courseIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  const menuItems = (itemResult.data as AdminMenuItem[] | null) ?? [];
  const itemIds = menuItems.map((item) => item.id);
  const feedbackResult = loadEvents && itemIds.length
    ? await supabase
        .from("menu_item_feedback")
        .select(
          "item_id, user_id, rating, is_favorite, comment, moderation_status",
        )
        .in("item_id", itemIds)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };
  const albumResult = loadEvents && eventIds.length
    ? await supabase
        .from("gallery_albums")
        .select("id, event_id, title, introduction, status, sort_order")
        .in("event_id", eventIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  const albums = (albumResult.data as AdminGalleryAlbum[] | null) ?? [];
  const albumIds = albums.map((album) => album.id);
  const assetResult = loadEvents && albumIds.length
    ? await supabase
        .from("media_assets")
        .select(
          "id, album_id, storage_path, mime_type, width, height, alt_text, caption, credit, captured_at, status, is_featured, sort_order",
        )
        .in("album_id", albumIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  const rawAssets = (assetResult.data as AdminMediaAsset[] | null) ?? [];
  const assets = await Promise.all(
    rawAssets.map(async (asset) => {
      let signed = await supabase.storage
        .from("event-media")
        .createSignedUrl(asset.storage_path, 3600, {
          transform: { height: 320, quality: 75, resize: "cover", width: 480 },
        });
      if (signed.error)
        signed = await supabase.storage
          .from("event-media")
          .createSignedUrl(asset.storage_path, 3600);
      return { ...asset, signed_url: signed.data?.signedUrl ?? null };
    }),
  );
  const ticketResult = loadEvents && eventIds.length
    ? await supabase
        .from("ticket_types")
        .select(
          "id, event_id, name, description, price_minor, currency, inventory_quantity, sales_start_at, sales_end_at, status, sort_order",
        )
        .in("event_id", eventIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  const registrationResults = await Promise.all(
    (loadEvents ? eventIds : []).map((eventId) =>
      supabase.rpc("list_event_registrations", { p_event_id: eventId }),
    ),
  );
  const registrations = registrationResults.flatMap(
    (result) => (result.data as AdminRegistration[] | null) ?? [],
  );
  const registrationOrderIds = registrations.map(
    (registration) => registration.order_id,
  );
  const paymentResult = loadEvents && registrationOrderIds.length
    ? await supabase
        .from("payment_attempts")
        .select(
          "order_id, provider, provider_reference, amount_minor, currency, status, created_at",
        )
        .in("order_id", registrationOrderIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  const refundResults = await Promise.all(
    (loadEvents ? eventIds : []).map((eventId) =>
      supabase.rpc("list_event_refund_requests", { p_event_id: eventId }),
    ),
  );
  const refunds = refundResults.flatMap(
    (result) => (result.data as AdminRefund[] | null) ?? [],
  );
  const checkinResults = await Promise.all(
    (loadEvents ? eventIds : []).map((eventId) =>
      supabase.rpc("list_event_checkins", { p_event_id: eventId }),
    ),
  );
  const checkinAttendees = checkinResults.flatMap((result, index) =>
    ((result.data as Omit<CheckinAttendee, "event_id">[] | null) ?? []).map(
      (attendee) => ({ ...attendee, event_id: eventIds[index] }),
    ),
  );
  const feedbackResults = await Promise.all(
    (loadEvents ? eventIds : []).map((eventId) =>
      supabase.rpc("list_event_feedback_admin", { p_event_id: eventId }),
    ),
  );
  const eventFeedback = feedbackResults.flatMap((result, index) =>
    ((result.data as AdminEventFeedback[] | null) ?? []).map((entry) => ({
      ...entry,
      event_id: eventIds[index],
    })),
  );
  const feedbackSummaryResults = await Promise.all(
    (loadEvents ? eventIds : []).map((eventId) =>
      supabase.rpc("get_event_feedback_summary", { p_event_id: eventId }),
    ),
  );
  const feedbackSummaries = feedbackSummaryResults.flatMap((result, index) =>
    (
      (result.data as Omit<EventFeedbackSummary, "event_id">[] | null) ?? []
    ).map((entry) => ({ ...entry, event_id: eventIds[index] })),
  );
  const recapResult = loadEvents && eventIds.length
    ? await supabase
        .from("event_recaps")
        .select("event_id,title,summary,highlights,status")
        .in("event_id", eventIds)
    : { data: [], error: null };
  const memberReports = (reportResult.data as MemberReport[] | null) ?? [];
  const marketplaceReports =
    (marketplaceReportResult.data as MarketplaceReport[] | null) ?? [];
  const communityReportFallbackResult =
    communityReportResult.error && canModerate && loadSafety
      ? await supabase.rpc("list_community_reports")
      : null;
  const communityReportSource = communityReportResult.error
    ? communityReportFallbackResult
    : communityReportResult;
  const gatheringReportResult = canModerate && loadSafety
    ? await supabase.rpc("list_community_gathering_reports")
    : { data: [], error: null };
  const communityReports = [
    ...((communityReportSource?.data as CommunityReport[] | null) ?? []),
    ...((gatheringReportResult.data as CommunityReport[] | null) ?? []),
  ];
  return (
    <main className="admin-command-center">
      <AdminHeader
        active="operations"
        label="Full operations workspace"
        role={role.role}
      />
      <section className="admin-area-hero" id="overview">
        <div>
          <p className="eyebrow">Focused workspace</p>
          <h1>{activeAreaDetails.title}</h1>
          <p>{activeAreaDetails.description}</p>
        </div>
        <Link className="button button-outline" href="/admin">
          Return to today
        </Link>
      </section>
      <nav className="admin-area-picker" aria-label="Choose a work area">
        {availableAreas.map((area) => (
          <Link
            aria-current={area.id === activeArea ? "page" : undefined}
            href={`/admin/operations?area=${area.id}#${area.id}`}
            key={area.id}
          >
            <span>{area.label}</span>
            <small>{area.title}</small>
          </Link>
        ))}
      </nav>
      {role.role === "super_admin" && loadPeople ? (
        <AdminWorkGroup
          defaultOpen
          description="Check launch health and make member access decisions. Most daily work starts here."
          id="people-and-launch"
          label="People and readiness"
          title="Is the platform ready, and who needs a decision?"
        >
          <AnalyticsReadiness
            metrics={(readinessResult.data as ReadinessMetric[] | null) ?? []}
            analytics={(analyticsResult.data as ProductAnalytic[] | null) ?? []}
            migrationReady={!readinessResult.error && !analyticsResult.error}
          />
          <MembershipIntakeControl
            configuration={
              ((membershipIntakeResult.data as MembershipIntakeAdmin[] | null) ??
                [])[0] ?? null
            }
            migrationReady={!membershipIntakeResult.error}
          />
          <TableGuideControl
            configuration={
              ((tableGuideAdminResult.data as TableGuideAdmin[] | null) ?? [])[0] ??
              null
            }
            keyConfigured={Boolean(
              process.env.OPENAI_API_KEY && process.env.AI_SAFETY_SALT,
            )}
            migrationReady={!tableGuideAdminResult.error}
          />
          <MemberReview
            initialMembers={members}
            currentUserId={user.id}
            migrationReady={!memberResult.error}
            applicationJourneyReady={!memberApplicationResult.error}
          />
          <CuratedIntroductionManager
            availability={
              (connectionAvailabilityResult.data as
                | AdminConnectionAvailability[]
                | null) ?? []
            }
            introductions={
              (curatedIntroductionResult.data as
                | AdminCuratedIntroduction[]
                | null) ?? []
            }
            members={members}
            migrationReady={
              !curatedIntroductionResult.error &&
              !connectionAvailabilityResult.error
            }
          />
          <CommunityOutcomeSummary
            outcomes={
              (connectionOutcomeResult.data as CommunityOutcome[] | null) ?? []
            }
            migrationReady={!connectionOutcomeResult.error}
          />
        </AdminWorkGroup>
      ) : null}
      {canManageEvents && loadEvents ? (
        <AdminWorkGroup
          defaultOpen
          description="Create the event first, then open only the tool needed for tickets, content, guest arrival, or follow-up."
          id="event-work"
          label="Event work"
          title="Plan and run an event"
        >
          {role.role === "super_admin" ? (
            <>
              <MemberEventProposalManager
                migrationReady={!memberEventProposalResult.error && !memberEventProposalContextResult.error}
                proposals={memberEventProposals}
              />
              <CommunityEventProposalManager
                migrationReady={!communityEventProposalResult.error}
                proposals={
                  (communityEventProposalResult.data as
                    | CommunityEventProposalAdmin[]
                    | null) ?? []
                }
              />
              <MemberEventArchiveManager
                archives={
                  (memberEventArchiveResult.data as
                    | MemberEventArchiveAdmin[]
                    | null) ?? []
                }
                media={eventMediaSubmissions}
                migrationReady={
                  !memberEventArchiveResult.error && !memberEventMediaResult.error
                }
              />
            </>
          ) : null}
          <EventManager
            initialEvents={events}
            privateEvents={privateEvents}
            canCreate={role.role === "super_admin"}
            migrationReady={!eventResult.error}
          />
          {!eventResult.error ? (
            <EventContentManager
              events={events}
              initialSessions={sessions}
              initialAnnouncements={
                (announcementData as AdminAnnouncement[] | null) ?? []
              }
              initialSponsors={(sponsorData as AdminSponsor[] | null) ?? []}
              speakerLinks={
                (speakerLinks as unknown as
                  | {
                      session_id: string;
                      event_speakers: {
                        company: string | null;
                        job_title: string | null;
                        name: string;
                      } | null;
                    }[]
                  | null) ?? []
              }
              isSuperAdmin={role.role === "super_admin"}
            />
          ) : null}
          {!eventResult.error ? (
            <EventMenuManager
              events={events}
              initialMenus={menus}
              initialCourses={courses}
              initialItems={menuItems}
              initialFeedback={
                (feedbackResult.data as AdminMenuFeedback[] | null) ?? []
              }
              migrationReady={
                !menuResult.error &&
                !courseResult.error &&
                !itemResult.error &&
                !feedbackResult.error
              }
            />
          ) : null}
          {!eventResult.error ? (
            <EventGalleryManager
              events={events}
              initialAlbums={albums}
              initialAssets={assets}
              migrationReady={!albumResult.error && !assetResult.error}
            />
          ) : null}
          {!eventResult.error ? (
            <RegistrationManager
              events={events}
              initialTickets={(ticketResult.data as AdminTicket[] | null) ?? []}
              initialRegistrations={registrations}
              initialPayments={
                (paymentResult.data as AdminPaymentAttempt[] | null) ?? []
              }
              initialRefunds={refunds}
              paystackConfigured={Boolean(
                process.env.PAYSTACK_SECRET_KEY &&
                  process.env.SUPABASE_SECRET_KEY &&
                  process.env.NEXT_PUBLIC_SITE_URL,
              )}
              migrationReady={
                !ticketResult.error &&
                !paymentResult.error &&
                registrationResults.every((result) => !result.error)
              }
            />
          ) : null}
          {!eventResult.error ? (
            <EventCheckinConsole
              events={events.map((event) => ({
                id: event.id,
                title: event.title,
                starts_at: event.starts_at,
                ends_at: event.ends_at,
              }))}
              initialAttendees={checkinAttendees}
              migrationReady={checkinResults.every((result) => !result.error)}
            />
          ) : null}
          {!eventResult.error ? (
            <EventFeedbackManager
              events={events}
              feedback={eventFeedback}
              summaries={feedbackSummaries}
              recaps={(recapResult.data as EventRecap[] | null) ?? []}
              migrationReady={
                feedbackResults.every((result) => !result.error) &&
                feedbackSummaryResults.every((result) => !result.error) &&
                !recapResult.error
              }
            />
          ) : null}
        </AdminWorkGroup>
      ) : null}
      {canModerate && loadSafety ? (
        <AdminWorkGroup
          defaultOpen
          description="Review reported activity only. Private content stays unavailable unless it is part of a submitted report."
          id="safety-work"
          label="Trust and safety"
          title="Review concerns and protect members"
        >
          <ModerationQueue
            reports={memberReports}
            migrationReady={!reportResult.error}
          />
          <MarketplaceModeration
            reports={marketplaceReports}
            migrationReady={!marketplaceReportResult.error}
          />
          <CommunityModeration
            reports={communityReports}
            migrationReady={!communityReportSource?.error}
          />
        </AdminWorkGroup>
      ) : null}
      {role.role === "super_admin" && loadPrograms ? (
        <AdminWorkGroup
          defaultOpen
          description="These tools support ongoing member value. Keep each feature off until its content and operations have passed acceptance."
          id="member-programs"
          label="Member programmes"
          title="Manage membership and optional features"
        >
          <MembershipManager
            plans={
              (membershipPlanResult.data as AdminMembershipPlan[] | null) ?? []
            }
            periods={
              (membershipPeriodResult.data as AdminMembership[] | null) ?? []
            }
            orders={
              (membershipOrderResult.data as MembershipOrder[] | null) ?? []
            }
            enabled={Boolean(membershipFlagResult.data?.enabled)}
            migrationReady={
              !membershipPlanResult.error &&
              !membershipPeriodResult.error &&
              !membershipOrderResult.error &&
              !membershipFlagResult.error
            }
          />
          <CircleManager
            cycles={circleCycles}
            participants={circleParticipants}
            enabled={Boolean(circleFlagResult.data?.enabled)}
            migrationReady={
              !circleCycleResult.error &&
              !circleFlagResult.error &&
              circleParticipantResults.every((result) => !result.error)
            }
          />
          <PerksManager
            partners={(partnerResult.data as AdminPartner[] | null) ?? []}
            perks={(perkResult.data as PartnerPerk[] | null) ?? []}
            redemptions={
              (perkRedemptionResult.data as PerkRedemption[] | null) ?? []
            }
            enabled={Boolean(perkFlagResult.data?.enabled)}
            migrationReady={
              !partnerResult.error &&
              !perkResult.error &&
              !perkRedemptionResult.error &&
              !perkFlagResult.error
            }
          />
          <CommunityHostApplicationManager
            applications={
              (communityHostApplicationResult.data as
                | CommunityHostApplicationAdmin[]
                | null) ?? []
            }
            migrationReady={!communityHostApplicationResult.error}
          />
          <CommunityManager
            acceptanceMode={Boolean(communityAcceptanceFlagResult.data?.enabled)}
            communities={communities}
            members={communityMembers}
            enabled={Boolean(featureFlagResult.data?.enabled)}
            joiningReady={!communityJoiningResult.error}
            migrationReady={
              !communityResult.error &&
              !featureFlagResult.error &&
              !communityAcceptanceFlagResult.error &&
              communityMemberResults.every((result) => !result.error)
            }
          />
          <CommunityCreatorCommerceManager
            communities={
              (communityCommerceResult.data as
                | CommunityCommerceAdmin[]
                | null) ?? []
            }
            enabled={Boolean(communityCommerceFlagResult.data?.enabled)}
            migrationReady={
              !communityHostPlanResult.error &&
              !communityCommerceResult.error &&
              !communityOrderResult.error &&
              !communityCommerceFlagResult.error
            }
            orders={
              (communityOrderResult.data as CommunityOrderAdmin[] | null) ?? []
            }
            plans={
              (communityHostPlanResult.data as CommunityHostPlan[] | null) ?? []
            }
          />
          <CommunityHostBillingManager
            configuration={
              ((hostBillingConfigResult.data as
                | CommunityHostBillingAdmin[]
                | null) ?? [])[0] ?? null
            }
            migrationReady={
              !hostBillingConfigResult.error &&
              !hostPlanOrderResult.error &&
              Number.isInteger(
                (
                  (hostBillingConfigResult.data as
                    | CommunityHostBillingAdmin[]
                    | null) ?? []
                )[0]?.grace_days,
              )
            }
            orders={
              (hostPlanOrderResult.data as
                | CommunityHostPlanOrderAdmin[]
                | null) ?? []
            }
          />
          <CommunityFinanceManager
            cases={
              (communityFinancialCaseResult.data as
                | CommunityFinancialCaseAdmin[]
                | null) ?? []
            }
            migrationReady={
              !communityFinanceResult.error &&
              !communityFinancialCaseResult.error &&
              !communitySettlementResult.error
            }
            orders={
              (communityOrderResult.data as CommunityOrderAdmin[] | null) ?? []
            }
            settlements={
              (communitySettlementResult.data as
                | CommunitySettlementAdmin[]
                | null) ?? []
            }
            summaries={
              (communityFinanceResult.data as
                | CommunityFinanceSummaryAdmin[]
                | null) ?? []
            }
          />
          <LearningManager
            courses={adminCourses}
            lessons={(lessonResult.data as AdminLesson[] | null) ?? []}
            orders={(courseOrderResult.data as CourseOrder[] | null) ?? []}
            events={events.map((item) => ({ id: item.id, title: item.title }))}
            enabled={Boolean(learningFlagResult.data?.enabled)}
            migrationReady={
              !learningCourseResult.error &&
              !lessonResult.error &&
              !courseOrderResult.error &&
              !learningFlagResult.error
            }
          />
          <ReferralManager
            campaigns={
              (referralCampaignResult.data as AdminReferralCampaign[] | null) ??
              []
            }
            referrals={(referralResult.data as AdminReferral[] | null) ?? []}
            enabled={Boolean(referralFlagResult.data?.enabled)}
            migrationReady={
              !referralCampaignResult.error &&
              !referralResult.error &&
              !referralFlagResult.error
            }
          />
        </AdminWorkGroup>
      ) : null}
      {loadRelease ? (
        <AdminWorkGroup
          defaultOpen
          description="Record launch evidence, review delivery progress and control the public landing-page event timer."
          id="release-tools"
          label="Release controls"
          title="Launch evidence and public controls"
        >
          {operationalHealth ? (
            <OperationalHealthPanel assessment={operationalHealth} />
          ) : null}
          {role.role === "super_admin" ? (
            <>
              <DatabaseReadinessPanel
                checks={
                  (databaseReadinessResult.data as
                    | DatabaseReleaseCheck[]
                    | null) ?? []
                }
                migrationReady={!databaseReadinessResult.error}
              />
              <ModuleReleaseGate
                checks={
                  (moduleReleaseResult.data as ModuleReleaseCheck[] | null) ?? []
                }
                migrationReady={!moduleReleaseResult.error}
              />
              <LaunchGateControl
                checks={
                  (launchGateResult.data as LaunchGateCheck[] | null) ?? []
                }
                environmentSignals={[
                  {
                    label: "Server integration",
                    ready:
                      operationalHealth?.checks.find(
                        (check) => check.key === "server",
                      )?.status === "ready",
                  },
                  {
                    label: "Online payments",
                    ready:
                      operationalHealth?.checks.find(
                        (check) => check.key === "payments",
                      )?.status === "ready",
                  },
                  {
                    label: "Email delivery",
                    ready:
                      operationalHealth?.checks.find(
                        (check) => check.key === "email",
                      )?.status === "ready",
                  },
                ]}
                migrationReady={!launchGateResult.error}
                release={
                  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local"
                }
              />
            </>
          ) : null}
          <RoadmapOverview />
          <section className="admin-section" id="event">
            <EventCountdownManager
              canManage={canManageCountdown}
              initialSettings={(countdown as CountdownSettings | null) ?? null}
              userId={user.id}
            />
          </section>
        </AdminWorkGroup>
      ) : null}
      <footer className="admin-footer">
        <span>Her Africa Table · Production workspace</span>
        <Link href="/">View public site</Link>
      </footer>
    </main>
  );
}
