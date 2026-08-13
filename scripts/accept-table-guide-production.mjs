import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const adminEmail = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const adminPassword = process.env.HAT_PRIMARY_ADMIN_PASSWORD;
const testPassword = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const confirmed = process.env.HAT_CONFIRM_TABLE_GUIDE_ACCEPTANCE === "yes";

if (
  !url ||
  !publishable ||
  !secret ||
  !adminEmail ||
  !adminPassword ||
  !testPassword ||
  testPassword.length < 12 ||
  !confirmed
) {
  throw new Error(
    "Supabase, Primary Admin, 12+ character Community test credentials and HAT_CONFIRM_TABLE_GUIDE_ACCEPTANCE=yes are required.",
  );
}

const requesterEmail = "community.member.one@hat-test.invalid";
const candidateEmail = "community.member.two@hat-test.invalid";
const optedOutEmail = "community.moderator@hat-test.invalid";
const testEmails = [requesterEmail, candidateEmail, optedOutEmail];
assert(
  testEmails.every((email) => email.endsWith("@hat-test.invalid")),
  "Acceptance may use tagged test identities only",
);

const service = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const browserClient = () =>
  createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

async function signIn(email, password = testPassword) {
  const client = browserClient();
  const result = await client.auth.signInWithPassword({ email, password });
  assert.equal(result.error, null, `${email}: sign-in failed`);
  assert(result.data.user, `${email}: identity missing`);
  return { client, user: result.data.user };
}

const admin = await signIn(adminEmail, adminPassword);
const requester = await signIn(requesterEmail);
const candidate = await signIn(candidateEmail);
const optedOut = await signIn(optedOutEmail);
const startedAt = new Date().toISOString();
let originalFeatureEnabled = false;
const original = new Map();

async function snapshot(member) {
  const [access, connections, profile] = await Promise.all([
    member.client.rpc("get_my_table_guide_access"),
    member.client.rpc("get_my_connection_preferences"),
    service
      .from("profiles")
      .select("visibility_paused")
      .eq("id", member.user.id)
      .single(),
  ]);
  assert.equal(access.error, null, `${member.user.email}: Nia access unavailable`);
  assert.equal(connections.error, null, `${member.user.email}: introduction choices unavailable`);
  assert.equal(profile.error, null, `${member.user.email}: profile unavailable`);
  return {
    assistant: Boolean(access.data?.[0]?.assistant_enabled),
    mode: connections.data?.[0]?.request_mode ?? "paused",
    recommend: Boolean(access.data?.[0]?.recommend_me),
    visibilityPaused: Boolean(profile.data.visibility_paused),
  };
}

async function setFeature(enabled) {
  const result = await admin.client.rpc("set_feature_flag", {
    p_enabled: enabled,
    p_key: "table_guide",
  });
  assert.equal(result.error, null, "Primary Admin could not change the Nia acceptance state");
}

async function prepare(member, recommend) {
  const visible = await member.client.rpc("set_profile_visibility", {
    p_paused: false,
  });
  assert.equal(visible.error, null);
  const open = await member.client.rpc("set_my_connection_preferences", {
    p_request_mode: "open",
  });
  assert.equal(open.error, null);
  const preference = await member.client.rpc("set_my_table_guide_preferences", {
    p_assistant_enabled: true,
    p_recommend_me: recommend,
  });
  assert.equal(preference.error, null);
}

async function restore(member) {
  const state = original.get(member.user.id);
  if (!state) return;
  await member.client.rpc("set_profile_visibility", { p_paused: false });
  await member.client.rpc("set_my_connection_preferences", {
    p_request_mode: "open",
  });
  await member.client.rpc("set_my_table_guide_preferences", {
    p_assistant_enabled: state.assistant,
    p_recommend_me: state.recommend,
  });
  await member.client.rpc("set_my_connection_preferences", {
    p_request_mode: state.mode,
  });
  await member.client.rpc("set_profile_visibility", {
    p_paused: state.visibilityPaused,
  });
}

