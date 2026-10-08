import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completeCleanup, validateConfiguration, withCleanup } from "./accept-host-with-temporary-admin.mjs";

const env = {
  HAT_CONFIRM_TEMPORARY_TEST_ADMIN: "yes", HAT_CONFIRM_PRIVATE_EVENT_REHEARSAL: "yes",
  NEXT_PUBLIC_SUPABASE_URL: "https://gtzwqromwvzqytygebfc.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test", SUPABASE_SECRET_KEY: "test",
  HAT_PRIMARY_ADMIN_EMAIL: "impactedgeinnovations@gmail.com",
  HAT_PRIMARY_ADMIN_PASSWORD: "test", HAT_COMMUNITY_TEST_PASSWORD: "test",
};
validateConfiguration(env);
for (const change of [
  { HAT_CONFIRM_TEMPORARY_TEST_ADMIN: "no" }, { HAT_CONFIRM_PRIVATE_EVENT_REHEARSAL: "no" },
  { NEXT_PUBLIC_SUPABASE_URL: "https://other.supabase.co" }, { SUPABASE_SECRET_KEY: "" },
  { HAT_PRIMARY_ADMIN_EMAIL: "another@example.invalid" },
]) assert.throws(() => validateConfiguration({ ...env, ...change }));

const steps = [];
const cleanup = () => completeCleanup([
  ["revoke", async () => { steps.push("revoke"); }],
  ["verify", async () => { steps.push("verify"); }],
  ["disable", async () => { steps.push("disable"); }],
]);
assert.equal((await withCleanup(async () => "passed", cleanup)).passed, true);
assert.deepEqual(steps.splice(0), ["revoke", "verify", "disable"]);
assert.equal((await withCleanup(async () => { throw new Error("private detail"); }, cleanup)).passed, false);
assert.deepEqual(steps.splice(0), ["revoke", "verify", "disable"]);
const failedCleanup = await withCleanup(async () => "passed", () => completeCleanup([
  ["revoke", async () => { throw new Error("private detail"); }],
  ["disable", async () => { steps.push("disable"); }],
]));
assert.equal(failedCleanup.passed, false);
assert.deepEqual(steps, ["disable"]);
assert(!JSON.stringify(failedCleanup).includes("private detail"));

const source = readFileSync(new URL("./accept-host-with-temporary-admin.mjs", import.meta.url), "utf8");
assert(source.includes("30 * 60_000"), "Temporary role must have a short fallback expiry");
assert(source.includes('assertTemporaryId();'), "Cleanup must be restricted to the newly created identity");
const childConfiguration = source.slice(source.indexOf("const childEnv ="), source.indexOf('stage = "isolated private Host workflow"'));
assert(!childConfiguration.includes("SUPABASE_SECRET_KEY") && !childConfiguration.includes("...process.env"),
  "Child harness must receive only allowlisted settings, not the server secret");
assert(source.includes('HAT_REHEARSAL_EVENT_SLUG: slug'), "Positive pages must use this run's fixture");
assert(source.includes('assert.equal(pages.passed, true)'), "Read-only acceptance failures must fail the run");
console.log("Temporary Admin rehearsal guards, cleanup and failure propagation passed; no live calls made.");
