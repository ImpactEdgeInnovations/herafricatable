import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const forbidden = [
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /sk_(?:live|test)_[A-Za-z0-9]{12,}/,
  /re_[A-Za-z0-9]{20,}/,
  /SUPABASE_SECRET_KEY[^\S\r\n]*=[^\S\r\n]*\S+/,
  /CRON_SECRET[^\S\r\n]*=[^\S\r\n]*\S+/,
];
for (const path of tracked) {
  if (path === "package-lock.json") continue;
  const content = read(path);
  for (const pattern of forbidden)
    assert(!pattern.test(content), `Potential committed secret in ${path}`);
}
const migrations = tracked
  .filter(
    (path) => path.startsWith("supabase/migrations/") && path.endsWith(".sql"),
  )
  .sort();
assert(migrations.length >= 18, "Expected the complete migration chain");
const names = migrations.map((path) => path.split("/").pop());
assert.equal(
  new Set(names.map((name) => name.slice(0, 14))).size,
  names.length,
  "Migration timestamps must be unique",
);
assert.deepEqual(
  names,
  [...names].sort(),
  "Migrations must sort chronologically",
);
for (const path of migrations.filter(
  (path) => path >= "supabase/migrations/20260723170000",
)) {
  const sql = read(path).trim().toLowerCase();
  assert(sql.startsWith("begin;"), `${path} must begin atomically`);
  assert(sql.endsWith("commit;"), `${path} must commit atomically`);
}
const cron = read("app/api/cron/notifications/route.ts");
assert(
  cron.includes("timingSafeEqual"),
  "Cron authorization must use constant-time comparison",
);
assert(cron.includes("CRON_SECRET"), "Cron route must require CRON_SECRET");
const privacy = read("app/api/admin/privacy/delete/route.ts");
assert(
  privacy.includes('eq("role","super_admin")'),
  "Deletion endpoint must verify Super Admin",
);
assert(
  privacy.includes("execute_account_deletion"),
  "Deletion endpoint must use controlled database execution",
);
const webhook = read("app/api/payments/paystack/webhook/route.ts");
assert(
  webhook.indexOf("request.text()") < webhook.indexOf("JSON.parse"),
  "Paystack signature must verify the raw request body",
);
assert(
  webhook.includes("timingSafeEqual"),
  "Paystack signature check must be constant-time",
);
const paymentInitialize = read("app/api/payments/paystack/initialize/route.ts");
assert(
  paymentInitialize.includes("create_course_order"),
  "Course checkout must use the shared payment initializer",
);
assert(
  paymentInitialize.includes("order_type"),
  "Payment metadata must identify fulfillment context",
);
const paymentCallback = read("app/api/payments/paystack/callback/route.ts");
assert(
  paymentCallback.includes("/learning/"),
  "Verified course checkout must return to Learning",
);
const learningMigration = read(
  "supabase/migrations/20260725130000_learning_foundation.sql",
);
assert(
  learningMigration.includes("order_item_exactly_one_product"),
  "Shared order lines must have exactly one product",
);
assert(
  learningMigration.includes("fulfill_course_order"),
  "Course purchases must converge on controlled fulfillment",
);
const referralMigration = read(
  "supabase/migrations/20260725170000_referrals_vouched_invitations.sql",
);
assert(
  referralMigration.indexOf("status='pending_review'") <
    referralMigration.indexOf("insert into public.beta_invites"),
  "Referral submission must precede a separate invite approval gate",
);
assert(
  referralMigration.includes("Super Admin review before a beta invitation"),
  "Referral access boundary must remain documented in schema",
);
const env = read(".env.example");
for (const secret of [
  "SUPABASE_SECRET_KEY",
  "PAYSTACK_SECRET_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
])
  assert(
    !env.includes(`NEXT_PUBLIC_${secret}`),
    `${secret} must remain server-only`,
  );
