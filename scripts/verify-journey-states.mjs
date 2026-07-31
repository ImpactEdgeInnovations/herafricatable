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
  "components/admin/event-content-manager.tsx",
  "components/admin/event-feedback-manager.tsx",
  "components/admin/event-gallery-manager.tsx",
  "components/admin/event-manager.tsx",
  "components/admin/event-menu-manager.tsx",
  "components/admin/learning-manager.tsx",
  "components/admin/marketplace-moderation.tsx",
  "components/admin/membership-manager.tsx",
  "components/admin/moderation-queue.tsx",
  "components/admin/perks-manager.tsx",
  "components/admin/referral-manager.tsx",
  "components/admin/registration-manager.tsx",
  "components/member/circles-hub.tsx",
  "components/member/community-directory.tsx",
  "components/member/community-feed.tsx",
  "components/member/community-host-workspace.tsx",
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
]) {
  assert(
    adminOperations.includes(contract),
    `Admin release controls must include ${contract}`,
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
  [memberExplore, "More ways to use the table.", "give members one plain-language tool directory"],
  [memberExplore, "Nothing needed from you", "explain gated tools without creating false work"],
  [memberHeader, 'href: "/communities"', "make Community a primary member destination"],
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
  'className="member-next-event"',
  '"registration_requests"',
  "Your next table",
  "Seat confirmed",
  "Request your seat",
  "get_my_activation_journey",
  "member-activation",
  "Build two mutual connections",
  "nextBestAction",
  "member-next-action",
  "Recommended next",
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
]) {
  assert(
    memberHeader.includes(contract),
    `Shared member navigation must include ${contract}`,
  );
}
const communityRoom = read("app/communities/[slug]/page.tsx");
const communityRoster = read(
  "components/member/community-member-roster.tsx",
);
const communityFeed = read("components/member/community-feed.tsx");
const communityProgramming = read(
  "components/member/community-programming.tsx",
);
const communityHostPage = read("app/communities/[slug]/host/page.tsx");
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
const communityHostApplication = read(
  "components/member/community-host-application.tsx",
);
const communityHostCapabilities = read(
  "components/member/community-host-capabilities.tsx",
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
const communityNotificationPreferences = read(
  "components/member/community-notification-preferences.tsx",
);
for (const contract of [
  'active="community"',
  "community-room-navigation",
  "Overview",
  "Conversations",
  "Members",
  "Gatherings",
  "Resources",
  "list_community_member_directory",
  "get_my_community_start_path",
  "CommunityStartPath",
]) {
  assert(
    communityRoom.includes(contract),
    `Community Hub must include ${contract}`,
  );
}
for (const contract of [
  "Recommended now",
  "Begin with context",
  "Contribute something useful",
  "Build one mutual connection",
  "Continue around the table",
  "mutual acceptance",
  "There is no activity quota",
  "has_accepted_connection",
]) {
  assert(
    communityStartPath.includes(contract),
    `Member Community start path must include ${contract}`,
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
  "Conversation type",
  "Save privately",
  "Follow replies",
  "Report privately",
  "Find a conversation",
  "Most active",
  "My conversations",
  "Clear filters",
  "navigator.clipboard.writeText",
  "Copy conversation link",
  'id={`conversation-${post.post_id}`}',
  "conversationTypeHints",
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
  "Meet with shared context.",
  "A small, host-curated shelf",
  "Open host workspace",
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
  "Private host workspace",
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
]) {
  assert(
    communityHostPage.includes(contract),
    `Community Host route must include ${contract}`,
  );
}
for (const contract of [
  "Your host tools",
  "Core stewardship",
  "Advanced insights",
  "Host reminders",
  "Paid community",
  "Moderator seats",
  "Choose a host plan",
  "Review or change plan",
]) {
  assert(
    communityHostCapabilities.includes(contract),
    `Community host capability UX must include ${contract}`,
  );
}
for (const contract of [
  "Community creator commerce",
  "Three safeguards before paid access",
  "accept_community_host_terms",
  "save_community_offer",
  "Automatic with Paystack",
  "Manual admin verification",
  "Closed — preserve approvals",
  "Held for you",
  "paidPublishReady",
  "Choose the plan that fits your room.",
  "create_community_host_plan_order",
  "communityHostPlanId",
  "Payment in review",
  "Host plan selection is not open yet.",
  "Plan continuity",
  "Keep your host workspace uninterrupted.",
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
  "Creator statement",
  "Every movement, explained.",
  "Available after reconciliation",
  "Provider costs and refunds",
  "Recent statement entries",
  "Automatic payouts off",
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
  "Host approved",
  "create_community_order",
  "communityOfferId",
  "Payment opening soon",
  "Submit for verification",
  'id="your-communities"',
  "Continue where you belong",
  'id="discover-communities"',
  "Find a room with purpose",
  "Search communities",
  "Clear search",
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
  "A quieter way",
  "Private preview",
  "community-preview-panel",
]) {
  assert(
    communityPage.includes(contract),
    `Community landing must expose host admission through ${contract}`,
  );
}
for (const contract of [
  "Create a community",
  "Apply to create a community",
  "Share the idea",
  "Complete review",
  "Prepare in private",
  "save_community_host_application",
  "withdraw_community_host_application",
  "Update and resubmit",
  "Open host workspace",
  "Community Guidelines",
  "private draft",
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
  "Awaiting admission",
  "Asks needing care",
  "Safety signals",
  "review_community_membership",
  "invite_community_member",
  "set_community_event_link",
  "set_community_course_link",
  "Community admission is separate from platform approval",
  "Contact platform safety",
  'id="continuity"',
  "These are shared room signals, not member scores",
  "Building baseline",
  "at least three different",
  "Send gentle reminder",
  "send_community_introduction_nudge",
  "One reminder per week",
  "never names, relationship",
  "memberErrorMessage",
  "Advanced insights are not in this plan",
  "Gentle host reminders are not included in the active host plan",
  "Available with Host reminders",
]) {
  assert(
    communityHostWorkspace.includes(contract),
    `Community Host workspace must include ${contract}`,
  );
}
for (const contract of [
  "Replies in Activity",
  "Email me about replies",
  "Weekly room briefing",
  "Send the briefing by email",
  "update_community_notification_preferences",
  "Open main Activity settings",
  "memberErrorMessage",
]) {
  assert(
    communityNotificationPreferences.includes(contract),
    `Community notification choices must include ${contract}`,
  );
}
for (const contract of [
  "Meet with context.",
  "Private contact details remain protected",
  'href={`/members/${member.user_id}`}',
]) {
  assert(
    communityRoster.includes(contract),
    `Privacy-safe community roster must include ${contract}`,
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
    networkHub.includes("Find members"),
  "Member discovery must appear before optional in-person connection codes",
);
for (const contract of [
  "directory-filters",
  "Current goal",
  "Request introduction",
  "request_connection_with_context",
  "save_member_profile",
  "Saved for later",
  "People you may want to meet",
  "Why this suggestion",
  "A thoughtful person to meet",
  "Both of you decide independently",
  "respond_to_curated_introduction",
  "Plan follow-up",
  "Your private plan",
  "save_connection_followup",
  "complete_connection_followup",
  "Record outcome",
  "record_connection_outcome",
  "update_connection_outcome",
  "You can change or withdraw anonymous sharing at any time",
  "Choose a network view",
  'aria-pressed={networkView === view.id}',
  "No requests waiting",
  "No active connections yet",
  "No private relationship history yet",
  "More options",
  "Eligible for anonymous totals",
  "Completely private",
  "Why she would like to connect",
  "Messaging opens only after she accepts",
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
  "Private by design",
  "Connection comes first",
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
    messageCenter.includes("Messaging opens only"),
  "Empty messages must explain the accepted-connection next step once",
);
assert(
  memberHome.includes("list_due_connection_followups") &&
    memberHome.includes("A relationship to nurture"),
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
]) {
  assert(
    eventFollowUp.includes(contract),
    `Post-event member journey must include ${contract}`,
  );
}
const activityPage = read("app/notifications/page.tsx");
for (const contract of [
  "list_my_conversations",
  "list_my_network",
  'label="Activity"',
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
  "Unread conversations",
  "Connection requests",
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
    adminCohortPage.includes("CommunityReleaseGate"),
  "Admin founding cohort must load the Community release gate",
);

console.log(
  `Journey-state contracts passed: ${Object.keys(boundaryContracts).length} route boundaries, ${refreshModules.length} non-destructive refresh workflows, responsive shared member navigation, people-first discovery, lightweight Admin cockpit, editable profiles, opt-in attendee discovery, consent-based founding cohort, and 5 guided operations groups.`,
);
