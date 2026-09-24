import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20260924140000_event_table_rounds.sql");
const test = read("supabase/tests/009_event_table_rounds.sql");
const eventPage = read("app/events/[slug]/page.tsx");
const hostPage = read("app/events/[slug]/rounds/host/page.tsx");
const attendeePage = read("app/events/[slug]/rounds/page.tsx");
const host = read("components/events/event-round-host.tsx");
const admin = read("components/admin/event-round-review.tsx");

for (const contract of [
  "event_round_settings", "enabled boolean not null default false",
  "event_round_preferences", "event_round_seats", "opted_in",
  "can_use_event_round", "can_host_event", "is_blocked_pair",
  "status in ('confirmed', 'attended')", "profile.access_status in ('active', 'pending')",
  "set_event_round_enabled", "save_my_event_round_interest",
  "list_event_round_volunteers", "assign_event_round_seat",
  "validate_event_round", "review_event_round",
  "list_my_event_round_schedule", "round.status = 'approved'",
]) assert(sql.includes(contract), `Table round contract missing: ${contract}`);
assert(!sql.includes("member_onboarding"), "Table rounds must not grant wider membership");
assert(!sql.includes("grant select on public.event_round"), "Private round tables must not have direct client reads");
assert(!sql.includes("grant execute on function public.validate_event_round"), "Validation must stay private to server functions");
assert(eventPage.includes("activeMember || eventGuestEligible || isConfirmedGuest"), "Confirmed event-only guests must retain event access when new guest requests are paused");
assert(eventPage.includes("roundStatus?.enabled") && eventPage.includes("/rounds"));
assert(hostPage.includes("get_my_event_host_workspace") && host.includes("submit_event_round"));
assert(attendeePage.includes("get_my_event_round_status") && attendeePage.includes("list_my_event_round_schedule"));
assert(admin.includes("set_event_round_enabled") && admin.includes("review_event_round"));
assert(sql.includes("pause_event_rounds_after_block") && sql.includes("pause_event_rounds_after_place_change") && sql.includes("pause_event_rounds_after_seat_removal"));
assert(test.includes("select plan(24)") && test.includes("rollback;"));
console.log("Event table round contracts verified: consent, scoped Host planning, Admin review and private schedules.");
