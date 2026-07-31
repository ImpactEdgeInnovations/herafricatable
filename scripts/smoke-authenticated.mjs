import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.HAT_TEST_EMAIL;
const password = process.env.HAT_TEST_PASSWORD;

assert(url, "NEXT_PUBLIC_SUPABASE_URL is required.");
assert(
  publishableKey,
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.",
);
assert(email, "HAT_TEST_EMAIL is required.");
assert(password, "HAT_TEST_PASSWORD is required.");

const client = createClient(
  url.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, ""),
  publishableKey,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

const results = [];

try {
  const { data: signIn, error: signInError } =
    await client.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  assert(signIn.user, "The test identity could not sign in.");
  results.push({ check: "password_sign_in", passed: true });

  const { data: identity, error: identityError } =
    await client.auth.getUser();
  assert.ifError(identityError);
  assert.equal(identity.user?.id, signIn.user.id, "Session identity mismatch.");
  results.push({ check: "verified_identity", passed: true });

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("access_status,is_test_account,onboarding_completed_at")
    .eq("id", signIn.user.id)
    .single();
  assert.ifError(profileError);
  assert.equal(
    profile.is_test_account,
    true,
    "Authenticated smoke identities must be tagged as test accounts.",
  );
  results.push({
    accessStatus: profile.access_status,
    check: "profile_boundary",
    passed: true,
  });

  const { data: roleRows, error: roleError } = await client
    .from("user_roles")
    .select("role,expires_at")
    .eq("user_id", signIn.user.id);
  assert.ifError(roleError);
  const roles = (roleRows ?? []).map((row) => row.role);
  results.push({ check: "role_boundary", passed: true, roles });

  if (roles.includes("super_admin")) {
    const [launchResult, memberResult] = await Promise.all([
      client.rpc("list_launch_gate_checks"),
      client.rpc("list_admin_members_v2"),
    ]);
    assert.ifError(launchResult.error);
    assert.ifError(memberResult.error);
    results.push({
      check: "super_admin_operations",
      launchChecks: launchResult.data?.length ?? 0,
      membersVisible: memberResult.data?.length ?? 0,
      passed: true,
    });
  } else if (profile.access_status === "active") {
    const { error } = await client.rpc("list_communities");
    assert.ifError(error);
    results.push({ check: "active_member_community", passed: true });
  }

  console.log(
    JSON.stringify(
      {
        accountType: roles.includes("super_admin")
          ? "super_admin_test"
          : "member_test",
        results,
        verified: true,
      },
      null,
      2,
    ),
  );
} finally {
  await client.auth.signOut();
}
