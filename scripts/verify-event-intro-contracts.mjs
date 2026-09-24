import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260924130000_event_intro_cards.sql");
const ownPage = read("app/events/[slug]/meet/page.tsx");
const scanPage = read("app/events/[slug]/meet/[code]/page.tsx");
const passPage = read("app/events/[slug]/pass/page.tsx");
const eventPage = read("app/events/[slug]/page.tsx");
const admin = read("components/admin/event-intro-safety.tsx");

for (const contract of [
  "can_use_event_intro", "event_memberships", "status in ('confirmed', 'attended')",
  "profile.access_status in ('active', 'pending')", "is_blocked_pair",
  "save_event_intro_card", "resolve_event_intro_card", "request_event_intro",
  "review_event_intro", "close_event_intro_card", "restore_event_intro_card",
  "not public.can_use_event_intro", "card.enabled", "paused_at",
  "event_intro_settings", "setting.enabled", "set_event_intro_enabled",
]) assert(migration.includes(contract), `Event introductions must retain ${contract}`);
assert(!migration.includes("member_onboarding"), "An event introduction must never grant membership");
assert(
  migration.indexOf("create or replace function public.can_use_event_intro") <
    migration.indexOf('create policy "Attendees read own event introduction requests"'),
  "The attendee permission function must exist before its RLS policy",
);
assert(ownPage.includes("get_my_event_intro_card") && ownPage.includes("list_my_event_intros"));
assert(scanPage.includes("resolve_event_intro_card") && scanPage.includes("list_my_event_intros"));
assert(!ownPage.includes("get_my_event_pass") && !scanPage.includes("get_my_event_pass"));
assert(passPage.includes("get_my_event_pass"), "The entry QR must remain a separate route");
assert(eventPage.includes("isConfirmedGuest && !introReadyResult.error"), "Only confirmed guests should see introduction entry");
assert(admin.includes("close_event_intro_card") && admin.includes("restore_event_intro_card") && admin.includes("set_event_intro_enabled"));
console.log("Event QR introduction boundaries verified: opt-in, event-only access, mutual choice and Admin pause.");
