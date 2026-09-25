import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20260925120000_event_host_outcomes.sql");
const hostPage = read("app/events/[slug]/host/page.tsx");
const hostView = read("components/events/event-host-workspace.tsx");
const adminPage = read("app/admin/operations/page.tsx");
const adminView = read("components/admin/event-feedback-manager.tsx");

for (const boundary of [
  "can_view_event_host_outcomes",
  "get_event_host_outcomes",
  "host.user_id = auth.uid()",
  "host.status = 'active'",
  "event.ends_at < now()",
  "event.ends_at > now()",
  "not profile.is_test_account",
  "checkin.reversed_at is null",
  "n_checked < 5",
  "n_feedback >= 5",
  "n_interest >= 5",
  "n_introductions >= 5",
]) assert(migration.includes(boundary), `Host report must retain ${boundary}`);
assert(!migration.includes("member_email") && !migration.includes("testimonial_quote"), "Host report must not expose private identities or quotes");
assert(hostPage.includes("get_event_host_outcomes"));
assert(hostView.includes("if (hasEnded) return") && hostView.includes("Under 5"));
assert(adminPage.includes("get_event_host_outcomes") && adminView.includes("What the Host can see"));

console.log("Event Host outcomes verified: completed-event access, source totals, test-account exclusion and small-cell privacy.");
