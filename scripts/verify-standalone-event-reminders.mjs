import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261004090000_standalone_event_reminders.sql");
const pass = read("app/events/[slug]/pass/page.tsx");
const control = read("components/events/standalone-event-reminder.tsx");
const worker = read("lib/notifications/worker.ts");
const email = read("lib/notifications/email.ts");
const admin = read("components/admin/event-content-manager.tsx");

for (const contract of [
  "enable row level security",
  "user_id = auth.uid()",
  "membership.status = 'confirmed'",
  "target.starts_at - interval '1 day' <= now()",
  "not exists (select 1 from public.community_event_links",
  "status = 'suppressed'",
  "sync_standalone_event_reminders_on_event",
  "stop_standalone_event_reminder_on_place_change",
  "queue_due_standalone_event_reminders",
  "check_standalone_event_reminder_job",
  "preference.email_events",
  "grant execute on function public.set_my_standalone_event_reminder(uuid, boolean) to authenticated",
  "grant execute on function public.queue_due_standalone_event_reminders(timestamptz) to service_role",
]) {
  assert(migration.includes(contract), `Standalone reminder migration must enforce ${contract}`);
}
for (const contract of ["get_my_event_pass", "standalone_event_reminders", "StandaloneEventReminder", "!communityLinkError && !communityLink"]) {
  assert(pass.includes(contract), `Confirmed pass must scope reminder UI through ${contract}`);
}
assert(control.includes("set_my_standalone_event_reminder"));
assert(control.includes("notification settings"));
assert(worker.includes("queue_due_standalone_event_reminders"));
assert(worker.includes("check_standalone_event_reminder_job"));
assert(email.includes("Open my event pass"));
assert(admin.includes("Publish and notify guests"));
console.log("Standalone event reminder boundaries and reviewed announcement delivery contracts passed.");
