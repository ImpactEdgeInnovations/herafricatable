import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const execute = promisify(execFile);
const approvedProject = "gtzwqromwvzqytygebfc.supabase.co";

export function validateConfiguration(env) {
  assert.equal(env.HAT_CONFIRM_TEMPORARY_TEST_ADMIN, "yes", "Explicit temporary Admin confirmation is required");
  assert.equal(env.HAT_CONFIRM_PRIVATE_EVENT_REHEARSAL, "yes", "Explicit private event confirmation is required");
  const projectUrl = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
  assert.equal(projectUrl.protocol, "https:", "The live project requires HTTPS");
  assert.equal(projectUrl.hostname, approvedProject, "Only the approved live project may be used");
  for (const key of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY",
    "HAT_PRIMARY_ADMIN_EMAIL", "HAT_PRIMARY_ADMIN_PASSWORD", "HAT_COMMUNITY_TEST_PASSWORD"]) {
    assert(env[key], `Missing required local setting: ${key}`);
  }
  assert.equal(env.HAT_PRIMARY_ADMIN_EMAIL.trim().toLowerCase(), "impactedgeinnovations@gmail.com",
    "The approved primary Admin must authorize the temporary role");
}

// Complete every cleanup step even if an earlier step fails. Callers must not report
// success when any verification fails, even if the account has a fallback expiry.
export async function completeCleanup(steps) {
  const results = [];
  for (const [name, operation] of steps) {
    try { await operation(); results.push({ check: name, passed: true }); }
    catch { results.push({ check: name, passed: false }); }
  }
  return results;
}

export async function withCleanup(work, cleanup) {
  let result;
  let workFailed = false;
  try { result = await work(); } catch { workFailed = true; }
  const cleanupResults = await cleanup();
  return { result, workFailed, cleanup: cleanupResults,
    passed: !workFailed && cleanupResults.every((item) => item.passed) };
}

