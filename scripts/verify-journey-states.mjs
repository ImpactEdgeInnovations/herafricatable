import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

function filesUnder(path) {
  const absolute = join(root, path);
  return readdirSync(absolute).flatMap((entry) => {
    const child = join(absolute, entry);
    return statSync(child).isDirectory()
      ? filesUnder(relative(root, child))
      : [relative(root, child)];
  });
}

const boundaryContracts = {
  "app/loading.tsx": ["JourneyState", 'variant="loading"'],
  "app/error.tsx": ["RouteError", "reset={reset}"],
  "app/global-error.tsx": ["<html", "<body", "RouteError"],
  "app/not-found.tsx": ["JourneyState", 'href: "/home"'],
  "app/admin/loading.tsx": ["JourneyState", 'variant="loading"'],
  "app/admin/error.tsx": ["RouteError", 'supportHref="/admin/support"'],
};

for (const [path, contracts] of Object.entries(boundaryContracts)) {
  const content = read(path);
  for (const contract of contracts) {
    assert(content.includes(contract), `${path} must include ${contract}`);
  }
}

const journeyState = read("components/shared/journey-state.tsx");
for (const contract of [
  "aria-busy",
  "aria-live",
  'role={variant === "error"',
  "journey-state-actions",
]) {
  assert(
    journeyState.includes(contract),
    `Shared journey state must include ${contract}`,
  );
}

const routeError = read("components/shared/route-error.tsx");
for (const contract of ['role="alert"', "onClick={reset}", "Contact support"]) {
  assert(
    routeError.includes(contract),
    `Route recovery must include ${contract}`,
  );
}

const protectedRouteRecovery = [
  "app/circles/page.tsx",
  "app/communities/[slug]/page.tsx",
  "app/membership/page.tsx",
  "app/perks/page.tsx",
];
for (const path of protectedRouteRecovery) {
  const content = read(path);
  assert(
    content.includes("memberErrorMessage"),
    `${path} must filter service errors`,
  );
  assert(
    content.includes("Try again") && content.includes("Contact support"),
    `${path} must provide retry and support recovery`,
  );
}

const refreshModules = [
  "components/admin/analytics-readiness.tsx",
  "components/admin/circle-manager.tsx",
  "components/admin/community-manager.tsx",
  "components/admin/community-creator-commerce-manager.tsx",
  "components/admin/community-host-billing-manager.tsx",
  "components/admin/community-moderation.tsx",
  "components/admin/community-event-proposal-manager.tsx",
  "components/admin/event-content-manager.tsx",
  "components/admin/event-feedback-manager.tsx",
  "components/admin/event-gallery-manager.tsx",
  "components/admin/event-manager.tsx",
  "components/admin/event-menu-manager.tsx",
  "components/admin/learning-manager.tsx",
  "components/admin/marketplace-moderation.tsx",
  "components/admin/membership-manager.tsx",
  "components/admin/module-release-gate.tsx",
  "components/admin/moderation-queue.tsx",
  "components/admin/perks-manager.tsx",
  "components/admin/referral-manager.tsx",
  "components/admin/registration-manager.tsx",
  "components/member/circles-hub.tsx",
  "components/member/community-directory.tsx",
  "components/member/community-feed.tsx",
  "components/member/community-circle-host-panel.tsx",
  "components/member/community-host-workspace.tsx",
  "components/community/community-event-proposal-panel.tsx",
  "components/member/community-commerce-panel.tsx",
  "components/events/event-attendee-directory.tsx",
  "components/member/learning-catalog.tsx",
  "components/member/membership-center.tsx",
  "components/member/network-hub.tsx",
  "components/member/opportunity-marketplace.tsx",
  "components/member/order-history.tsx",
  "components/member/perks-gallery.tsx",
  "components/member/profile-editor.tsx",
  "components/member/referral-center.tsx",
];
for (const path of refreshModules) {
  const content = read(path);
  assert(
    content.includes("router.refresh()"),
    `${path} must refresh without discarding action feedback`,
  );
  assert(
    !content.includes("location.reload()"),
    `${path} must not discard success or recovery messages`,
  );
}

