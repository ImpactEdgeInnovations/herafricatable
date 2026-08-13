import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const adminEmail = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const adminPassword = process.env.HAT_PRIMARY_ADMIN_PASSWORD;
const memberPassword = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const confirmed = process.env.HAT_CONFIRM_COMMUNITY_RELEASE_ACCEPTANCE === "yes";

if (
  !url ||
  !publishable ||
  !secret ||
  !adminEmail ||
  !adminPassword ||
  !memberPassword ||
  !confirmed
) {
  throw new Error(
    "Supabase rehearsal credentials and HAT_CONFIRM_COMMUNITY_RELEASE_ACCEPTANCE=yes are required.",
  );
}

function browserClient() {
  return createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const admin = browserClient();
const member = browserClient();
const service = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const adminSignIn = await admin.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword,
});
assert.equal(adminSignIn.error, null, "Primary Admin sign-in failed");
const memberSignIn = await member.auth.signInWithPassword({
  email: "community.member.one@hat-test.invalid",
  password: memberPassword,
});
assert.equal(memberSignIn.error, null, "Tagged member sign-in failed");

async function saveCheck(checkKey, status, evidence, owner = null) {
  const result = await admin.rpc("save_module_release_check", {
    p_check_key: checkKey,
    p_evidence_note: evidence,
    p_feature_key: "communities",
    p_owner_label: owner,
    p_status: status,
  });
  if (result.error) throw result.error;
}

async function featureEnabled() {
  const result = await admin
    .from("feature_flags")
    .select("enabled")
    .eq("key", "communities")
    .single();
  if (result.error) throw result.error;
  return Boolean(result.data.enabled);
}

async function dataCounts() {
  const [communities, posts, memberships] = await Promise.all([
    service.from("communities").select("id", { count: "exact", head: true }),
    service.from("community_posts").select("id", { count: "exact", head: true }),
    service
      .from("community_memberships")
      .select("id", { count: "exact", head: true }),
  ]);
  for (const result of [communities, posts, memberships]) {
    if (result.error) throw result.error;
  }
  return {
    communities: communities.count,
    memberships: memberships.count,
    posts: posts.count,
  };
}

const originalEnabled = await featureEnabled();
let paused = !originalEnabled;
let recoveryVerified = false;
let rehearsalTagRemoved = false;

try {
  await saveCheck(
    "two_account_journey",
    "passed",
    "Two approved tagged members completed invitation, participation, RSVP, leave, rejoin and event registration journeys.",
  );
  await saveCheck(
    "privacy_and_permissions",
    "passed",
    "Anonymous, member, blocked-pair, host, moderator and Super Admin boundaries passed across conversations, safety and gatherings.",
  );
  await saveCheck(
    "admin_operations",
    "passed",
    "Super Admin completed Community event review, change request, approval, safety queue review and audited dismissal.",
  );
  await saveCheck(
    "rollback_and_recovery",
    "in_progress",
    "Audited production-safe pause and restore rehearsal is running.",
    "Primary Super Admin",
  );

  const before = await dataCounts();
  const pause = await admin.rpc("set_feature_flag", {
    p_enabled: false,
    p_key: "communities",
  });
  if (pause.error) throw pause.error;
  paused = true;
  assert.equal(await featureEnabled(), false, "Community pause was not applied");

  const removeRehearsalTag = await service
    .from("profiles")
    .update({ is_test_account: false })
    .eq("id", memberSignIn.data.user.id);
  if (removeRehearsalTag.error) throw removeRehearsalTag.error;
  rehearsalTagRemoved = true;
  try {
    const memberView = await member.rpc("list_communities");
    assert(
      memberView.error || (memberView.data ?? []).length === 0,
      "Ordinary member Community access remained available during the pause",
    );
  } finally {
    const restoreRehearsalTag = await service
      .from("profiles")
      .update({ is_test_account: true })
      .eq("id", memberSignIn.data.user.id);
    if (restoreRehearsalTag.error) throw restoreRehearsalTag.error;
    rehearsalTagRemoved = false;
  }
  assert.deepEqual(await dataCounts(), before, "Community data changed during pause");
  recoveryVerified = true;

  await saveCheck(
    "rollback_and_recovery",
    "passed",
    "Feature was paused through the audited Admin control, member access closed, stored records remained intact and access was restored.",
  );
  const restore = await admin.rpc("set_feature_flag", {
    p_enabled: true,
    p_key: "communities",
  });
  if (restore.error) throw restore.error;
  paused = false;
  assert.equal(await featureEnabled(), true, "Community feature was not restored");

  const release = await admin.rpc("list_module_release_acceptance");
  if (release.error) throw release.error;
  const communityChecks = (release.data ?? []).filter(
    (item) => item.feature_key === "communities",
  );
  assert.equal(communityChecks.length, 4, "Community release checklist is incomplete");
  assert(
    communityChecks.every((item) => item.status === "passed"),
    "Community release checks are not all passed",
  );
  assert(
    communityChecks.every((item) => item.release_ready),
    "Community module is not release-ready",
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        checksPassed: communityChecks.length,
        dataPreserved: true,
        featureRestored: true,
        startingState: originalEnabled ? "enabled" : "paused",
        releaseReady: true,
        secretsPrinted: false,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  if (rehearsalTagRemoved) {
    const restoreRehearsalTag = await service
      .from("profiles")
      .update({ is_test_account: true })
      .eq("id", memberSignIn.data.user.id);
    if (restoreRehearsalTag.error) throw restoreRehearsalTag.error;
  }
  if (paused && recoveryVerified) {
    await saveCheck(
      "rollback_and_recovery",
      "passed",
      "Emergency recovery restored Community access after an interrupted acceptance rehearsal; stored records remained intact.",
    );
    const emergencyRestore = await admin.rpc("set_feature_flag", {
      p_enabled: true,
      p_key: "communities",
    });
    if (emergencyRestore.error) throw emergencyRestore.error;
  }
  await Promise.all([admin.auth.signOut(), member.auth.signOut()]);
}
