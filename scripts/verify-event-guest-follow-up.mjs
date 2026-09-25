import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260925110000_event_guest_follow_up.sql");
const followUp = read("app/events/[slug]/follow-up/page.tsx");
const feedback = read("app/events/[slug]/feedback/page.tsx");
const eventPage = read("app/events/[slug]/page.tsx");
const past = read("app/events/past/page.tsx");

for (const boundary of [
  "can_leave_event_feedback",
  "can_choose_event_follow_up",
  "attendance.status in ('confirmed', 'attended')",
  "profile.access_status = 'pending'",
  "event.audience = 'public'",
  "entitlement.entitlement_type = 'event_access'",
  "entitlement.status = 'active'",
  "event.ends_at < now()",
  "Confirmed event attendance required",
  "get_my_event_follow_up_interest",
  "Event guest",
]) assert(migration.includes(boundary), `Guest follow-up must retain ${boundary}`);
assert(!migration.includes("member_onboarding"), "Event follow-up must not grant membership");
assert(followUp.includes("guestFollowUpAccess") && followUp.includes("if (!activeMember && !guestFollowUpAccess) notFound()"));
assert(followUp.includes("activeMember ? <EventAttendeeDirectory") && followUp.includes("get_my_event_intro_card"));
assert(feedback.includes("can_leave_event_feedback") && feedback.includes("if (!allowed) notFound()"));
assert(eventPage.includes("guestFollowUpAccess") && eventPage.includes("Open my follow-up"));
assert(past.includes("guestFollowUpEvents.has(event.event_id)") && past.includes("My event follow-up"));
assert(!read("components/events/post-event-feedback-form.tsx").includes("May publish with my member name"));

console.log("Event-only guest follow-up contracts verified: private feedback, scoped event access and no member-directory grant.");