async function runJsonScript(script, env) {
  try {
    const { stdout } = await execute(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], {
      env, timeout: 180_000, maxBuffer: 1_000_000,
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (error.stdout) {
      try {
        const report = JSON.parse(error.stdout);
        if (report.passed === false) return report;
      } catch { /* Never print child error output. */ }
    }
    // Child errors can contain environment-dependent details. Never print them.
    throw new Error("Controlled acceptance script did not complete");
  }
}

async function main() {
  validateConfiguration(process.env);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY, options);
  const primary = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
  const verifier = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
  const email = `host.rehearsal.admin.${randomUUID()}@hat-test.invalid`;
  const password = `Aa1!${randomBytes(32).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  let temporaryId;
  let primaryId;
  let verifierSignedIn = false;
  let stage = "preflight";
  let host;
  let pages;
  const rpc = async (client, name, args = {}) => {
    const response = await client.rpc(name, args);
    assert.ifError(response.error);
    return response.data;
  };
  const assertTemporaryId = () => {
    assert(temporaryId && temporaryId !== primaryId, "Cleanup must target only the newly created identity");
  };

  const outcome = await withCleanup(async () => {
    // Check schema, primary identity and fixture absence before creating any account.
    const schema = await service.from("user_roles").select("user_id,expires_at").limit(0);
    assert.ifError(schema.error);
    const signed = await primary.auth.signInWithPassword({
      email: process.env.HAT_PRIMARY_ADMIN_EMAIL, password: process.env.HAT_PRIMARY_ADMIN_PASSWORD,
    });
    assert.ifError(signed.error);
    primaryId = signed.data.user.id;
    assert.equal(await rpc(primary, "is_admin", { check_roles: ["super_admin"] }), true);
    const slug = `hat-private-host-rehearsal-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
    const existing = await service.from("events").select("id").eq("slug", slug).maybeSingle();
    assert.ifError(existing.error);
    assert.equal(existing.data, null, "Today's fixture already exists; do not create another rehearsal");

    stage = "create hidden temporary test identity";
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { display_name: "[TEST] Temporary Host Rehearsal Admin" } });
    assert.ifError(created.error);
    temporaryId = created.data.user?.id;
    assertTemporaryId();
    const profile = await service.from("profiles").update({
      access_status: "active", is_test_account: true, visibility_paused: true,
      display_name: "[TEST] Temporary Host Rehearsal Admin",
    }).eq("id", temporaryId).select("id,is_test_account,access_status,visibility_paused").single();
    assert.ifError(profile.error);
    assert.deepEqual(profile.data, { id: temporaryId, is_test_account: true,
      access_status: "active", visibility_paused: true });
    stage = "grant and verify expiring temporary Admin";
    assert.equal(await rpc(primary, "grant_time_bounded_admin_access", {
      p_email: email, p_role: "super_admin", p_expires_at: expiresAt,
      p_reason: "Owner-approved isolated private Event Host rehearsal; revoke immediately afterward.",
    }), temporaryId);
    const temporarySigned = await verifier.auth.signInWithPassword({ email, password });
    assert.ifError(temporarySigned.error);
    assert.equal(temporarySigned.data.user.id, temporaryId);
    verifierSignedIn = true;
    assert.equal(await rpc(verifier, "is_admin", { check_roles: ["super_admin"] }), true);

    // Allowlist credentials instead of forwarding the server/email/AI environment.
    const childEnv = {
      NEXT_PUBLIC_SUPABASE_URL: url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      HAT_PRIMARY_ADMIN_EMAIL: process.env.HAT_PRIMARY_ADMIN_EMAIL,
      HAT_COMMUNITY_TEST_PASSWORD: process.env.HAT_COMMUNITY_TEST_PASSWORD,
      HAT_ADMIN_TEST_EMAIL: email, HAT_ADMIN_TEST_PASSWORD: password,
      HAT_CONFIRM_PRIVATE_EVENT_REHEARSAL: "yes",
    };
    stage = "isolated private Host workflow";
    host = await runJsonScript("accept-event-host-private.mjs", childEnv);
    assert.equal(host.eventSlug, slug);
    assert.equal(host.published, false);
    stage = "read-only live role pages";
    pages = await runJsonScript("accept-role-pages-live.mjs", {
      ...childEnv, HAT_REHEARSAL_EVENT_SLUG: slug,
      HAT_PRIMARY_ADMIN_PASSWORD: process.env.HAT_PRIMARY_ADMIN_PASSWORD,
    });
    assert.equal(pages.passed, true);
    stage = "acceptance completed";
    return { host, pages };
  }, async () => {
    const steps = [];
    if (temporaryId) {
      steps.push(["temporary Admin role removed", async () => {
        assertTemporaryId();
        const roles = await service.from("user_roles").select("role").eq("user_id", temporaryId);
        assert.ifError(roles.error);
        if (roles.data.some((row) => row.role === "super_admin")) {
          try {
            await rpc(primary, "revoke_admin_access", { p_user_id: temporaryId, p_role: "super_admin",
              p_reason: "Isolated private Host rehearsal finished; temporary access removed." });
          } catch {
            // Same narrowly scoped removal if the primary session became unavailable.
            const removed = await service.from("user_roles").delete()
              .eq("user_id", temporaryId).eq("role", "super_admin");
            assert.ifError(removed.error);
            const audit = await service.from("audit_events").insert({
              actor_id: primaryId, action: "admin_access.revoked", target_type: "user", target_id: temporaryId,
              metadata: { role: "super_admin", reason: "Temporary rehearsal cleanup fallback" },
            });
            assert.ifError(audit.error);
          }
        }
        const remaining = await service.from("user_roles").select("role").eq("user_id", temporaryId);
        assert.ifError(remaining.error);
        assert.equal(remaining.data.length, 0);
      }]);
      if (verifierSignedIn) steps.push(["existing temporary access token no longer authorizes Admin", async () => {
        assert.equal(await rpc(verifier, "is_admin", { check_roles: ["super_admin"] }), false);
      }]);
      steps.push(["temporary test profile suspended and hidden", async () => {
        assertTemporaryId();
        const response = await service.from("profiles").update({
          access_status: "suspended", visibility_paused: true,
        }).eq("id", temporaryId).select("access_status,visibility_paused,is_test_account").single();
        assert.ifError(response.error);
        assert.deepEqual(response.data, { access_status: "suspended", visibility_paused: true, is_test_account: true });
      }]);
      steps.push(["temporary Auth identity disabled", async () => {
        assertTemporaryId();
        const response = await service.auth.admin.updateUserById(temporaryId, { ban_duration: "876000h" });
        assert.ifError(response.error);
        const verified = await service.auth.admin.getUserById(temporaryId);
        assert.ifError(verified.error);
        assert(new Date(verified.data.user.banned_until).getTime() > Date.now());
      }]);
    }
    steps.push(["temporary and primary rehearsal sessions signed out", async () => {
      const results = await Promise.all([
        verifier.auth.signOut({ scope: "global" }), primary.auth.signOut({ scope: "local" }),
      ]);
      results.forEach((item) => assert.ifError(item.error));
    }]);
    return completeCleanup(steps);
  });
  process.stdout.write(`${JSON.stringify({
    workFailed: outcome.workFailed, cleanup: outcome.cleanup, passed: outcome.passed,
    lastStage: stage, host, pages, temporaryAccountCreated: Boolean(temporaryId),
    ...(outcome.cleanup.some((item) => !item.passed) ? { recoveryAccountId: temporaryId } : {}),
    published: false, secretsPrinted: false,
  }, null, 2)}\n`);
  if (!outcome.passed) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stderr.write("Temporary Admin rehearsal preflight failed. No secret details printed.\n");
    process.exitCode = 2;
  });
}
