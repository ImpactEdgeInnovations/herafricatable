import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261005140000_event_door_only_access.sql", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/events/[slug]/door/page.tsx", import.meta.url), "utf8");
const consoleView = readFileSync(new URL("../components/events/event-door-console.tsx", import.meta.url), "utf8");
const adminView = readFileSync(new URL("../components/admin/event-door-staff-control.tsx", import.meta.url), "utf8");
const audit = readFileSync(new URL("./audit-event-pilot-live.mjs", import.meta.url), "utf8");

assert(migration.includes("create table public.event_door_staff"));
assert(migration.includes("p.access_status = 'active' and e.status = 'published'"));
assert(migration.includes("and u.email_confirmed_at is not null"));
assert(migration.includes("if evt.status <> 'published'"));
assert(migration.includes("event.check_in"));
assert(!migration.includes("insert into public.user_roles"));
assert(!migration.includes("insert into public.event_staff_scopes"));
assert(migration.includes('for select to authenticated'));
assert(!migration.includes('for insert to authenticated'));
assert(!migration.includes('for update to authenticated'));
assert(page.includes('supabase.rpc("get_my_event_door"'));
assert(page.includes("notFound()"));
assert(consoleView.includes('supabase.rpc("door_check_in_event_member"'));
assert(!consoleView.includes("list_event_checkins"));
assert(!consoleView.includes("reverse_event_checkin"));
assert(adminView.includes('supabase.rpc("manage_event_door_staff"'));
assert(audit.includes('service.from("event_door_staff")'));

console.log("Door-only contracts passed: scoped assignment, verified active account, published event, private route, no guest roster or payment access.");