try {
  const feature = await service
    .from("feature_flags")
    .select("enabled")
    .eq("key", "table_guide")
    .single();
  assert.equal(feature.error, null, "Nia feature flag is missing");
  originalFeatureEnabled = Boolean(feature.data.enabled);

  for (const member of [requester, candidate, optedOut]) {
    original.set(member.user.id, await snapshot(member));
  }

  if (!originalFeatureEnabled) await setFeature(true);
  await prepare(requester, false);
  await prepare(candidate, true);
  await prepare(optedOut, false);

  const suggestions = await requester.client.rpc("list_table_guide_connections", {
    p_limit: 12,
  });
  assert.equal(suggestions.error, null, "Nia connection suggestions failed");
  assert(
    suggestions.data.some((member) => member.user_id === candidate.user.id),
    "Opted-in visible candidate was not suggested",
  );
  assert(
    !suggestions.data.some((member) => member.user_id === optedOut.user.id),
    "Opted-out member appeared in suggestions",
  );

  const paused = await candidate.client.rpc("set_profile_visibility", {
    p_paused: true,
  });
  assert.equal(paused.error, null);
  const hiddenSuggestions = await requester.client.rpc(
    "list_table_guide_connections",
    { p_limit: 12 },
  );
  assert.equal(hiddenSuggestions.error, null);
  assert(
    !hiddenSuggestions.data.some((member) => member.user_id === candidate.user.id),
    "Hidden candidate appeared in suggestions",
  );
  await candidate.client.rpc("set_profile_visibility", { p_paused: false });

  const blocked = await requester.client.rpc("block_member", {
    p_member_id: candidate.user.id,
    p_reason: "Nia production acceptance boundary",
  });
  assert.equal(blocked.error, null);
  const blockedSuggestions = await requester.client.rpc(
    "list_table_guide_connections",
    { p_limit: 12 },
  );
  assert.equal(blockedSuggestions.error, null);
  assert(
    !blockedSuggestions.data.some((member) => member.user_id === candidate.user.id),
    "Blocked candidate appeared in suggestions",
  );
  await requester.client.rpc("unblock_member", { p_member_id: candidate.user.id });

  const memberAdminBoundary = await requester.client.rpc(
    "get_table_guide_feedback_admin",
  );
  assert(memberAdminBoundary.error, "Ordinary member could read Nia Admin feedback");

  const feedback = await requester.client.rpc("record_table_guide_feedback", {
    p_category: "connections",
    p_helpful: true,
  });
  assert.equal(feedback.error, null, "Nia usefulness feedback was not saved");
  const aggregate = await admin.client.rpc("get_table_guide_feedback_admin");
  assert.equal(aggregate.error, null, "Nia Admin feedback aggregate failed");
  assert(Number(aggregate.data?.[0]?.feedback_7d ?? 0) >= 1);

  const dismissed = await requester.client.rpc(
    "save_table_guide_suggestion_feedback",
    {
      p_relevant: false,
      p_target_key: candidate.user.id,
      p_target_kind: "member",
    },
  );
  assert.equal(dismissed.error, null, "Nia relevance choice was not saved");
  const storedChoice = await service
    .from("table_guide_suggestion_feedback")
    .select("relevant")
    .eq("user_id", requester.user.id)
    .eq("target_kind", "member")
    .eq("target_key", candidate.user.id)
    .single();
  assert.equal(storedChoice.error, null);
  assert.equal(storedChoice.data.relevant, false);

  console.log(
    JSON.stringify(
      {
        adminBoundary: "passed",
        blockedPair: "excluded",
        feedbackAggregate: "passed",
        hiddenMember: "excluded",
        optedInCandidate: "included",
        optedOutMember: "excluded",
        promptsStored: false,
        relevanceChoice: "persisted",
      },
      null,
      2,
    ),
  );
} finally {
  await requester.client.rpc("unblock_member", { p_member_id: candidate.user.id });
  for (const member of [requester, candidate, optedOut]) {
    await restore(member).catch(() => undefined);
  }
  await service
    .from("table_guide_feedback")
    .delete()
    .eq("user_id", requester.user.id)
    .gte("created_at", startedAt);
  await service
    .from("table_guide_suggestion_feedback")
    .delete()
    .eq("user_id", requester.user.id)
    .eq("target_kind", "member")
    .eq("target_key", candidate.user.id);
  if (!originalFeatureEnabled) await setFeature(false).catch(() => undefined);
  await Promise.all([
    admin.client.auth.signOut(),
    requester.client.auth.signOut(),
    candidate.client.auth.signOut(),
    optedOut.client.auth.signOut(),
  ]);
}
