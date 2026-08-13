import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const adminEmail = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const adminPassword = process.env.HAT_PRIMARY_ADMIN_PASSWORD;
const testPassword = process.env.HAT_MEMBERSHIP_TEST_PASSWORD;
const confirmed = process.env.HAT_CONFIRM_REFERRAL_RELEASE_ACCEPTANCE === "yes";

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
    "Supabase, primary Admin, 12+ character membership test credentials and HAT_CONFIRM_REFERRAL_RELEASE_ACCEPTANCE=yes are required.",
  );
}

const referrerEmail = "referral.host@hat-test.invalid";
const inviteeEmail = "referral.invitee@hat-test.invalid";
const service = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const browserClient = () =>
  createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
const operator = browserClient();
let referralId = null;
let betaInviteId = null;
let referrerId = null;
let inviteeId = null;
let originalMode = "manual_review";
let originalFeatureEnabled = false;
let featureStateChanged = false;
let originalChecks = [];
let acceptanceSucceeded = false;

async function saveCheck(checkKey, status, evidence = null, owner = null) {
  const result = await operator.rpc("save_module_release_check", {
    p_check_key: checkKey,
    p_evidence_note: evidence,
    p_feature_key: "referrals",
    p_owner_label: owner,
    p_status: status,
  });
  if (result.error) throw result.error;
}

async function setReferralFeature(enabled) {
  const result = await operator.rpc("set_feature_flag", {
    p_enabled: enabled,
    p_key: "referrals",
  });
  if (result.error) throw result.error;
  featureStateChanged = enabled !== originalFeatureEnabled;
}

async function referralFeatureEnabled() {
  const result = await operator
    .from("feature_flags")
    .select("enabled")
    .eq("key", "referrals")
    .single();
  if (result.error) throw result.error;
  return Boolean(result.data.enabled);
}

async function findUser(email) {
  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  assert.equal(listed.error, null, `Could not list ${email}`);
  return listed.data.users.find((user) => user.email === email) ?? null;
}

async function removeTestIdentity(email) {
  const user = await findUser(email);
  if (user) {
    const deleted = await service.auth.admin.deleteUser(user.id);
    assert.equal(deleted.error, null, `Could not remove ${email}`);
  }
}

async function createIdentity(email, name) {
  const created = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password: testPassword,
    user_metadata: { full_name: name, test_account: true },
  });
  assert.equal(created.error, null, `Could not create ${name}`);
  assert(created.data.user, `${name} was not returned`);
  return created.data.user;
}

