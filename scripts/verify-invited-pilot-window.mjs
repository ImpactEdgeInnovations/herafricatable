import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261005120000_invited_membership_pilot_window.sql");
const eventMigration = read("supabase/migrations/20261005130000_invited_pilot_private_event_drafts.sql");
const publicEventMigration = read("supabase/migrations/20261005160000_pilot_free_event_publication.sql");
const order = read("supabase/migrations/20261005110000_invited_member_application_order.sql");
const membersPage = read("app/admin/members/page.tsx");
const admin = read("components/admin/member-command-centre.tsx");
const worker = read("lib/notifications/worker.ts");
const delivery = read("app/api/admin/notifications/process/route.ts");
const eventProposal = read("components/events/member-event-proposal.tsx");
const eventsPage = read("app/events/page.tsx");

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
  "invite.expires_at <= now()",
]) assert(migration.includes(contract), `Timed invited-pilot migration must include ${contract}`);
assert(order.includes("matching_invite.intended_role is not null"));
assert(!order.includes("intake_mode = 'trusted_auto'"));
assert(membersPage.includes('get_membership_pilot_window'));
assert(membersPage.includes('source", "admin_pilot'));
assert(admin.includes('rpc("invite_pilot_member"'));
assert(admin.includes('rpc("revoke_pilot_member_invitation"'));
assert(admin.includes('Open pilot: welcome new members automatically'));
assert(read("supabase/migrations/20261005210000_open_founding_member_cohort.sql").includes("auto_approved := true"));
assert(worker.includes('job.dedupe_key.startsWith("pilot-member-invite:")'));
assert(worker.includes('intakeResult.data?.mode === "trusted_auto"'));
assert(delivery.includes('pilot-member-invite'));
for (const contract of [
  "auto_private_drafts boolean not null default false",
  "public.is_admin(array['super_admin']::public.app_role[])",
  "public.get_membership_intake_mode() <> 'trusted_auto'",
  "invite.source = 'admin_pilot'",
  "invite.accepted_by = actor",
  "proposal.pilot_auto_draft",
  "'draft', new.starts_at",
  "'manual_review', false, 'public'",
  "'draft', 0",
  "public.event_hosts(event_id, user_id, status, assigned_by)",
  "public.event_host_workspaces(event_id)",
  "after insert or update of status",
]) assert(eventMigration.includes(contract), `Invited-pilot event migration must include ${contract}`);
assert(membersPage.includes('get_invited_pilot_event_setting'));
assert(admin.includes('rpc("set_invited_pilot_event_setting"'));
assert(eventProposal.includes('Your private event is ready. Open its Host page'));
for (const contract of [
  "auto_publish_free_events boolean not null default false",
  "public.get_membership_intake_mode() = 'trusted_auto'",
  "public.is_active_member(actor)",
  "proposal.proposed_by <> actor",
  "proposal.status <> 'submitted'",
  "proposal.pricing_mode <> 'free'",
  "proposal.map_url",
  "proposal.address_line",
  "public.event_safety_contacts",
  "'manual_review', false, 'public'",
  "set status = 'published'",
  "set status = 'on_sale'",
  "auto_publish_free_events = false",
  "'event.pilot_free_published'",
]) assert(publicEventMigration.includes(contract), `Free-event pilot migration must include ${contract}`);
assert(admin.includes('rpc("set_pilot_free_event_setting"'));
assert(eventProposal.includes('rpc("publish_pilot_free_event"'));
assert(eventProposal.includes('Add either a street address or a map link'));
assert(eventsPage.indexOf('<section className="public-event-list"') < eventsPage.indexOf('<section className="my-events-section"'));
console.log("Timed invited-member and free-event pilot boundaries passed.");
