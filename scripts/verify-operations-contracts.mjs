import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

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
