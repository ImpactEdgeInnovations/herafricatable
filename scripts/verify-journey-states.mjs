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
  "components/member/learning-catalog.tsx",
  "components/member/membership-center.tsx",
  "components/member/network-hub.tsx",
  "components/member/opportunity-marketplace.tsx",
  "components/member/order-history.tsx",
  "components/member/perks-gallery.tsx",
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

const cohortMigration = read(
  "supabase/migrations/20260727110000_founding_cohort_activation.sql",
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
const cohortAdmin = read("components/admin/cohort-activation-manager.tsx");
assert(
  cohortAdmin.includes("Nobody enters the room until she accepts") &&
    cohortAdmin.includes("Invite eligible members") &&
    cohortAdmin.includes("Cohort health"),
  "Admin cohort operations must explain and preserve consent boundaries",
);

console.log(
  `Journey-state contracts passed: ${Object.keys(boundaryContracts).length} route boundaries, ${refreshModules.length} non-destructive refresh workflows, lightweight Admin cockpit, personalized next-event state, consent-based founding cohort, and 5 guided operations groups.`,
);
