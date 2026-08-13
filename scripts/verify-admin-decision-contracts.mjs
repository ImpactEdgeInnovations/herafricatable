import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const interfaceContracts = [
  ["components/admin/member-review.tsx", "review_member"],
  ["components/admin/membership-intake-control.tsx", "set_membership_intake_mode"],
  ["components/admin/community-manager.tsx", "review_community_membership"],
  ["components/admin/community-host-application-manager.tsx", "review_community_host_application"],
  ["components/admin/member-event-proposal-manager.tsx", "review_member_event_proposal"],
  ["components/admin/community-event-proposal-manager.tsx", "review_community_event_proposal"],
  ["components/admin/registration-manager.tsx", "review_manual_registration"],
  ["components/admin/community-moderation.tsx", "review_event_question_report"],
  ["components/admin/privacy-operations.tsx", "manage_privacy_request"],
  ["components/admin/support-inbox.tsx", "manage_support_ticket"],
  ["components/admin/launch-gate-control.tsx", "save_launch_gate_check"],
  ["components/admin/referral-manager.tsx", "review_vouched_referral"],
];

for (const [path, rpc] of interfaceContracts) {
  assert(
    read(path).includes(`rpc("${rpc}"`) || read(path).includes(`"${rpc}"`),
    `${path} must call the real ${rpc} database operation`,
  );
}

const memberReview = read("supabase/migrations/20260809100000_membership_application_journey.sql");
for (const contract of [
  "create or replace function public.review_member",
  "Super admin access required",
  "for update",
  "membership_applications",
  "audit_events",
]) assert(memberReview.includes(contract), `Member decisions must include ${contract}`);
assert(
  read("supabase/migrations/20260727110000_founding_cohort_activation.sql").includes("notify_member_approval_trigger"),
  "Member approval must notify the approved member",
);

const referralLaunch = read("supabase/migrations/20260813120000_referral_launch_readiness.sql");
for (const contract of [
  "sync_referral_membership_progress",
  "claim_notification_job",
  "notify_vouched_referral_submission",
  "service_role",
]) assert(referralLaunch.includes(contract), `Referral launch must include ${contract}`);

const communityHost = read("supabase/migrations/20260801170000_community_host_applications.sql");
for (const contract of [
  "review_community_host_application",
  "Super admin required",
  "'private'",
  "'draft'",
  "enqueue_notification",
  "audit_events",
]) assert(communityHost.includes(contract), `Community approval must include ${contract}`);

const communityMembership = read("supabase/migrations/20260801010000_community_creator_commerce.sql");
for (const contract of [
  "review_community_membership",
  "can_manage_community",
  "Super admin and an active successor are required",
  "audit_events",
]) assert(communityMembership.includes(contract), `Community membership decisions must include ${contract}`);

for (const [path, name, launchBoundary] of [
  ["supabase/migrations/20260811230000_member_public_event_proposals.sql", "review_member_event_proposal", "Only free public member events are open for this launch tier"],
  ["supabase/migrations/20260809140000_community_hosted_event_proposals.sql", "review_community_event_proposal", "Public and paid Community events are not open yet"],
]) {
  const migration = read(path);
  for (const contract of [name, "Super Admin access required", launchBoundary, "manual_review", "enqueue_notification", "audit_events"]) {
    assert(migration.includes(contract), `${name} must include ${contract}`);
  }
}

const registration = read("supabase/migrations/20260722130000_registration_commerce_foundation.sql");
for (const contract of ["review_manual_registration", "can_manage_event", "fulfill_registration_order", "audit_events"]) {
  assert(registration.includes(contract), `Registration decisions must include ${contract}`);
}

console.log("Super Admin decision contracts verified across member, Community, event, registration, safety and operations interfaces.");
