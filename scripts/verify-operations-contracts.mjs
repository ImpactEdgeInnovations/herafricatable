import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
for (const filename of readdirSync(new URL("scripts/", root)).filter((name) => name.endsWith(".mjs"))) {
  assert(!/\.auth\.signOut\(\)/.test(read(`scripts/${filename}`)),
    `${filename} must sign out only its own test session`);
}

const health = read("lib/operational-health.ts");
for (const contract of [
  'import "server-only"',
  "assessOperationalHealth",
  "automaticPublishedEvents",
  "queuedEmailJobs",
  'registration_mode", "automatic"',
  '"queued", "processing"',
  "Manual fallback available",
  "CRON_SECRET?.length",
  'status: "degraded"',
]) {
  assert(
    health.includes(contract),
    `Operational health must include ${contract}`,
  );
}
assert(
  !health.includes("publishableKey,") ||
    health.includes("publicEnvironment.publishableKey"),
  "Operational health must not return the Supabase publishable key",
);

const healthRoute = read("app/api/health/route.ts");
assert(
  healthRoute.includes("assessOperationalHealth"),
  "The public health route must use the shared assessment",
);
for (const privateDetail of [
  "PAYSTACK_SECRET_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "EMAIL_FROM",
]) {
  assert(
    !healthRoute.includes(privateDetail),
    `The public health response must not inspect or expose ${privateDetail}`,
  );
}

const operations = read("app/admin/operations/page.tsx");
const launchSignoffMigration = read("supabase/migrations/20261003010000_launch_signoff_guard.sql");
const launchControl = read("components/admin/launch-gate-control.tsx");
for (const contract of [
  "for update",
  "gate.required and gate.check_key <> 'launch_signoff'",
  "gate.verified_at is null",
  "'launch.signoff_reopened'",
  "verified_at = null",
]) {
  assert(launchSignoffMigration.includes(contract),
    `Final launch sign-off guard must include ${contract}`);
}
assert(launchControl.includes("finalSignoffReady"));
assert(launchControl.includes("Final sign-off opens after every other required check"));
for (const contract of [
  "OperationalHealthPanel",
  "assessOperationalHealth()",
  'check.key === "payments"',
  'check.key === "email"',
]) {
  assert(
    operations.includes(contract),
    `Admin release operations must include ${contract}`,
  );
}
const adminNotificationPage = read("app/admin/notifications/page.tsx");
const notificationOperations = read(
  "components/admin/notification-operations.tsx",
);
const liveDeliveryAcceptance = read("scripts/accept-admin-email-delivery-live.mjs");
for (const contract of [
  'process.env.HAT_CONFIRM_ADMIN_EMAIL_TEST === "yes"',
  'supabase.auth.signInWithPassword({ email, password })',
  '"/api/admin/notifications/test"',
  'providerAccepted: true, inboxReceiptVerified: false',
]) {
  assert(liveDeliveryAcceptance.includes(contract),
    `Live Admin email acceptance must include ${contract}`);
}
for (const contract of [
  "Email readiness",
  "Email provider connected",
  "Sender address added",
  "Scheduled sending protected",
  "Website links configured",
  "Secure server connection ready",
]) {
  assert(
    adminNotificationPage.includes(contract) ||
      notificationOperations.includes(contract),
    `Admin email readiness must include ${contract}`,
  );
}
for (const contract of [
  "CommunityCreatorCommerceManager",
  "list_community_host_plans",
  "list_community_commerce_admin",
  "list_community_orders_admin",
  "community_creator_commerce",
  "CommunityHostBillingManager",
  "get_community_host_billing_admin",
  "list_community_host_plan_orders_admin",
  "CommunityFinanceManager",
  "list_community_finance_admin",
  "list_community_financial_cases_admin",
  "list_community_settlements_admin",
]) {
  assert(
    operations.includes(contract),
    `Admin creator-commerce operations must include ${contract}`,
  );
}
const hostBillingOperations = read(
  "components/admin/community-host-billing-manager.tsx",
);
for (const contract of [
  "reconcile_community_host_subscriptions",
  "Renewals and expiry protection",
  "lapsed_paid_offers",
]) {
  assert(
    hostBillingOperations.includes(contract),
    `Admin host lifecycle operations must include ${contract}`,
  );
}
const creatorFinanceOperations = read(
  "components/admin/community-finance-manager.tsx",
);
for (const contract of [
  "record_community_financial_adjustment",
  "review_community_financial_case",
  "create_community_settlement_batch",
  "mark_community_settlement_paid",
  "Automatic payouts off",
]) {
  assert(
    creatorFinanceOperations.includes(contract),
    `Admin creator finance operations must include ${contract}`,
  );
}

const authenticatedSmoke = read("scripts/smoke-authenticated.mjs");
for (const contract of [
  "HAT_TEST_EMAIL",
  "HAT_TEST_PASSWORD",
  "signInWithPassword",
  "is_test_account",
  "list_launch_gate_checks",
  "list_admin_members_v2",
  "finally",
  "signOut",
]) {
  assert(
    authenticatedSmoke.includes(contract),
    `Authenticated smoke testing must include ${contract}`,
  );
}
assert(
  !/HAT_TEST_(?:EMAIL|PASSWORD)\s*\?\?/.test(authenticatedSmoke),
  "Authenticated smoke credentials must never have committed defaults",
);
const smokeOutput = authenticatedSmoke.slice(
  authenticatedSmoke.indexOf("console.log"),
);
assert(
  !/\b(?:email|password|access_token|refresh_token)\b/.test(smokeOutput),
  "Authenticated smoke output must not print credentials",
);

console.log("Operational health and authenticated access contracts passed.");
