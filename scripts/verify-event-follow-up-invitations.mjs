import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260925130000_event_follow_up_invitations.sql");
const adminPage = read("app/admin/events/page.tsx");
const adminView = read("components/admin/event-follow-up-invitations.tsx");
const guestView = read("components/events/event-community-follow-up.tsx");

for (const boundary of [
  "event_follow_up_invitation_links",
  "event_follow_up_attendee_eligible",
  "public.is_admin(array['super_admin']::public.app_role[])",
  "proposal.status = 'approved' and proposal.community_after_event",
  "event.ends_at < now()",
  "community.status = 'published'",
  "interest.interested",
  "for update",
  "profile.access_status in ('pending', 'onboarding', 'active')",
  "entitlement.entitlement_type = 'event_access'",
  "profile.is_test_account",
  "status = 'revoked', token_hash = null",
  "status = 'suppressed'",
  "'table-invitation:' || saved",
]) assert(migration.includes(boundary), `Event follow-up bridge must retain ${boundary}`);
assert(!migration.includes("insert into public.community_memberships"), "Sending an invitation must not enroll a guest");
assert(!migration.includes("insert into public.beta_invites"), "A follow-up invitation must not create a general membership allowlist entry");
assert(adminPage.includes('href: "follow-up"') && adminPage.includes("list_event_follow_up_candidates_admin"));
assert(adminView.includes("invite_event_follow_up_guest") && adminView.includes("/api/admin/notifications/process"));
assert(adminView.includes("candidate.community_name && !candidate.invitation_id"), "Draft Communities cannot show an invitation action");
assert(guestView.includes("unused invitation") && guestView.includes("email already sent"));

console.log("Event follow-up invitation contracts verified: consent, published Community, Admin review, delivery and withdrawal.");
