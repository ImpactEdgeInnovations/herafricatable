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
    "Supabase, primary Admin and 12+ character membership test credentials are required.",
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

  const feature = await service
    .from("feature_flags")
    .select("enabled")
    .eq("key", "referrals")
    .single();
  assert.equal(feature.error, null);
  assert.equal(feature.data.enabled, true, "Referrals are not enabled");

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

  process.stdout.write(
    `${JSON.stringify(
      {
        application: "manual_review",
        campaign: "active",
        email: "queued_with_targeted_delivery",
        invitationContext: "verified_from_authenticated_email",
        lifecycle: ["pending_review", "approved", "claimed", "activated"],
        ready: true,
        secretsPrinted: false,
      },
      null,
      2,
    )}\n`,
  );
} finally {
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