const actionStateModules = [
  "components/events/event-registration-form.tsx",
  "components/events/menu-feedback-controls.tsx",
  "components/events/post-event-feedback-form.tsx",
  "components/member/lesson-progress-control.tsx",
  "components/onboarding/onboarding-form.tsx",
];
for (const path of actionStateModules) {
  const content = read(path);
  assert(
    content.includes("memberErrorMessage"),
    `${path} must filter service errors`,
  );
  assert(
    /role=["{]status/.test(content),
    `${path} must announce action feedback`,
  );
}

const interactiveFiles = [
  ...filesUnder("app"),
  ...filesUnder("components"),
].filter((path) => path.endsWith(".tsx"));
for (const path of interactiveFiles) {
  if (path === "components/auth/auth-panel.tsx") continue;
  const content = read(path);
  assert(
    !/\berror\.message\b/.test(content),
    `${path} must not expose raw service errors`,
  );
}

const authPanel = read("components/auth/auth-panel.tsx");
assert(
  authPanel.includes("safeMessage("),
  "Authentication errors must pass through the auth-safe message filter",
);
for (const contract of [
  "I’m already a member",
  "I’m new here",
  "No password is needed",
  'destinationFor(intent)',
]) {
  assert(
    authPanel.includes(contract),
    `The shared OTP journey must include ${contract}`,
  );
}
const memberSignInPage = read("app/sign-in/page.tsx");
assert(
  !memberSignInPage.includes("/admin/sign-in"),
  "The public sign-in page must not ask people to choose between Member and Admin",
);
const continuationPage = read("app/continue/page.tsx");
for (const contract of ["hasActiveAdminRole", 'redirect("/admin")']) {
  assert(
    continuationPage.includes(contract),
    `Role-aware continuation must include ${contract}`,
  );
}
const memberLanguage = read("lib/member-language.ts");
for (const status of ["pending_review", "approved_pending_payment", "waitlisted"]) {
  assert(
    memberLanguage.includes(status),
    `Friendly member status language must cover ${status}`,
  );
}
const memberErrors = read("lib/member-error.ts");
for (const contract of [
  "Give this member some time before requesting another introduction.",
  "You have several introductions awaiting a response.",
  "You’ve reached today’s introduction limit.",
]) {
  assert(
    memberErrors.includes(contract),
    `Member-safe request boundary errors must include ${contract}`,
  );
}

const adminPage = read("app/admin/page.tsx");
const adminHeader = read("components/admin/admin-header.tsx");
for (const specialist of [
  "EventContentManager",
  "EventMenuManager",
  "EventGalleryManager",
  "LearningManager",
  "CircleManager",
]) {
  assert(
    !adminPage.includes(specialist),
    `Admin cockpit must not eagerly load ${specialist}`,
  );
}
for (const route of [
  "/admin/members",
  "/admin/events",
  "/admin/cohort",
  "/admin/safety",
  "/admin/operations",
  "/admin/support",
  "/admin/privacy",
  "/admin/notifications",
]) {
  assert(
    adminHeader.includes(`href: "${route}"`),
    `Shared Admin shell must link to ${route}`,
  );
}
for (const path of [
  "app/admin/page.tsx",
  "app/admin/operations/page.tsx",
  "app/admin/cohort/page.tsx",
  "app/admin/support/page.tsx",
  "app/admin/privacy/page.tsx",
  "app/admin/notifications/page.tsx",
]) {
  assert(
    read(path).includes("<AdminHeader"),
    `${path} must use the shared Admin shell`,
  );
}
assert(
  adminHeader.includes("admin-mobile-dock") &&
    adminHeader.includes('aria-current={active === item.key'),
  "Shared Admin shell must provide mobile navigation and current-page context",
);
const adminOperations = read("app/admin/operations/page.tsx");
for (const group of [
  "people-and-launch",
  "event-work",
  "safety-work",
  "member-programs",
  "release-tools",
]) {
  assert(
    adminOperations.includes(`id="${group}"`),
    `Admin operations must retain the plain-language ${group} work group`,
  );
}
for (const area of [
  "loadPeople",
  "loadEvents",
  "loadSafety",
  "loadPrograms",
  "loadRelease",
]) {
  assert(
    adminOperations.includes(area),
    `Admin operations must load only the selected ${area} workspace`,
  );
}
assert(
  adminOperations.includes("admin-area-picker") &&
    adminOperations.includes("requestedArea"),
  "Admin operations must provide a focused work-area picker",
);
for (const contract of [
  "LaunchGateControl",
  "list_launch_gate_checks",
  "environmentSignals",
  "launchGateResult.error",
  "DatabaseReadinessPanel",
  "list_database_release_readiness",
  "databaseReadinessResult.error",
  "ModuleReleaseGate",
  "list_module_release_acceptance",
  "moduleReleaseResult.error",
]) {
  assert(
    adminOperations.includes(contract),
    `Admin release controls must include ${contract}`,
  );
}
const moduleReleaseGate = read("components/admin/module-release-gate.tsx");
for (const contract of [
  "Controlled feature opening",
  "Prove each member feature before opening it.",
  "Supabase blocks accidental activation",
  "pausing a feature is always available",
  "save_module_release_check",
  "Record result",
  "passwords, OTPs",
  "20260803050000_module_release_acceptance.sql",
]) {
  assert(
    moduleReleaseGate.includes(contract),
    `Module release Admin UX must include ${contract}`,
  );
}
const databaseReadinessPanel = read(
  "components/admin/database-readiness-panel.tsx",
);
for (const contract of [
  "Production database",
  "Know what is ready before launch.",
  "reads structure only",
  "Database ready",
  "Updates still needed",
  "See {check.missing_items.length} missing database item",
  "20260803010000_production_database_readiness.sql",
]) {
  assert(
    databaseReadinessPanel.includes(contract),
    `Database readiness Admin UX must include ${contract}`,
  );
}
const launchGateControl = read("components/admin/launch-gate-control.tsx");
for (const contract of [
  "Auditable go-live control",
  "save_launch_gate_check",
  "Launch blocked",
  "Record evidence",
  "passwords, OTPs",
]) {
  assert(
    launchGateControl.includes(contract),
    `Launch gate experience must include ${contract}`,
  );
}
for (const [route, area] of Object.entries({
  "app/admin/events/page.tsx": "event-work",
  "app/admin/members/page.tsx": "people-and-launch",
  "app/admin/programs/page.tsx": "member-programs",
  "app/admin/release/page.tsx": "release-tools",
  "app/admin/safety/page.tsx": "safety-work",
})) {
  assert(
    read(route).includes(`?area=${area}#${area}`),
    `${route} must preserve its focused operations deep link`,
  );
}
const adminWorkGroup = read("components/admin/admin-work-group.tsx");
const memberHome = read("app/home/page.tsx");
const upcomingEvents = read("app/events/page.tsx");
const pastEvents = read("app/events/past/page.tsx");
const memberExplore = read("app/explore/page.tsx");
const memberHeader = read("components/member/member-header.tsx");
const memberSearch = read("app/search/page.tsx");
const opportunityMarketplace = read(
  "components/member/opportunity-marketplace.tsx",
);
const membershipCenter = read("components/member/membership-center.tsx");
const orderHistory = read("components/member/order-history.tsx");
const orderReceipt = read("app/orders/[reference]/page.tsx");
for (const contract of [
  "member-activation-compact",
  "member-activation-progress",
  "Recommended now",
  "View every setup step",
  "{orders.length ?",
]) {
  assert(
    memberHome.includes(contract),
    `Compact member Home must include ${contract}`,
  );
}
for (const contract of [
  'href="/search"',
  "Search your table",
  'active === "search"',
]) {
  assert(
    memberHeader.includes(contract),
    `Shared member shell must expose search through ${contract}`,
  );
}
for (const contract of [
  "search_my_table",
  "Find a member, a Community conversation, an event or useful learning",
  "only see information you already have permission to open",
  'role="search"',
  "Start with two or more letters",
  "Search is being prepared",
]) {
  assert(
    memberSearch.includes(contract),
    `Member-wide search UX must include ${contract}`,
  );
}
assert(
  !memberHome.includes('className="member-quickstart"'),
  "Member Home must not repeat its primary actions in oversized quick-start cards",
);
for (const [content, contract, description] of [
  [upcomingEvents, '.gte("ends_at", new Date().toISOString())', "exclude completed events from Upcoming"],
  [upcomingEvents, 'className="event-view-switcher"', "expose the Upcoming/Past switcher"],
  [upcomingEvents, "Events are temporarily unavailable", "distinguish a service error from an empty calendar"],
  [pastEvents, 'className="event-view-switcher"', "expose the Upcoming/Past switcher in the archive"],
  [pastEvents, 'className="past-events-empty"', "use a dedicated readable archive state"],
  [pastEvents, "Your event history will begin here.", "explain when event history appears"],
  [pastEvents, "Continue connections", "retain attendee follow-up actions"],
]) {
  assert(content.includes(contract), `Event experience must ${description}`);
}
for (const contract of [
  "community_host_plan_orders",
  "community_host_plans",
  "community_offers",
]) {
  assert(
    memberHome.includes(contract),
    `Member Home order history must load ${contract}`,
  );
}
for (const contract of [
  "community_host_plan",
  "Host workspace",
  "Open community",
]) {
  assert(
    orderHistory.includes(contract),
    `Member order history must include ${contract}`,
  );
  assert(
    orderReceipt.includes(contract),
    `Member order receipt must include ${contract}`,
  );
}
for (const [content, contract, description] of [
  [memberExplore, "What would you like to do?", "give members one plain-language tool directory"],
  [memberExplore, "Only available", "hide gated tools until they are ready"],
  [memberHeader, 'href: "/communities"', "make Community a primary member destination"],
  [memberHeader, 'href: "/explore"', "keep secondary tools easy to find without crowding Home"],
  [opportunityMarketplace, "initialComposerOpen", "keep the Ask/Offer composer closed until requested"],
  [opportunityMarketplace, "aria-expanded={composerOpen}", "expose composer state accessibly"],
  [membershipCenter, 'className="membership-empty"', "replace an unpublished-plan void with guidance"],
  [membershipCenter, "Your current platform access is unchanged.", "protect members from ambiguous membership messaging"],
]) {
  assert(content.includes(contract), `Member experience must ${description}`);
}
assert(
  adminWorkGroup.includes("hashchange") &&
    adminWorkGroup.includes("detailsRef.current.open = true"),
  "Admin deep links must reveal their collapsed work group",
);
assert(
  memberHome.includes('className="member-more-tools"') &&
    memberHome.includes("Open your member tools"),
  "Member home must progressively disclose secondary tools",
);
for (const contract of [
  '"registration_requests"',
  "Your next table",
  "Seat confirmed",
  "Request your seat",
  "get_my_activation_journey",
  "member-activation",
  "Build two mutual connections",
  "nextBestAction",
  "YourTableToday",
  "Who to meet",
  "Where to participate",
  "What to follow up on",
  "member-home-secondary",
  "Your progress, invitations and account details.",
  "Show more",
]) {
  assert(
    memberHome.includes(contract),
    `Member home next-event journey must include ${contract}`,
  );
}
for (const contract of [
  "member-mobile-dock",
  'aria-label="Member shortcuts"',
  'aria-current={active === destination.key ? "page" : undefined}',
  "/notifications",
  "list_my_community_activity",
  "member-community-badge",
  "newCommunityActivity",
]) {
  assert(
    memberHeader.includes(contract),
    `Shared member navigation must include ${contract}`,
  );
}
const communityRoom = read("app/communities/[slug]/page.tsx");
const communityStyles = read("app/globals.css");
const communityRoster = read(
  "components/member/community-member-roster.tsx",
);
const communityFeed = read("components/member/community-feed.tsx");
const communityProgramming = read(
  "components/member/community-programming.tsx",
);
const communityEventActions = read(
  "components/member/community-event-actions.tsx",
);
const communityCheckIns = read("components/member/community-check-ins.tsx");
const communityCircles = read("components/member/community-circles.tsx");
const communityCircleHostPanel = read(
  "components/member/community-circle-host-panel.tsx",
);
const communityHostPage = read("app/communities/[slug]/host/page.tsx");
const communityModeration = read(
  "components/admin/community-moderation.tsx",
);
const communityHostWorkspace = read(
  "components/member/community-host-workspace.tsx",
);
const communityCommercePanel = read(
  "components/member/community-commerce-panel.tsx",
);
const communityFinancialStatement = read(
  "components/member/community-financial-statement.tsx",
);
const communityDirectory = read("components/member/community-directory.tsx");
const communityPage = read("app/communities/page.tsx");
const communityRoomPage = read("app/communities/[slug]/page.tsx");
const communityManager = read("components/admin/community-manager.tsx");
for (const contract of [
  "community-composer-panel",
  "Start a conversation",
  "Ask, offer or share something useful",
  "composerInitiallyOpen || !initialPosts.length",
]) {
  assert(
    communityFeed.includes(contract),
    `Progressive Community composer must include ${contract}`,
  );
}
for (const contract of [
  "community_acceptance_mode",
  "is_test_account",
  "communityAvailable",
]) {
  assert(
    communityPage.includes(contract) && communityRoomPage.includes(contract),
    `Community pages must enforce controlled rehearsal through ${contract}`,
  );
}
for (const contract of [
  "community_acceptance_mode",
  "is_test_account",
  "communityAcceptanceFlagResult",
]) {
  assert(
    memberHome.includes(contract),
    `Member Home must keep tagged Community rehearsal access through ${contract}`,
  );
}
for (const contract of [
  "Test mode is on",
  "Turn on test mode",
  "marked test accounts",
  "community_acceptance_mode",
]) {
  assert(
    communityManager.includes(contract),
    `Community Admin rehearsal UX must include ${contract}`,
  );
}
const communityHostApplication = read(
  "components/member/community-host-application.tsx",
);
const communityHostCapabilities = read(
  "components/member/community-host-capabilities.tsx",
);
const communityBranding = read(
  "components/member/community-branding-panel.tsx",
);
const creatorCommerceAdmin = read(
  "components/admin/community-creator-commerce-manager.tsx",
);
const communityHostApplicationAdmin = read(
  "components/admin/community-host-application-manager.tsx",
);
const communityHostBillingAdmin = read(
  "components/admin/community-host-billing-manager.tsx",
);
const communityFinanceAdmin = read(
  "components/admin/community-finance-manager.tsx",
);
const communityStartPath = read(
  "components/member/community-start-path.tsx",
);
const communityCompactCss = read("app/community-compact.css");
const rootLayout = read("app/layout.tsx");
const tableJourney = read("components/member/table-journey.tsx");
const communityWelcomeQueue = read(
  "components/member/community-welcome-queue.tsx",
);
const tableJourneyMigration = read(
  "supabase/migrations/20260803130000_table_journey_and_host_welcome.sql",
);
const communityNotificationPreferences = read(
  "components/member/community-notification-preferences.tsx",
);
for (const contract of [
  "CommunityPublicProfilePanel",
  "get_community_public_profile_admin",
  'href="#public-page"',
  "taglineReady",
]) {
  assert(
    communityHostPage.includes(contract),
    `Community Host page must include ${contract}`,
  );
}
for (const contract of [
  "Quick check-ins",
  "Ask one clear question",
  "Start a check-in",
  "Answers never reveal member names",
  "Results appear after at least three members answer",
  "respond_to_community_check_in",
  "close_community_check_in",
  "remove_community_check_in",
  "report_community_check_in",
  "Report privately",
  "Member answers are never included",
  "useActionDialog",
]) {
  assert(
    communityCheckIns.includes(contract),
    `Community Quick Check-in UX must include ${contract}`,
  );
}
for (const contract of [
  "review_community_safety_report",
  "Quick check-in",
  "never general access to private Community feeds",
  "evidence_snapshot.question",
]) {
  assert(
    communityModeration.includes(contract),
    `Unified Community moderation UX must include ${contract}`,
  );
}
for (const contract of [
  "list_community_check_ins",
  "CommunityCheckIns",
  "showToday",
  'view === "overview"',
]) {
  assert(
    communityRoom.includes(contract),
    `Community room must load Quick Check-ins through ${contract}`,
  );
}
for (const contract of [
  "Add to calendar",
  "One day before",
  "One hour before",
  "A reminder does not reserve a seat",
  "set_my_community_event_reminder",
  "text/calendar",
  "BEGIN:VCALENDAR",
]) {
  assert(
    communityEventActions.includes(contract),
    `Community calendar member UX must include ${contract}`,
  );
}
for (const contract of [
  "Your first seven days",
  "Your Table Journey",
  "Make your profile useful",
  "Take your seat in a Community",
  "Join a gathering",
  "Make one trusted connection",
  "Continue the relationship",
  "not a score, requirement or public ranking",
  "communityAvailable",
  "Opening soon",
  "table-journey-unavailable",
]) {
  assert(
    tableJourney.includes(contract),
    `Private Table Journey must include ${contract}`,
  );
}
for (const contract of [
  "Welcome new members",
  "Send welcome",
  "send_community_member_welcome",
  "member score",
  "not private conversations, notes or contact details",
  "useActionDialog",
]) {
  assert(
    communityWelcomeQueue.includes(contract),
    `Community welcome queue must include ${contract}`,
  );
}
for (const contract of [
  "get_my_table_journey",
  "list_community_welcome_queue",
  "send_community_member_welcome",
  "public.can_manage_community",
  "community_member_welcomes",
  "interval '1 hour'",
  "on conflict (community_id, user_id) do nothing",
  "revoke all on table public.community_member_welcomes",
]) {
  assert(
    tableJourneyMigration.includes(contract),
    `Table Journey migration must enforce ${contract}`,
  );
}
const communityPublicProfilePanel = read(
  "components/member/community-public-profile-panel.tsx",
);
for (const contract of [
  "Shareable Community page",
  "Always private",
  "Make this page shareable",
  "save_community_public_profile",
  "Share public page",
  "at least three clear member benefits",
  "Posts, replies, member names",
  "final review",
]) {
  assert(
    communityPublicProfilePanel.includes(contract),
    `Community public-profile Host UX must include ${contract}`,
  );
}
const communityAboutPage = read("app/communities/[slug]/about/page.tsx");
for (const contract of [
  "get_public_community_about",
  "createAdminClient",
  "CommunityAboutAction",
  "Who this is for",
  "What members receive",
  "Community host",
  "Next at the table",
  "Private conversation stays private.",
]) {
  assert(
    communityAboutPage.includes(contract),
    `Shareable Community page must include ${contract}`,
  );
}
const communityAboutAction = read(
  "components/community/community-about-action.tsx",
);
for (const contract of [
  "Sign in to join",
  "View your membership status",
  "Enter Community",
  "Review your request",
  "Joining opens soon",
  "request_community_access",
]) {
  assert(
    communityAboutAction.includes(contract),
    `Community About joining flow must include ${contract}`,
  );
}
const memberSignIn = read("app/sign-in/page.tsx");
assert(
  memberSignIn.includes("safeNext") &&
    memberSignIn.includes('value.startsWith("//")') &&
    authPanel.includes("requestedDestination"),
  "Member sign-in must preserve only a validated same-site destination",
);
const membershipApplicationPage = read("app/apply/page.tsx");
const membershipApplicationForm = read(
  "components/onboarding/membership-application-form.tsx",
);
const memberReview = read("components/admin/member-review.tsx");
for (const contract of [
  "Private membership request",
  "membership_applications",
  "MembershipApplicationForm",
  'redirect("/home")',
]) {
  assert(
    membershipApplicationPage.includes(contract),
    `Membership application page must include ${contract}`,
  );
}
for (const contract of [
  "About you",
  "Your purpose",
  "Review",
  "submit_membership_application",
  "Request received",
  "Community Guidelines",
  "Your invitation is recognised",
  "Choose the closest answer",
  "Who should we thank?",
]) {
  assert(
    membershipApplicationForm.includes(contract),
    `Membership application journey must include ${contract}`,
  );
}
const referralCenter = read("components/member/referral-center.tsx");
for (const contract of [
  "You make a thoughtful introduction",
  "Our team checks it privately",
  "She chooses whether to join",
  "Send for private review",
  "Now a member",
]) {
  assert(
    referralCenter.includes(contract),
    `Member referral journey must include ${contract}`,
  );
}
for (const contract of [
  "What brings her to the table",
  "Approve and welcome",
  "Decline request",
  "applicationJourneyReady",
]) {
  assert(
    memberReview.includes(contract),
    `Admin membership review must include ${contract}`,
  );
}
const publicHome = read("app/page.tsx");
for (const contract of [
  "Where African women",
  "Your people, in one calm place.",
  "Verify your email",
  "Thoughtful review",
  "Private by design",
]) {
  assert(publicHome.includes(contract), `Public home must include ${contract}`);
}
for (const contract of [
  'active="community"',
  "CommunityLocalNavigation",
  "Conversations",
  "Gatherings",
  "People",
  "showToday",
  "showConversations",
  "showGatherings",
  "showPeople",
  "list_community_member_directory",
  "get_my_community_start_path",
  "CommunityStartPath",
  "list_community_brand_identities",
  "list_community_post_media",
  "list_community_post_edit_states",
  "get_community_read_summary",
  "list_community_post_read_states",
  "list_community_conversation_page",
  "list_community_comments_for_posts",
  "list_community_post_media_for_posts",
  "initialHasMore",
  "createSignedUrl",
  "mediaReady",
  "community-room-cover",
  "list_community_circle_programs",
  "CommunityCircles",
  "list_community_gathering_cards",
  "CommunityGatherings",
]) {
  assert(
    communityRoom.includes(contract),
    `Community Hub must include ${contract}`,
  );
}
for (const contract of [
  "CommunityActivitySummary",
  "new_activity_count",
  "has-new-activity",
  "community-directory-activity-badge",
  "See new updates",
  "statePriority",
]) {
  assert(
    communityDirectory.includes(contract),
    `Community return directory must include ${contract}`,
  );
}
for (const contract of [
  "list_my_community_activity",
  "activityByCommunity",
]) {
  assert(
    communityPage.includes(contract),
    `Community landing must include ${contract}`,
  );
}
const communityReturnCard = read("components/member/community-return-card.tsx");
for (const contract of [
  "Your Community",
  "Community · Opening soon",
  "Preview Community",
  "Find one room that feels relevant",
  "Invitation waiting",
  "Ready for payment",
  "Request under review",
  "See what is new",
  "You are all caught up",
]) {
  assert(
    communityReturnCard.includes(contract),
    `Member home Community return card must include ${contract}`,
  );
}
for (const contract of [
  "YourTableToday",
  "activeHomeCommunity",
  "list_my_community_activity",
  "list_communities",
  "communityEnabled",
]) {
  assert(
    memberHome.includes(contract),
    `Member home Community return loop must include ${contract}`,
  );
}
for (const contract of [
  "Your next step",
  "Introduce yourself",
  "Join a conversation",
  "Meet a member",
  "Join the next event",
  "both people agree to connect",
  "never have to post just to stay active",
  "has_accepted_connection",
]) {
  assert(
    communityStartPath.includes(contract),
    `Member Community start path must include ${contract}`,
  );
}
assert(
  rootLayout.includes('import "./community-compact.css"'),
  "Root layout must load the final Community compact layer",
);
for (const contract of [
  "--community-shell",
  ".community-member-rooms .community-directory-card",
  ".community-room-hero.has-cover",
  ".community-start-path",
  ".community-overview-links",
  ".community-conversation-shell",
  "@media (max-width: 620px)",
  "backdrop-filter: blur(14px)",
]) {
  assert(
    communityCompactCss.includes(contract),
    `Compact Community experience must include ${contract}`,
  );
}
for (const contract of [
  "create_structured_community_post",
  "create_community_comment",
  "delete_community_comment",
  "set_community_post_appreciation",
  "set_community_post_saved",
  "set_community_post_followed",
  "set_community_post_pinned",
  "What are you sharing?",
  "Save privately",
  "Follow replies",
  "Report privately",
  "Search posts",
  "Most active",
  "My conversations",
  "Clear filters",
  "navigator.clipboard.writeText",
  "Copy conversation link",
  'id={`conversation-${post.post_id}`}',
  "conversationTypeHints",
  "attach_community_post_media",
  'from("community-media")',
  "Image description",
  "PDF document",
  "Secure link",
  "community-post-image",
  "community-post-document",
  "community-post-link",
  "edit_community_post",
  "Edit this conversation?",
  "Previous versions remain private",
  "Save changes",
  "Edited",
  "mark_community_caught_up",
  "New for you",
  "Mark all as seen",
  "is_new",
  "new_reply_count",
  "loadOlder",
  "Load older conversations",
  "cursor_activity_at",
  "paginationReady",
  "groups of 20",
]) {
  assert(
    communityFeed.includes(contract),
    `Structured Community conversation UX must include ${contract}`,
  );
}
assert(
  communityRoom.lastIndexOf("<CommunityFeed") <
    communityRoom.lastIndexOf("<CommunityProgramming"),
  "Community conversations must appear before programming in the active room flow",
);
assert(
  communityRoom.lastIndexOf("<CommunityFeed") <
    communityRoom.lastIndexOf("<CommunityMemberRoster"),
  "Community conversations must appear before the member roster",
);
assert(
  communityRoom.lastIndexOf("<CommunityNotificationPreferences") >
    communityRoom.lastIndexOf("<CommunityMemberRoster"),
  "Community notification preferences must remain secondary to room participation",
);
for (const contract of [
  'id="gatherings"',
  'id="resources"',
  "Meet in person or online.",
  "chosen by the community leader",
  "Open community controls",
]) {
  assert(
    communityProgramming.includes(contract),
    `Community programming UX must include ${contract}`,
  );
}
for (const contract of [
  "get_community_host_health",
  "list_community_members",
  "list_community_programming_options",
  "get_community_continuity_summary",
  "list_community_introduction_followups",
  "list_community_outcome_trends",
  'active="community"',
  "Manage community",
  "get_community_host_commerce",
  "CommunityCommercePanel",
  'href="#commerce"',
  "hostBilling?.grace_days",
  "get_community_financial_summary",
  "list_community_financial_statement",
  "CommunityFinancialStatement",
  'href="#statement"',
  "get_community_host_capabilities",
  "CommunityHostCapabilitiesPanel",
  'href="#host-tools"',
  "advancedAnalytics",
  "automations",
  "CommunityBrandingPanel",
  'href="#identity"',
  "list_community_circle_options",
  "CommunityCircleHostPanel",
  'href="#circle-programming"',
]) {
  assert(
    communityHostPage.includes(contract),
    `Community Host route must include ${contract}`,
  );
}
for (const contract of [
  "Small groups",
  "Get to know a few members better.",
  "assigned to your Circle can see its members and conversations.",
  "/circles?circle=",
  "Join this Circle",
  "show your Circle after the group is confirmed",
]) {
  assert(
    communityCircles.includes(contract),
    `Community Circle member UX must include ${contract}`,
  );
}
for (const contract of [
  "set_community_circle_cycle_link",
  "Matching,",
  "Hide from community",
  "Show in community",
  "migrationReady",
]) {
  assert(
    communityCircleHostPanel.includes(contract),
    `Community Circle host UX must include ${contract}`,
  );
}
for (const contract of [
  "Look &amp; feel",
  "Make the community recognisable",
  "Private preview",
  "save_community_brand_identity",
  'from("community-media")',
  "Community logo",
  "Cover image",
  "Accent colour",
  "Private until your Community is ready",
  "p_remove_icon",
  "p_remove_cover",
]) {
  assert(
    communityBranding.includes(contract),
    `Community brand identity UX must include ${contract}`,
  );
}
for (const contract of [
  "Plans &amp; tools",
  "Community management",
  "Member health insights",
  "Member reminders",
  "Paid memberships",
  "Moderator places",
  "Choose a community plan",
  "Review or change plan",
]) {
  assert(
    communityHostCapabilities.includes(contract),
    `Community host capability UX must include ${contract}`,
  );
}
for (const contract of [
  "Plans &amp; payments",
  "Three checks protect you and your members",
  "accept_community_host_terms",
  "save_community_offer",
  "Automatic with Paystack",
  "Our team confirms each payment",
  "Closed — preserve approvals",
  "Held for you",
  "paidPublishReady",
  "Choose the plan that fits your community.",
  "create_community_host_plan_order",
  "communityHostPlanId",
  "Payment in review",
  "Host plan selection is not open yet.",
  "Plan renewal",
  "Keep your community controls available.",
  "Renew current plan",
  "Schedule a plan change",
  "Next plan secured",
  "Paid member checkout is safely paused.",
]) {
  assert(
    communityCommercePanel.includes(contract),
    `Community host commerce UX must include ${contract}`,
  );
}
for (const contract of [
  "Community earnings",
  "See where every payment goes.",
  "Available for payout",
  "Payment costs and refunds",
  "Recent payments and adjustments",
  "Payouts reviewed manually",
]) {
  assert(
    communityFinancialStatement.includes(contract),
    `Creator statement UX must include ${contract}`,
  );
}
for (const contract of [
  "Host plan billing",
  "set_community_host_billing_configuration",
  "review_community_host_plan_order",
  "Automatic with Paystack",
  "Manual Admin verification",
  "Closed — no new plan orders",
  "It never removes an",
  "Renewal grace period",
  "reconcile_community_host_subscriptions",
  "Renewals and expiry protection",
  "Offers needing pause",
]) {
  assert(
    communityHostBillingAdmin.includes(contract),
    `Host plan billing Admin UX must include ${contract}`,
  );
}
for (const contract of [
  "Creator reconciliation",
  "record_community_financial_adjustment",
  "open_community_financial_case",
  "review_community_financial_case",
  "create_community_settlement_batch",
  "review_community_settlement_batch",
  "mark_community_settlement_paid",
  "Automatic payouts off",
  "Drafting never sends money",
]) {
  assert(
    communityFinanceAdmin.includes(contract),
    `Creator finance Admin UX must include ${contract}`,
  );
}
for (const contract of [
  "approved_pending_payment",
  "Ready for payment",
  "create_community_order",
  "communityOfferId",
  "Payment is not open yet",
  "Send payment for review",
  'id="your-communities"',
  "Pick up where you left off",
  'id="discover-communities"',
  "Choose a purpose you share",
  "Search communities",
  "Clear search",
  "community-directory-icon",
  "item.tagline || item.description",
]) {
  assert(
    communityDirectory.includes(contract),
    `Community member discovery and checkout UX must include ${contract}`,
  );
}
for (const contract of [
  'href="#create-community"',
  "CommunityHostApplication",
  "list_my_community_host_applications",
  "community-landing-navigation",
  "Find your people.",
  "Opening soon",
  "community-preview-panel",
]) {
  assert(
    communityPage.includes(contract),
    `Community landing must expose host admission through ${contract}`,
  );
}
for (const contract of [
  "Start a community",
  "Start your application",
  "Tell us your idea",
  "We review it",
  "Set up privately",
  "save_community_host_application",
  "withdraw_community_host_application",
  "Update and resubmit",
  "Manage community",
  "Community Guidelines",
  "applicationSteps",
  "data-host-step",
  "checkValidity",
  "Does this feel right?",
  "Send my application",
  "prepared privately",
  "memberErrorMessage",
]) {
  assert(
    communityHostApplication.includes(contract),
    `Member host application UX must include ${contract}`,
  );
}
for (const contract of [
  "Community applications",
  "review_community_host_application",
  "Start review",
  "Request changes",
  "Approve and create draft",
  "Approval never publishes a room",
  "Open release checks",
  "adminErrorMessage",
]) {
  assert(
    communityHostApplicationAdmin.includes(contract),
    `Community application Admin UX must include ${contract}`,
  );
}
for (const contract of [
  "Community creator commerce",
  "save_community_host_plan",
  "grant_community_host_plan",
  "review_community_host_payout",
  "review_community_order",
  "Pause all checkout",
  "Automatic host payouts are not enabled",
]) {
  assert(
    creatorCommerceAdmin.includes(contract),
    `Creator commerce Admin UX must include ${contract}`,
  );
}
for (const contract of [
  "Join requests",
  "Questions without replies",
  "Safety reports",
  "review_community_membership",
  "invite_community_member",
  "set_community_event_link",
  "set_community_course_link",
  "Only approved Her Africa Table members can join",
  "Contact platform safety",
  'id="continuity"',
  "numbers describe the community as a whole",
  "Not enough data yet",
  "at least three members",
  "Send reminder",
  "send_community_introduction_nudge",
  "One reminder per week",
  "never names, relationship",
  "memberErrorMessage",
  "Member health insights are not in your current plan",
  "Introduction reminders are not included in your current plan",
  "Available on a plan with reminders",
]) {
  assert(
    communityHostWorkspace.includes(contract),
    `Community Host workspace must include ${contract}`,
  );
}
for (const contract of [
  "Show replies in Updates",
  "Email me about replies",
  "Weekly community summary",
  "Email the weekly summary",
  "update_community_notification_preferences",
  "Open all update choices",
  "memberErrorMessage",
]) {
  assert(
    communityNotificationPreferences.includes(contract),
    `Community notification choices must include ${contract}`,
  );
}
for (const contract of [
  "Meet the people here.",
  "Contact details",
  'href={`/members/${member.user_id}`}',
]) {
  assert(
    communityRoster.includes(contract),
    `Privacy-safe community roster must include ${contract}`,
  );
}
for (const contract of [
  "overflow-x: clip",
  "grid-template-columns: repeat(auto-fit, minmax(108px, 1fr))",
  "font-size: clamp(2.75rem, 12vw, 3.35rem)",
  ".community-preview-copy .journey-state-actions .button",
  ".community-directory-card > footer > .button",
]) {
  assert(
    communityStyles.includes(contract),
    `Community mobile clarity layer must include ${contract}`,
  );
}
for (const path of [
  "app/home/page.tsx",
  "app/network/page.tsx",
  "app/messages/page.tsx",
  "app/profile/page.tsx",
  "app/settings/page.tsx",
]) {
  assert(
    read(path).includes("MemberHeader"),
    `${path} must use the shared member navigation shell`,
  );
}
const networkHub = read("components/member/network-hub.tsx");
assert(
  networkHub.indexOf('className="member-directory"') <
    networkHub.indexOf('className="network-code-tools"') &&
    networkHub.includes("Show members"),
  "Member discovery must appear before optional in-person connection codes",
);
for (const contract of [
  "directory-filters",
  "What would you like?",
  "Ask to connect",
  "request_connection_with_context",
  "save_member_profile",
  "People you saved",
  "Start with these members",
  "You may have something in common",
  "Someone you may enjoy meeting",
  "You each decide privately",
  "respond_to_curated_introduction",
  "Add reminder",
  "Your reminder",
  "save_connection_followup",
  "complete_connection_followup",
  "Add result",
  "record_connection_outcome",
  "update_connection_outcome",
  "Count this anonymously in Community results",
  "Choose a network view",
  'aria-pressed={networkView === view.id}',
  "No invitations waiting",
  "No connections yet",
  "No notes or reminders yet",
  "More options",
  "Included anonymously in totals",
  "Only you can see this",
  "Her note to you",
  "Messaging opens when you both agree",
  'href={`/members/${member.user_id}`}',
]) {
  assert(
    networkHub.includes(contract),
    `Member discovery v2 must include ${contract}`,
  );
}
const memberProfilePage = read("app/members/[id]/page.tsx");
for (const contract of [
  "get_member_profile",
  "Privacy",
  "Contact stays private",
  "MemberProfileActions",
]) {
  assert(
    memberProfilePage.includes(contract),
    `Privacy-safe member profile journey must include ${contract}`,
  );
}
const memberProfileActions = read(
  "components/member/member-profile-actions.tsx",
);
for (const contract of [
  "request_connection_with_context",
  "respond_to_connection",
  "ensure_conversation",
  "report_member",
  "block_member",
  "save_member_profile",
  "remove_saved_member_profile",
]) {
  assert(
    memberProfileActions.includes(contract),
    `Member profile actions must retain ${contract}`,
  );
}
const accountSettings = read("components/member/account-settings.tsx");
for (const contract of [
  "How would you like to connect?",
  "Open to introductions",
  "Curated only",
  "Pause new introductions",
  "set_my_connection_preferences",
]) {
  assert(
    accountSettings.includes(contract),
    `Member connection boundaries must include ${contract}`,
  );
}
const networkPage = read("app/network/page.tsx");
for (const contract of ["p_city:", "p_goal:", "cityFilter=", "goalFilter="]) {
  assert(
    networkPage.includes(contract),
    `Member discovery filters must preserve ${contract}`,
  );
}
const messageCenter = read("components/member/message-center.tsx");
assert(
  messageCenter.includes("message-shell${conversations.length") &&
    messageCenter.includes("When you both") &&
    messageCenter.includes("agreed to connect"),
  "Empty messages must explain the accepted-connection next step once",
);
assert(
  memberHome.includes("list_due_connection_followups") &&
    memberHome.includes("Keep in touch"),
  "Member Home must calmly surface due private relationship follow-ups",
);
const communityOutcomeSummary = read(
  "components/admin/community-outcome-summary.tsx",
);
for (const contract of [
  "What the community made possible",
  "category totals only",
  "never names",
  "excludes every tagged test identity",
  "at least three different real members",
  "suppressed to protect member privacy",
]) {
  assert(
    communityOutcomeSummary.includes(contract),
    `Admin anonymous outcome summary must include ${contract}`,
  );
}
assert(
  networkPage.includes("list_my_connection_outcomes") &&
    networkPage.includes("outcomes="),
  "Member Network must load private connection outcomes through its scoped function",
);

const cohortMigration = read(
  "supabase/migrations/20260727110000_founding_cohort_activation.sql",
);
const cohortCorrection = read(
  "supabase/migrations/20260727120000_founding_cohort_corrections.sql",
);
for (const contract of [
  "community_cohorts",
  "community_introductions",
  "sync_cohort_invitations",
  "'invited'",
  "not public.is_blocked_pair",
  "follow_up_until <= now()",
  "list_cohort_health",
]) {
  assert(
    cohortMigration.includes(contract),
    `Founding cohort lifecycle must include ${contract}`,
  );
}
assert(
  cohortCorrection.includes("membership.user_id = auth.uid()") &&
    cohortCorrection.includes("membership.status = 'active'"),
  "Cohort introduction membership checks must use unambiguous qualified columns",
);
assert(
  read("components/member/community-directory.tsx").includes(
    "respond_to_community_invitation",
  ),
  "Cohort invitations must require an explicit member acceptance action",
);
const cohortMemberExperience = read(
  "components/member/cohort-activation.tsx",
);
for (const contract of [
  "Who are you?",
  "What are you building?",
  "What can you offer?",
  "What are you seeking?",
  "Only accepted members",
]) {
  assert(
    cohortMemberExperience.includes(contract),
    `Guided cohort introduction must include ${contract}`,
  );
}
assert(
  cohortMemberExperience.includes("request_connection") &&
    cohortMemberExperience.includes("Private contact details remain hidden"),
  "Founding-room introductions must support direct consent-gated connections",
);
const profileEditor = read("components/member/profile-editor.tsx");
for (const contract of [
  "update_member_profile",
  "mutually accepted",
  "share_phone",
  "memberErrorMessage",
  'role="status"',
]) {
  assert(
    profileEditor.includes(contract),
    `Editable member profile must include ${contract}`,
  );
}
const attendeeDirectory = read(
  "components/events/event-attendee-directory.tsx",
);
for (const contract of [
  "save_event_attendee_visibility",
  "request_connection",
  "Joining is optional",
  "private contact details are never shown",
  "memberErrorMessage",
]) {
  assert(
    attendeeDirectory.includes(contract),
    `Event attendee discovery must include ${contract}`,
  );
}
const eventFollowUp = read("app/events/[slug]/follow-up/page.tsx");
for (const contract of [
  "list_my_past_events",
  "list_event_attendee_directory",
  'mode="after"',
  "Your private event follow-up",
  "community_event_links",
  "moment=event-follow-up",
  "Continue in ${linkedCommunity!.name}",
]) {
  assert(
    eventFollowUp.includes(contract),
    `Post-event member journey must include ${contract}`,
  );
}
for (const contract of [
  'requestedSearch.moment === "event-follow-up"',
  'initialComposerType={isEventFollowUp ? "event_follow_up" : "discussion"}',
  "What would you like to carry forward from the event?",
]) {
  assert(
    communityRoom.includes(contract),
    `Event-to-Community continuation must include ${contract}`,
  );
}
assert(
  communityFeed.includes("composerInitiallyOpen") &&
    communityFeed.includes('id="create-conversation"') &&
    communityFeed.includes("open={composerExpanded}") &&
    communityFeed.includes("onToggle="),
  "Event follow-up must open the Community composer without trapping it open",
);
const explorePage = read("app/explore/page.tsx");
assert(
  explorePage.includes("visibleGroups") &&
    explorePage.includes("Only available") &&
    !explorePage.includes('aria-disabled="true"'),
  "Explore must show only member tools that are ready to use",
);
const activityPage = read("app/notifications/page.tsx");
for (const contract of [
  "list_my_conversations",
  "list_my_network",
  'label="Updates"',
]) {
  assert(
    activityPage.includes(contract),
    `Unified Activity page must include ${contract}`,
  );
}
const activityCenter = read("components/member/notification-center.tsx");
for (const contract of [
  "activity-overview",
  "activity-filters",
  "Unread messages",
  "People waiting to connect",
]) {
  assert(
    activityCenter.includes(contract),
    `Unified Activity centre must include ${contract}`,
  );
}
const attendeeMigration = read(
  "supabase/migrations/20260727130000_member_profile_attendee_discovery.sql",
);
for (const contract of [
  "event_attendee_preferences",
  "Confirmed event attendance required",
  "not public.is_blocked_pair",
  "profile.visibility_paused",
  "'member.profile_updated'",
]) {
  assert(
    attendeeMigration.includes(contract),
    `Profile and attendee boundaries must include ${contract}`,
  );
}
assert(
  !attendeeMigration
    .split("create or replace function public.list_event_attendee_directory")[1]
    .split("revoke all on function")[0]
    .includes("profile_private"),
  "Event attendee discovery must never project private profile contacts",
);
const cohortAdmin = read("components/admin/cohort-activation-manager.tsx");
assert(
  cohortAdmin.includes("Nobody enters the room until she accepts") &&
    cohortAdmin.includes("Invite eligible members") &&
    cohortAdmin.includes("Cohort health"),
  "Admin cohort operations must explain and preserve consent boundaries",
);
const communityReleaseGate = read(
  "components/admin/community-release-gate.tsx",
);
for (const contract of [
  "Nairobi release acceptance",
  "Evidence—not activity volume—controls publication",
  "Backup moderator",
  "Publishing is database-blocked",
  "save_community_release_check",
  "publish_community_after_acceptance",
  "Publish accepted community",
  "Return to controlled draft",
  "adminErrorMessage",
  "useActionDialog",
]) {
  assert(
    communityReleaseGate.includes(contract),
    `Community release acceptance UX must include ${contract}`,
  );
}
const adminCohortPage = read("app/admin/cohort/page.tsx");
assert(
  adminCohortPage.includes("list_community_release_checks") &&
    adminCohortPage.includes("CommunityReleaseGate") &&
    adminCohortPage.includes("list_communities") &&
    adminCohortPage.includes("community-release-community-picker") &&
    adminCohortPage.includes("selectedReleaseId"),
  "Admin must load the release gate for every managed Community",
);
assert(
  communityManager.includes("Review release checklist") &&
    communityManager.includes("/admin/cohort?community="),
  "Community Admin must link each managed room to its release checklist",
);

const tableInvitationMigration = read(
  "supabase/migrations/20260812150000_destination_aware_table_invitations.sql",
);
for (const contract of [
  "create_table_invitation",
  "review_table_invitation",
  "preview_table_invitation",
  "claim_table_invitation",
  "resume_table_invitations_after_activation",
  "digest(raw_token, 'sha256')",
  "target.invitee_email",
  "'table_invitation'",
]) {
  assert(
    tableInvitationMigration.includes(contract),
    `Destination-aware invitations must include ${contract}`,
  );
}
const invitationPanel = read(
  "components/member/destination-invitation-panel.tsx",
);
assert(
  invitationPanel.includes("create_table_invitation") &&
    invitationPanel.includes("We do not upload or store your") &&
    invitationPanel.includes("router.refresh"),
  "Hosts must send and review invitation state without leaving the destination",
);
const invitationClaim = read("components/member/table-invitation-claim.tsx");
assert(
  invitationClaim.includes("claim_table_invitation") &&
    invitationClaim.includes("Your invitation is saved") &&
    !invitationClaim.includes("window.location"),
  "Invitation claims must stay visible and preserve a pending membership destination",
);
const adminInvitationPage = read("app/admin/invitations/page.tsx");
const adminInvitationManager = read(
  "components/admin/table-invitation-manager.tsx",
);
assert(
  adminInvitationPage.includes("list_admin_table_invitations") &&
    adminInvitationManager.includes("Approve and email") &&
    adminInvitationManager.includes("review_table_invitation") &&
    adminInvitationManager.includes("Resend"),
  "Super Admin must review external invitations before Resend delivery",
);
const emailSender = read("lib/notifications/email.ts");
assert(
  emailSender.includes('"table_invitation"') &&
    emailSender.includes('"referral_invitation"') &&
    emailSender.includes("https://api.resend.com/emails") &&
    emailSender.includes("Open your invitation"),
  "Approved personal invitations must use the real Resend notification sender",
);

console.log(
  `Journey-state contracts passed: ${Object.keys(boundaryContracts).length} route boundaries, ${refreshModules.length} non-destructive refresh workflows, responsive shared member navigation, people-first discovery, lightweight Admin cockpit, editable profiles, opt-in attendee discovery, consent-based founding cohort, and 5 guided operations groups.`,
);