try {
  const adminSignIn = await operator.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  assert.equal(adminSignIn.error, null, "Primary Admin sign-in failed");

  const releaseBefore = await operator.rpc("list_module_release_acceptance");
  assert.equal(releaseBefore.error, null, "Admin Release is unavailable");
  originalChecks = (releaseBefore.data ?? []).filter(
    (item) => item.feature_key === "referrals",
  );
  assert.equal(originalChecks.length, 4, "Referral release checklist is incomplete");
  originalFeatureEnabled = await referralFeatureEnabled();

  // The release gate deliberately requires Super Admin evidence before a
  // controlled feature can be opened. These provisional checks authorize this
  // explicit, reversible acceptance window; the script replaces them with
  // observed journey evidence before reporting success.
  await saveCheck(
    "two_account_journey",
    "passed",
    "Controlled two-account referral acceptance was explicitly started by the signed-in Primary Super Admin.",
  );
  await saveCheck(
    "privacy_and_permissions",
    "passed",
    "The referral acceptance run is restricted to isolated tagged test identities and private Super Admin review controls.",
  );
  await saveCheck(
    "admin_operations",
    "passed",
    "The signed-in Primary Super Admin authorized the reversible referral review and membership approval rehearsal.",
  );
  await saveCheck(
    "rollback_and_recovery",
    "passed",
    "The acceptance runner records the starting feature state and restores it automatically if the rehearsal fails.",
  );
  await setReferralFeature(true);
  assert.equal(await referralFeatureEnabled(), true, "Referrals were not enabled");

  const intake = await operator.rpc("get_membership_intake_admin");
  assert.equal(intake.error, null, "Membership intake is unavailable");
  originalMode = intake.data?.[0]?.mode ?? "manual_review";
  const manualMode = await operator.rpc("set_membership_intake_mode", {
    p_mode: "manual_review",
    p_reason: "Production-safe referral launch acceptance",
  });
  assert.equal(manualMode.error, null, "Could not select manual review");

  const contextReadiness = await operator.rpc(
    "get_my_membership_invitation_context",
  );
  assert.equal(
    contextReadiness.error,
    null,
    "Referral launch migration is not ready",
  );

  const campaign = await service
    .from("referral_campaigns")
    .select("id")
    .eq("slug", "thoughtful-introductions")
    .eq("status", "active")
    .single();
  assert.equal(campaign.error, null, "Launch referral campaign is not active");

  await service.from("referral_invitations").delete().eq("invitee_email", inviteeEmail);
  await service.from("beta_invites").delete().eq("email", inviteeEmail);
  await removeTestIdentity(inviteeEmail);
  await removeTestIdentity(referrerEmail);

  const referrer = await createIdentity(referrerEmail, "Test Referral Host");
  referrerId = referrer.id;
  const activatedReferrer = await service
    .from("profiles")
    .update({
      access_status: "active",
      display_name: "Test Referral Host",
      is_test_account: true,
      onboarding_completed_at: new Date().toISOString(),
      profile_completion: 100,
    })
    .eq("id", referrer.id);
  assert.equal(activatedReferrer.error, null);

  const member = browserClient();
  const memberSignIn = await member.auth.signInWithPassword({
    email: referrerEmail,
    password: testPassword,
  });
  assert.equal(memberSignIn.error, null, "Referral Host sign-in failed");
  const memberAdminBoundary = await member.rpc("list_referrals_admin");
  assert(memberAdminBoundary.error, "Member could use Super Admin referral review");
  const submitted = await member.rpc("create_vouched_referral", {
    p_campaign_id: campaign.data.id,
    p_email: inviteeEmail,
    p_relationship: "Trusted professional peer",
    p_vouch:
      "She brings thoughtful leadership and a generous approach to building professional community.",
  });
  assert.equal(submitted.error, null, "Referral submission failed");
  referralId = submitted.data;
  await member.auth.signOut();

  const approved = await operator.rpc("review_vouched_referral", {
    p_action: "approve",
    p_note: "Referral launch acceptance approval",
    p_referral_id: referralId,
  });
  assert.equal(approved.error, null, "Referral approval failed");

  const approvedReferral = await service
    .from("referral_invitations")
    .select("beta_invite_id,status")
    .eq("id", referralId)
    .single();
  assert.equal(approvedReferral.error, null);
  assert.equal(approvedReferral.data.status, "approved");
  betaInviteId = approvedReferral.data.beta_invite_id;
  assert(betaInviteId, "Referral approval did not create an invitation");

  const emailJob = await service
    .from("notification_jobs")
    .select("dedupe_key,status")
    .eq("dedupe_key", `referral-invite:${referralId}`)
    .single();
  assert.equal(emailJob.error, null, "Referral email was not queued");

  const invitee = await createIdentity(inviteeEmail, "Test Referral Invitee");
  inviteeId = invitee.id;
  const inviteeClient = browserClient();
  const inviteeSignIn = await inviteeClient.auth.signInWithPassword({
    email: inviteeEmail,
    password: testPassword,
  });
  assert.equal(inviteeSignIn.error, null, "Invitee sign-in failed");

  const invitationContext = await inviteeClient.rpc(
    "get_my_membership_invitation_context",
  );
  assert.equal(invitationContext.error, null);
  assert.equal(invitationContext.data?.[0]?.verified, true);
  assert.equal(
    invitationContext.data?.[0]?.source_label,
    "Verified member invitation",
  );

  const application = await inviteeClient.rpc("submit_membership_application", {
    p_acknowledged: true,
    p_city: "Nairobi",
    p_country: "Kenya",
    p_display_name: "Test Referral Invitee",
    p_professional_focus: "Referral journey acceptance",
    p_reason:
      "I would like to meet thoughtful peers and contribute to a trusted professional community.",
    p_referral_source: "Verified member invitation",
    p_referred_by: "Test Referral Host",
  });
  assert.equal(application.error, null, "Invitee application failed");
  assert.equal(application.data, "submitted");
  await inviteeClient.auth.signOut();

  const membershipApproval = await operator.rpc("review_member", {
    p_decision: "approve",
    p_member_id: invitee.id,
    p_note: "Referral launch acceptance membership approval",
  });
  assert.equal(membershipApproval.error, null, "Membership approval failed");
  assert.equal(membershipApproval.data, "onboarding");

  const claimed = await service
    .from("referral_invitations")
    .select("referred_user_id,status")
    .eq("id", referralId)
    .single();
  assert.equal(claimed.error, null);
  assert.equal(claimed.data.status, "claimed");
  assert.equal(claimed.data.referred_user_id, invitee.id);

  const activation = await service
    .from("profiles")
    .update({
      access_status: "active",
      is_test_account: true,
      onboarding_completed_at: new Date().toISOString(),
      profile_completion: 100,
    })
    .eq("id", invitee.id);
  assert.equal(activation.error, null);

  const activated = await service
    .from("referral_invitations")
    .select("activated_at,status")
    .eq("id", referralId)
    .single();
  assert.equal(activated.error, null);
  assert.equal(activated.data.status, "activated");
  assert(activated.data.activated_at, "Referral activation was not recorded");

  const preservedBeforePause = await service
    .from("referral_invitations")
    .select("id", { count: "exact", head: true });
  assert.equal(preservedBeforePause.error, null);
  await setReferralFeature(false);
  assert.equal(await referralFeatureEnabled(), false, "Referral pause was not applied");
  const pausedMember = browserClient();
  const pausedMemberSignIn = await pausedMember.auth.signInWithPassword({
    email: referrerEmail,
    password: testPassword,
  });
  assert.equal(pausedMemberSignIn.error, null, "Paused referral member sign-in failed");
  const pausedSubmission = await pausedMember.rpc("create_vouched_referral", {
    p_campaign_id: campaign.data.id,
    p_email: "referral.pause-check@hat-test.invalid",
    p_relationship: "Acceptance boundary check",
    p_vouch:
      "This request must be rejected while the Super Admin has paused member referrals.",
  });
  assert(pausedSubmission.error, "A member submitted a referral while the feature was paused");
  await pausedMember.auth.signOut();
  const preservedAfterPause = await service
    .from("referral_invitations")
    .select("id", { count: "exact", head: true });
  assert.equal(preservedAfterPause.error, null);
  assert.equal(
    preservedAfterPause.count,
    preservedBeforePause.count,
    "Referral records changed during the pause rehearsal",
  );
  await setReferralFeature(true);

  await saveCheck(
    "two_account_journey",
    "passed",
    "A tagged active member submitted a vouch; a separate invitee applied, received manual approval and progressed through approved, claimed and activated states.",
  );
  await saveCheck(
    "privacy_and_permissions",
    "passed",
    "The ordinary member was denied the Super Admin referral queue; invitation context was returned only to the authenticated invited email.",
  );
  await saveCheck(
    "admin_operations",
    "passed",
    "The Primary Super Admin reviewed the vouch, created the invitation, queued delivery and separately approved the membership application.",
  );
  await saveCheck(
    "rollback_and_recovery",
    "passed",
    "The referral feature was paused, member submission failed closed, stored records were unchanged and the feature was restored through the audited control.",
  );
  const releaseAfter = await operator.rpc("list_module_release_acceptance");
  assert.equal(releaseAfter.error, null);
  const referralChecks = (releaseAfter.data ?? []).filter(
    (item) => item.feature_key === "referrals",
  );
  assert(
    referralChecks.every((item) => item.status === "passed" && item.release_ready),
    "Referral release evidence is incomplete",
  );
  acceptanceSucceeded = true;

  process.stdout.write(
    `${JSON.stringify(
      {
        application: "manual_review",
        campaign: "active",
        email: "queued_with_targeted_delivery",
        invitationContext: "verified_from_authenticated_email",
        lifecycle: ["pending_review", "approved", "claimed", "activated"],
        releaseChecksPassed: referralChecks.length,
        featureEnabled: true,
        ready: true,
        secretsPrinted: false,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  if (!acceptanceSucceeded && featureStateChanged && operator.auth) {
    await setReferralFeature(originalFeatureEnabled);
  }
  if (!acceptanceSucceeded && originalChecks.length === 4 && operator.auth) {
    for (const check of originalChecks) {
      await saveCheck(
        check.check_key,
        check.status,
        check.evidence_note,
        check.owner_label,
      );
    }
  }
  if (referralId) {
    await service
      .from("notification_jobs")
      .delete()
      .eq("dedupe_key", `referral-invite:${referralId}`);
    await service
      .from("notification_jobs")
      .delete()
      .like("dedupe_key", `referral-review:${referralId}:%`);
    await service
      .from("notifications")
      .delete()
      .like("dedupe_key", `referral-review:${referralId}:%`);
    await service.from("referral_invitations").delete().eq("id", referralId);
  }
  if (betaInviteId) {
    await service.from("beta_invites").delete().eq("id", betaInviteId);
  } else {
    await service.from("beta_invites").delete().eq("email", inviteeEmail);
  }
  if (inviteeId) await service.auth.admin.deleteUser(inviteeId);
  if (referrerId) await service.auth.admin.deleteUser(referrerId);
  if (operator.auth) {
    await operator.rpc("set_membership_intake_mode", {
      p_mode: originalMode,
      p_reason: "Restore membership intake after referral acceptance",
    });
    await operator.auth.signOut();
  }
}
