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

const adminPage = read("app/admin/page.tsx");
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
]) {
  assert(
    adminPage.includes(`href="${route}"`),
    `Admin cockpit must link to ${route}`,
  );
}
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
const adminWorkGroup = read("components/admin/admin-work-group.tsx");
assert(
  adminWorkGroup.includes("hashchange") &&
    adminWorkGroup.includes("detailsRef.current.open = true"),
  "Admin deep links must reveal their collapsed work group",
);
const memberHome = read("app/home/page.tsx");
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
  'className="member-activation"',
  "Build two mutual connections",
]) {
  assert(
    memberHome.includes(contract),
    `Member home next-event journey must include ${contract}`,
  );
}
const memberHeader = read("components/member/member-header.tsx");
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
    networkHub.includes("Search members"),
  "Member discovery must appear before optional in-person connection codes",
);
const messageCenter = read("components/member/message-center.tsx");
assert(
  messageCenter.includes("message-shell${conversations.length") &&
    messageCenter.includes("Messaging opens only"),
  "Empty messages must explain the accepted-connection next step once",
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

console.log(
  `Journey-state contracts passed: ${Object.keys(boundaryContracts).length} route boundaries, ${refreshModules.length} non-destructive refresh workflows, responsive shared member navigation, people-first discovery, lightweight Admin cockpit, editable profiles, opt-in attendee discovery, consent-based founding cohort, and 5 guided operations groups.`,
);
