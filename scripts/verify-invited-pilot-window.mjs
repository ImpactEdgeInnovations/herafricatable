import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261005120000_invited_membership_pilot_window.sql");
const order = read("supabase/migrations/20261005110000_invited_member_application_order.sql");
const membersPage = read("app/admin/members/page.tsx");
const admin = read("components/admin/member-command-centre.tsx");
const worker = read("lib/notifications/worker.ts");
const delivery = read("app/api/admin/notifications/process/route.ts");

for (const contract of [
  "trusted_auto_expires_at",
  "now() + interval '60 days'",
  "then 'manual_review'",
  "public.is_admin(array['super_admin']::public.app_role[])",
  "public.invite_pilot_member",
  "public.revoke_pilot_member_invitation",
  "now() + interval '30 days'",
  "This pilot has reached its 100-invitation limit",
  "'pilot_invitation'",
  "'pilot-member-invite:' || saved",
  "source = 'admin_pilot'",
]) assert(migration.includes(contract), `Timed invited-pilot migration must include ${contract}`);
assert(order.includes("matching_invite.intended_role is not null"));
assert(!order.includes("intake_mode = 'trusted_auto'"));
assert(membersPage.includes('get_membership_pilot_window'));
assert(membersPage.includes('source", "admin_pilot'));
assert(admin.includes('rpc("invite_pilot_member"'));
assert(admin.includes('rpc("revoke_pilot_member_invitation"'));
assert(admin.includes('Auto-welcome invited people for 60 days'));
assert(worker.includes('job.dedupe_key.startsWith("pilot-member-invite:")'));
assert(worker.includes('intakeResult.data?.mode === "trusted_auto"'));
assert(delivery.includes('pilot-member-invite'));
console.log("Timed invited-member pilot boundaries and Admin invitation delivery contracts passed.");
