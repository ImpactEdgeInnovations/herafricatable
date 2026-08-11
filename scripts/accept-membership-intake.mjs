import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const adminEmail = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const adminPassword = process.env.HAT_PRIMARY_ADMIN_PASSWORD;
const testPassword = process.env.HAT_MEMBERSHIP_TEST_PASSWORD;

if (
  !url ||
  !publishable ||
  !secret ||
  !adminEmail ||
  !adminPassword ||
  !testPassword ||
  testPassword.length < 12
) {
  throw new Error(
    "Supabase credentials, primary Admin credentials and a 12+ character HAT_MEMBERSHIP_TEST_PASSWORD are required.",
  );
}

const identities = {
  invited: ["membership.invited@hat-test.invalid", "Test Invited Applicant"],
  manual: ["membership.manual@hat-test.invalid", "Test Manual Applicant"],
  paused: ["membership.paused@hat-test.invalid", "Test Paused Applicant"],
  uninvited: ["membership.uninvited@hat-test.invalid", "Test Uninvited Applicant"],
};

function browserClient() {
  return createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const service = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const operator = browserClient();
const operatorSignIn = await operator.auth.signInWithPassword({
  email: adminEmail,
  password: adminPassword,
});
assert.equal(operatorSignIn.error, null, "Primary Admin sign-in failed");

const current = await operator.rpc("get_membership_intake_admin");
assert.equal(current.error, null, "Membership intake migration is not ready");
const originalMode = current.data?.[0]?.mode ?? "manual_review";

async function setMode(mode) {
  const changed = await operator.rpc("set_membership_intake_mode", {
    p_mode: mode,
    p_reason: "Production-safe dummy-account membership intake acceptance",
  });
  assert.equal(changed.error, null, `Could not select ${mode}`);
}

async function prepareIdentities() {
  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.equal(listed.error, null, "Test identities could not be listed");
  const prepared = new Map();

  for (const [email, displayName] of Object.values(identities)) {
    let user = listed.data.users.find((candidate) => candidate.email === email);
    if (!user) {
      const created = await service.auth.admin.createUser({
        email,
        email_confirm: true,
        password: testPassword,
        user_metadata: { full_name: displayName, test_account: true },
      });
      assert.equal(created.error, null, `${displayName} could not be created`);
      user = created.data.user;
    } else {
      const updated = await service.auth.admin.updateUserById(user.id, {
        password: testPassword,
        user_metadata: {
          ...user.user_metadata,
          full_name: displayName,
          test_account: true,
        },
      });
      assert.equal(updated.error, null, `${displayName} could not be reset`);
    }
    assert(user, `${displayName} is unavailable`);
    prepared.set(email, user);

    const cleared = await service
      .from("membership_applications")
      .delete()
      .eq("user_id", user.id);
    assert.equal(cleared.error, null, `${displayName} application could not be reset`);
    const profile = await service
      .from("profiles")
      .update({
        access_status: "pending",
        display_name: displayName,
        is_test_account: true,
        onboarding_completed_at: null,
        profile_completion: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    assert.equal(profile.error, null, `${displayName} profile could not be reset`);
  }
  return prepared;
}

async function submit(email, displayName) {
  const member = browserClient();
  const signedIn = await member.auth.signInWithPassword({
    email,
    password: testPassword,
  });
  assert.equal(signedIn.error, null, `${displayName} sign-in failed`);
  const result = await member.rpc("submit_membership_application", {
    p_acknowledged: true,
    p_city: "Nairobi",
    p_country: "Kenya",
    p_display_name: displayName,
    p_professional_focus: "Community product acceptance",
    p_reason: "Testing the membership welcome journey safely before public release.",
    p_referral_source: "Production acceptance rehearsal",
    p_referred_by: null,
  });
  await member.auth.signOut();
  return result;
}

let outcomes;
try {
  await setMode("manual_review");
  const users = await prepareIdentities();

  const manual = await submit(...identities.manual);
  assert.equal(manual.error, null, "Manual-review submission failed");
  assert.equal(manual.data, "submitted", "Manual applicant did not remain queued");

  await setMode("trusted_auto");
  const uninvited = await submit(...identities.uninvited);
  assert.equal(uninvited.error, null, "Uninvited submission failed");
  assert.equal(uninvited.data, "submitted", "Uninvited applicant bypassed review");

  const invitedUser = users.get(identities.invited[0]);
  await service
    .from("beta_invites")
    .update({ status: "revoked" })
    .eq("email", identities.invited[0])
    .eq("status", "pending");
  const invitation = await service.from("beta_invites").insert({
    email: identities.invited[0],
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    intended_role: null,
    invited_by: operatorSignIn.data.user.id,
  });
  assert.equal(invitation.error, null, "Verified invitation could not be prepared");
  const invited = await submit(...identities.invited);
  assert.equal(invited.error, null, "Invited submission failed");
  assert.equal(invited.data, "approved", "Verified invitation did not reach onboarding");
  const invitedProfile = await service
    .from("profiles")
    .select("access_status,is_test_account")
    .eq("id", invitedUser.id)
    .single();
  assert.equal(invitedProfile.data?.access_status, "onboarding");
  assert.equal(invitedProfile.data?.is_test_account, true);

  await setMode("closed");
  const paused = await submit(...identities.paused);
  assert(paused.error, "Paused intake accepted a new request");
  assert.match(paused.error.message, /temporarily paused/i);

  outcomes = {
    invited: "approved_to_onboarding",
    manual: "waiting_for_review",
    paused: "submission_blocked",
    uninvitedInTrustedMode: "waiting_for_review",
  };
} finally {
  await setMode(originalMode);
  await operator.auth.signOut();
}

process.stdout.write(
  `${JSON.stringify(
    {
      dummyAccounts: Object.keys(identities).length,
      originalModeRestored: originalMode,
      outcomes,
      passwordsPrinted: false,
      secretsPrinted: false,
    },
    null,
    2,
  )}\n`,
);