const membershipMigration = read(
  "supabase/migrations/20260725210000_membership_renewal_lifecycle.sql",
);
assert(
  membershipMigration.includes("pg_advisory_xact_lock"),
  "Membership grants must serialize per member",
);
assert(
  membershipMigration.includes("onboarding_completed_at is null"),
  "Membership payment must preserve onboarding requirements",
);
assert(
  membershipMigration.includes("is_test_account"),
  "Production test identities must be explicitly tagged",
);
assert(
  paymentInitialize.includes("create_membership_order"),
  "Membership checkout must use the shared payment initializer",
);
const testUsers = read("app/api/admin/test-users/route.ts");
assert(
  testUsers.includes('eq("role","super_admin")'),
  "Test user creation must verify Super Admin",
);
assert(
  testUsers.includes('.endsWith(".invalid")'),
  "Test identities must use a reserved domain",
);
const circlesMigration = read(
  "supabase/migrations/20260726090000_circles_deterministic_matching.sql",
);
assert(
  circlesMigration.includes("deterministic_v1"),
  "Circle matching must identify its deterministic method",
);
assert(
  circlesMigration.includes("Matching produced a blocked pair"),
  "Circle matching must stop on blocked pairs",
);
assert(
  circlesMigration.indexOf("status='matched'") <
    circlesMigration.indexOf("publish_circle_cycle"),
  "Circle matching must remain reviewable before publication",
);
assert(
  circlesMigration.includes("include_test_accounts"),
  "Circle cycles must explicitly control test identities",
);
const perksMigration = read(
  "supabase/migrations/20260726130000_partner_perks_redemption.sql",
);
assert(
  perksMigration.includes("for update"),
  "Perk inventory must be locked before reservation",
);
assert(
  perksMigration.includes("perk_active_reservation_idx"),
  "Perks must prevent duplicate active reservations",
);
assert(
  perksMigration.includes("expire_perk_redemptions"),
  "Expired reservations must release inventory",
);
assert(
  perksMigration.includes("Super admin required"),
  "Redemption reconciliation must remain admin controlled",
);
const analyticsMigration = read(
  "supabase/migrations/20260726170000_privacy_safe_analytics.sql",
);
for (const forbiddenField of [
  "ip_address",
  "user_agent",
  "raw_url",
  "search_query",
  "message_body",
  "subject_id",
  "total_minor",
])
  assert(
    !analyticsMigration.includes(forbiddenField),
    `Analytics must not collect ${forbiddenField}`,
  );
assert(
  analyticsMigration.includes("is_test_event"),
  "Analytics must separate tagged test activity",
);
assert(
  analyticsMigration.includes("Super admin required"),
  "Analytics aggregates must remain Super Admin-only",
);
assert(
  analyticsMigration.includes("octet_length(metadata::text)<=2048"),
  "Analytics metadata must remain bounded",
);
assert(
  analyticsMigration.includes("t.status='on_sale'"),
  "Readiness must use the live ticket status contract",
);
const launchGateMigration = read(
  "supabase/migrations/20260728130000_launch_gate_evidence.sql",
);
for (const contract of [
  "launch_gate_checks",
  "list_launch_gate_checks",
  "save_launch_gate_check",
  "Super admin required",
  "Passed checks require concise evidence",
  "'launch.gate_updated'",
]) {
  assert(
    launchGateMigration.includes(contract),
    `Operational launch evidence must include ${contract}`,
  );
}
assert(
  !launchGateMigration.includes(
    "jsonb_build_object('check_key', p_check_key, 'status', p_status, 'evidence'",
  ),
  "Launch audit metadata must not duplicate operational evidence text",
);
const memberProfileMigration = read(
  "supabase/migrations/20260728170000_member_profile_view.sql",
);
for (const contract of [
  "get_member_profile",
  "public.is_blocked_pair(actor, p_member_id)",
  "connection.status = 'accepted'",
  "private_profile.share_phone_with_connections",
  "Active visible membership required",
]) {
  assert(
    memberProfileMigration.includes(contract),
    `Privacy-safe member profile view must include ${contract}`,
  );
}
const intentionalIntroductionsMigration = read(
  "supabase/migrations/20260728210000_intentional_introductions.sql",
);
for (const contract of [
  "introduction_note",
  "request_connection_with_context",
  "list_my_network_with_context",
  "get_connection_introduction",
  "'introduction_provided', clean_note is not null",
]) {
  assert(
    intentionalIntroductionsMigration.includes(contract),
    `Intentional introductions must include ${contract}`,
  );
}
assert(
  !intentionalIntroductionsMigration.includes(
    "'introduction_note', clean_note",
  ),
  "Private introduction text must not be duplicated into audit metadata",
);
const savedProfilesMigration = read(
  "supabase/migrations/20260729010000_saved_member_profiles.sql",
);
for (const contract of [
  "member_saved_profiles",
  "save_member_profile",
  "remove_saved_member_profile",
  "is_member_profile_saved",
  "list_my_saved_profiles",
  "'private_note_provided', clean_note is not null",
  "Saved profile limit reached",
]) {
  assert(
    savedProfilesMigration.includes(contract),
    `Private saved profiles must include ${contract}`,
  );
}
assert(
  !savedProfilesMigration.includes("'private_note', clean_note"),
  "Private saved-profile notes must not be duplicated into audit metadata",
);
const memberRecommendationsMigration = read(
  "supabase/migrations/20260729050000_member_recommendations.sql",
);
for (const contract of [
  "list_member_recommendations",
  "shared_goals",
  "shared_interests",
  "match_reasons",
  "public.is_blocked_pair(auth.uid(), profile.id)",
  "connection.status in ('pending', 'accepted')",
  "member_saved_profiles",
  "A new perspective for your network",
]) {
  assert(
    memberRecommendationsMigration.includes(contract),
    `Explainable member recommendations must include ${contract}`,
  );
}
const curatedIntroductionsMigration = read(
  "supabase/migrations/20260729090000_curated_introductions.sql",
);
for (const contract of [
  "curated_introductions",
  "create_curated_introduction",
  "respond_to_curated_introduction",
  "cancel_curated_introduction",
  "list_my_curated_introductions",
  "list_curated_introductions_admin",
  "You both accepted",
  "public.is_blocked_pair",
  "'curated_introduction.created'",
]) {
  assert(
    curatedIntroductionsMigration.includes(contract),
    `Consent-based curated introductions must include ${contract}`,
  );
}
assert(
  !curatedIntroductionsMigration.includes("'reason', clean_reason"),
  "Curated-introduction audit metadata must not duplicate the visible reason",
);
const connectionPreferencesMigration = read(
  "supabase/migrations/20260729130000_connection_preferences.sql",
);
for (const contract of [
  "member_connection_preferences",
  "get_my_connection_preferences",
  "set_my_connection_preferences",
  "list_connection_availability",
  "get_member_connection_mode",
  "list_connection_availability_admin",
  "enforce_direct_connection_preference",
  "enforce_curated_connection_preference",
  "Member accepts curated introductions only",
  "One or both members are not accepting curated introductions",
]) {
  assert(
    connectionPreferencesMigration.includes(contract),
    `Member-controlled connection availability must include ${contract}`,
  );
}
const relationshipFollowupsMigration = read(
  "supabase/migrations/20260729170000_relationship_followups.sql",
);
for (const contract of [
  "connection_followups",
  "save_connection_followup",
  "complete_connection_followup",
  "remove_connection_followup",
  "list_my_connection_followups",
  "list_due_connection_followups",
  "Accepted connection required",
  "'has_private_note', clean_note is not null",
]) {
  assert(
    relationshipFollowupsMigration.includes(contract),
    `Private relationship follow-ups must include ${contract}`,
  );
}
assert(
  !relationshipFollowupsMigration.includes("'private_note', clean_note"),
  "Relationship follow-up audit metadata must not copy private notes",
);
const databaseCorrections = read(
  "supabase/migrations/20260726210000_ci_database_corrections.sql",
);
assert(
  databaseCorrections.includes("extensions.gen_random_bytes"),
  "Security-definer token generation must qualify the extensions schema",
);
assert(
  databaseCorrections.includes("e.status='published'"),
  "Readiness queries must qualify status columns",
);
assert(
  databaseCorrections.includes("nj.status='failed'"),
  "Notification readiness must avoid output-column ambiguity",
);
const boundaryTests = read("supabase/tests/001_production_boundaries.sql");
assert(
  boundaryTests.includes(
    "select report_id from public.list_community_reports()",
  ),
  "Moderation tests must use the authorized report projection",
);
assert(
  boundaryTests.includes("select circle_id from public.list_my_circles()"),
  "Circle tests must use the authorized member projection",
);
const actionDialog = read("components/ui/action-dialog.tsx");
assert(
  actionDialog.includes("showModal()"),
  "Critical actions must use a modal focus boundary",
);
assert(
  actionDialog.includes('role="alert"'),
  "Action validation must announce inline errors",
);
const adminDialogModules = [
  "analytics-readiness",
  "circle-manager",
  "community-manager",
  "community-moderation",
  "event-checkin-console",
  "event-feedback-manager",
  "learning-manager",
  "marketplace-moderation",
  "membership-manager",
  "moderation-queue",
  "perks-manager",
  "privacy-operations",
  "referral-manager",
  "registration-manager",
];
for (const module of adminDialogModules) {
  const path = `components/admin/${module}.tsx`;
  const content = read(path);
  assert(
    !/\b(?:window\.)?(?:prompt|confirm)\s*\(/.test(content),
    `${path} must not regress to browser prompts`,
  );
  assert(
    content.includes("useActionDialog"),
    `${path} must use the shared accessible action dialog`,
  );
}
const memberDialogModules = [
  "account-settings",
  "circles-hub",
  "community-feed",
  "learning-catalog",
  "message-center",
  "network-hub",
  "opportunity-marketplace",
  "order-history",
  "perks-gallery",
];
for (const module of memberDialogModules) {
  const path = `components/member/${module}.tsx`;
  const content = read(path);
  assert(
    !/\b(?:window\.)?(?:prompt|confirm)\s*\(/.test(content),
    `${path} must not regress to browser prompts`,
  );
  assert(
    content.includes("useActionDialog"),
    `${path} must use the shared accessible action dialog`,
  );
}
const memberError = read("lib/member-error.ts");
assert(
  memberError.includes("technicalMessagePatterns"),
  "Member errors must filter technical database details",
);
assert(
  memberError.includes("contact support from your account"),
  "Member errors must provide a recovery path",
);
const memberRecoveryModules = [
  "account-settings",
  "circles-hub",
  "community-directory",
  "community-feed",
  "learning-catalog",
  "membership-center",
  "message-center",
  "network-hub",
  "notification-center",
  "opportunity-marketplace",
  "order-history",
  "perks-gallery",
  "referral-center",
  "support-center",
];
for (const module of memberRecoveryModules) {
  const path = `components/member/${module}.tsx`;
  const content = read(path);
  assert(
    content.includes("memberErrorMessage"),
    `${path} must use member-safe error recovery`,
  );
  assert(
    !/\berror\.message\b/.test(content),
    `${path} must not expose raw service errors`,
  );
}
const adminError = read("lib/admin-error.ts");
assert(
  adminError.includes("configurationPatterns"),
  "Admin errors must filter configuration details",
);
assert(
  adminError.includes("Admin support area"),
  "Admin errors must provide an operational recovery path",
);
const adminRecoveryModules = [
  "analytics-readiness",
  "circle-manager",
  "community-manager",
  "community-moderation",
  "event-checkin-console",
  "event-content-manager",
  "event-countdown-manager",
  "event-feedback-manager",
  "event-gallery-manager",
  "event-manager",
  "event-menu-manager",
  "learning-manager",
  "marketplace-moderation",
  "member-review",
  "membership-manager",
  "moderation-queue",
  "notification-operations",
  "perks-manager",
  "privacy-operations",
  "referral-manager",
  "registration-manager",
  "support-inbox",
];
for (const module of adminRecoveryModules) {
  const path = `components/admin/${module}.tsx`;
  const content = read(path);
  assert(
    content.includes("adminErrorMessage"),
    `${path} must use Admin-safe error recovery`,
  );
  assert(
    !/\berror\.message\b/.test(content),
    `${path} must not expose raw service errors`,
  );
}
const notificationOperations = read(
  "components/admin/notification-operations.tsx",
);
assert(
  /adminErrorMessage\(\s*job\.last_error/.test(notificationOperations),
  "Notification operations must filter provider errors",
);
const adminGuidanceContracts = {
  "circle-manager": ["circle-cycle-guide", "circle-prompt-guide"],
  "community-manager": ["community-editor-guide", "community-invite-guide"],
  "event-content-manager": [
    "session-editor-guide",
    "announcement-editor-guide",
    "sponsor-editor-guide",
    "event-staff-guide",
  ],
  "event-countdown-manager": ["event-countdown-guide"],
  "event-feedback-manager": ["event-recap-guide"],
  "event-gallery-manager": ["gallery-album-guide", "gallery-asset-guide"],
  "event-menu-manager": ["menu-narrative-guide", "menu-item-guide"],
  "learning-manager": ["lesson-editor-guide", "course-grant-guide"],
  "perks-manager": ["perk-partner-guide", "perk-benefit-guide"],
  "referral-manager": ["referral-campaign-guide"],
};
for (const [module, guidanceIds] of Object.entries(adminGuidanceContracts)) {
  const path = `components/admin/${module}.tsx`;
  const content = read(path);
  for (const guidanceId of guidanceIds) {
    assert(
      content.includes(`id="${guidanceId}"`) &&
        content.includes(`aria-describedby="${guidanceId}"`),
      `${path} must provide accessible guidance for ${guidanceId}`,
    );
  }
}
const qualityWorkflow = read(".github/workflows/ci.yml");
assert(
  qualityWorkflow.includes("supabase/setup-cli@v2"),
  "CI must use the Node 24-compatible Supabase setup action",
);
console.log(
  `Repository contracts passed: ${tracked.length} tracked files, ${migrations.length} ordered migrations.`,
);
