import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessPilotEvent, assessPilotPublication } from "./lib/assess-pilot-event.mjs";
import { privateDraftHidden } from "./lib/private-draft-hidden.mjs";
import { recommendPilotRelease } from "./lib/recommend-pilot-release.mjs";
import { pilotLaunchGateBlockers, pilotLaunchKeys } from "./lib/pilot-launch-gates.mjs";
import { assessDesignatedHost } from "./lib/assess-designated-host.mjs";

const hiddenTitle = "[TEST] Private Event Host Rehearsal";
const noIndex = '<meta name="robots" content="noindex"/>';
assert.equal(privateDraftHidden({ status: 404, body: noIndex, title: hiddenTitle }), true);
assert.equal(privateDraftHidden({ status: 200,
  body: `${noIndex}NEXT_HTTP_ERROR_FALLBACK;404`, title: hiddenTitle }), true);
assert.equal(privateDraftHidden({ status: 200, body: noIndex, title: hiddenTitle }), false);
assert.equal(privateDraftHidden({ status: 404, body: hiddenTitle, title: hiddenTitle }), false);
assert.equal(privateDraftHidden({ status: 503, body: noIndex, title: hiddenTitle }), false);

const now = new Date("2026-09-27T12:00:00Z");
const ready = {
  event: {
    audience: "public", capacity: 20, ends_at: "2026-10-10T20:00:00Z",
    format: "hybrid", registration_mode: "manual_review", starts_at: "2026-10-10T17:00:00Z",
    status: "published", summary: "A hosted Nairobi gathering for trusted introductions and useful conversations.",
    timezone: "Africa/Nairobi",
  },
  tickets: [{ id: "free", inventory_quantity: 20, price_minor: 0, sales_start_at: null,
    sales_end_at: null, status: "on_sale" }],
  host: { status: "active" }, hostProfile: { access_status: "active" },
  workspace: { status: "approved" }, safetyContact: { event_id: "pilot" },
  orders: [],
  onlineLink: "https://meet.example.test/private", venue: { name: "The Table", city: "Nairobi", country: "Kenya", address_line: "Mbaazi Road", map_url: null },
  doorStaffActive: true,
};
const checks = (input) => assessPilotEvent(input, now);
assert(Object.values(checks(ready)).every(Boolean));
assert.equal(checks({ ...ready, event: { ...ready.event, audience: "community" } }).publicAndPublished, false);
assert.equal(checks({ ...ready, event: { ...ready.event, status: "draft" } }).publicAndPublished, false);
assert.equal(checks({ ...ready, event: { ...ready.event, capacity: null } }).basics, false);
assert.equal(checks({ ...ready, event: { ...ready.event, starts_at: "2026-09-26T17:00:00Z" } }).basics, false);
assert.equal(checks({ ...ready, event: { ...ready.event, status: "draft", starts_at: "2026-09-29T11:00:00Z" } }).basics, false);
assert.equal(checks({ ...ready, event: { ...ready.event, status: "draft", starts_at: "2026-09-30T17:00:00Z" } }).basics, true);
assert.equal(checks({ ...ready, orders: [{ status: "pending_review", order_items: [{ ticket_type_id: "free", quantity: 20 }] }] }).placeAvailable, false);
assert.equal(checks({ ...ready, orders: [{ status: "pending_review", order_items: [{ ticket_type_id: "free", quantity: 20 }] }] }).freeManualTicket, false);
assert.equal(checks({ ...ready, event: { ...ready.event, capacity: 25 }, orders: [{ status: "pending_review", order_items: [{ ticket_type_id: "free", quantity: 20 }] }] }).placeAvailable, true);
assert.equal(checks({ ...ready, event: { ...ready.event, capacity: 25 }, orders: [{ status: "pending_review", order_items: [{ ticket_type_id: "free", quantity: 20 }] }] }).freeManualTicket, false);
assert.equal(checks({ ...ready, orders: [{ status: "cancelled", order_items: [{ ticket_type_id: "free", quantity: 20 }] }] }).placeAvailable, true);
assert.equal(checks({ ...ready, orders: [{ status: "cancelled", order_items: [{ ticket_type_id: "free", quantity: 20 }] }] }).freeManualTicket, true);
assert.equal(checks({ ...ready, onlineLink: "" }).placeReady, false);
assert.equal(checks({ ...ready, venue: null }).placeReady, false);
assert.equal(checks({ ...ready, venue: { ...ready.venue, address_line: null } }).placeReady, false);
assert.equal(checks({ ...ready, tickets: [{ ...ready.tickets[0], status: "draft" }] }).freeManualTicket, false);
assert.equal(checks({ ...ready, tickets: [{ ...ready.tickets[0], sales_start_at: "2026-10-11T00:00:00Z" }] }).freeManualTicket, false);
assert.equal(checks({ ...ready, tickets: [{ ...ready.tickets[0], price_minor: 100 }] }).freeManualTicket, false);
assert.equal(checks({ ...ready, hostProfile: { access_status: "suspended" } }).hostReady, false);
assert.equal(checks({ ...ready, workspace: { status: "submitted" } }).hostContentApproved, false);
assert.equal(checks({ ...ready, safetyContact: null }).safetyContactReady, false);
assert.equal(checks({ ...ready, doorStaffActive: false }).doorStaffAssigned, false);
const prepublication = {
  ...ready,
  event: { ...ready.event, status: "draft", registration_mode: "closed" },
  tickets: [{ ...ready.tickets[0], status: "draft" }],
  workspace: { status: "submitted" },
};
assert(Object.values(assessPilotPublication(prepublication, now)).every(Boolean));
assert.equal(assessPilotPublication(ready, now).privatePublicDraft, false);
assert.equal(assessPilotPublication({ ...prepublication, event: { ...prepublication.event, registration_mode: "manual_review" } }, now).privatePublicDraft, false);
assert.equal(assessPilotPublication({ ...prepublication, tickets: [{ ...prepublication.tickets[0], status: "archived" }] }, now).freeTicketPrepared, false);
assert.equal(assessPilotPublication({ ...prepublication, workspace: { status: "editing" } }, now).hostDraftSubmitted, false);
assert.equal(assessPilotPublication({ ...prepublication, hostProfile: { access_status: "pending" } }, now).hostReady, false);
assert.equal(assessPilotPublication({ ...prepublication, doorStaffActive: false }, now).doorStaffAssigned, false);
assert.equal(assessPilotPublication({ ...prepublication, event: { ...prepublication.event, starts_at: "2026-09-28T10:00:00Z" } }, now).basics, false);
const liveAudit = readFileSync(new URL("./audit-event-pilot-live.mjs", import.meta.url), "utf8");
assert(liveAudit.includes('service.rpc("event_publication_sequence_ready")'));
assert(liveAudit.includes('service.rpc("event_arrival_details_guard_ready")'));
assert(liveAudit.includes('blockers.push("event_arrival_details_guard_not_ready")'));
assert(liveAudit.includes('blockers.push("admin_event_publication_guard_not_ready")'));
assert(liveAudit.includes('service.rpc("event_single_seat_guard_ready")'));
assert(liveAudit.includes('blockers.push("one_pass_per_attendee_guard_not_ready")'));
assert(liveAudit.includes('service.rpc("event_capacity_guard_ready")'));
assert(liveAudit.includes('blockers.push("shared_event_capacity_guard_not_ready")'));
assert(liveAudit.includes('service.rpc("event_registration_end_guard_ready")'));
assert(liveAudit.includes('blockers.push("event_registration_end_guard_not_ready")'));
assert(liveAudit.includes('service.rpc("event_registration_notification_ready")'));
assert(liveAudit.includes('blockers.push("event_registration_notifications_not_ready")'));
assert(liveAudit.includes('service.rpc("event_waitlist_ready")'));
assert(liveAudit.includes('blockers.push("event_waitlist_lifecycle_not_ready")'));
assert(liveAudit.includes('service.rpc("event_automatic_checkout_guard_ready")'));
assert(liveAudit.includes('blockers.push("event_automatic_checkout_guard_not_ready")'));
assert(liveAudit.includes('service.rpc("launch_signoff_guard_ready")'));
assert(liveAudit.includes('blockers.push("final_launch_signoff_guard_not_ready")'));
assert(liveAudit.includes('automaticEventPaymentsOpen: automaticCheckoutFlagResult.data?.enabled === true'));
assert(liveAudit.includes('!adminEvidence.tagged || adminEvidence.usesPrimaryAccount'));
assert(liveAudit.includes('blockers.push("dedicated_admin_rehearsal_account_missing")'));
assert(liveAudit.includes('admin.rpc("list_launch_gate_checks")'));
assert(liveAudit.includes('admin.rpc("list_event_registrations", { p_event_id: rehearsalEvent.id })'));
assert(liveAudit.includes('client.rpc("list_event_registrations", { p_event_id: rehearsalEvent.id })'));
assert(liveAudit.includes('!role.rehearsalRegistrationsDenied'));
assert(liveAudit.includes('!adminEvidence.rehearsalRegistrationsAccessible'));
assert(liveAudit.includes("pilotLaunchGateBlockers(adminEvidence.launchChecks)"));
assert(liveAudit.includes('blockers.push("private_draft_public_route_not_verified_hidden")'));
assert(liveAudit.includes("eventReservationOrders(id)"));
assert(liveAudit.includes("adminSetupReadsPass(admin, selectedPilot.id)"));
assert(liveAudit.includes('blockers.push("admin_pilot_setup_reads_failed")'));
assert(liveAudit.includes("selectedPilotPublicationCutoffAt"));
assert(liveAudit.includes("publicationChecks = assessPilotPublication(pilotInput)"));
assert(liveAudit.includes("technicalReadyForOwnerReview"));
assert(liveAudit.includes('service.auth.admin.listUsers({ page, perPage: 1000 })'));
assert(liveAudit.includes('blockers.push("pilot_designated_host_not_ready")'));
assert(liveAudit.includes("latestApplicationStatus"));
const hostAccount = { id: "seina-id", email_confirmed_at: "2026-10-03T08:00:00Z" };
const hostProfile = { access_status: "active", onboarding_completed_at: "2026-10-03T09:00:00Z" };
const hostState = (overrides) => assessDesignatedHost({ account: hostAccount,
  profile: hostProfile, assignedUserId: hostAccount.id,
  latestApplicationStatus: "approved", ...overrides });
assert.equal(hostState({}).readyForPilot, true);
assert.equal(hostState({ account: null }).readyForPilot, false);
assert.equal(hostState({ account: { ...hostAccount, email_confirmed_at: null } }).readyForPilot, false);
assert.equal(hostState({ profile: { ...hostProfile, access_status: "pending" } }).readyForPilot, false);
assert.equal(hostState({ profile: { ...hostProfile, onboarding_completed_at: null } }).readyForPilot, false);
assert.equal(hostState({ assignedUserId: "someone-else" }).readyForPilot, false);
assert(!liveAudit.includes('blockers.push("public_guest_registration_closed")'));
const registrationForm = readFileSync(new URL("../components/events/event-registration-form.tsx", import.meta.url), "utf8");
const privateHostRehearsal = readFileSync(new URL("./accept-event-host-private.mjs", import.meta.url), "utf8");
const guestAccessControl = readFileSync(new URL("../components/admin/event-guest-access-control.tsx", import.meta.url), "utf8");
const adminEventsPage = readFileSync(new URL("../app/admin/events/page.tsx", import.meta.url), "utf8");
const checkout = readFileSync(new URL("../app/api/payments/paystack/initialize/route.ts", import.meta.url), "utf8");
assert(registrationForm.includes("p_quantity: 1"));
assert(!registrationForm.includes('type="number"'));
assert(checkout.includes("body.quantity!==1"));
assert(checkout.includes('event.registration_mode!=="automatic"'));
assert(checkout.includes('eventPaymentFlag?.enabled'));
assert(registrationForm.includes("automaticCheckoutOpen"));
assert(privateHostRehearsal.includes("HAT_ADMIN_TEST_EMAIL"));
assert(privateHostRehearsal.includes("primaryAdminEmail.trim().toLowerCase()"));
assert(privateHostRehearsal.includes('adminProfile.data.is_test_account, true'));
assert(guestAccessControl.includes('disabled={busy || (!enabled && !canOpen)}'));
assert(guestAccessControl.includes('enabled ? "Pause guest requests"'));
assert(guestAccessControl.includes('supabase.rpc("event_registration_end_guard_ready")'));
assert(adminEventsPage.includes('supabase.rpc("event_registration_notification_ready")'));
assert(adminEventsPage.includes('supabase.rpc("event_arrival_details_guard_ready")'));
assert(adminEventsPage.includes('supabase.rpc("event_single_seat_guard_ready")'));
assert(adminEventsPage.includes('supabase.rpc("event_capacity_guard_ready")'));
assert(adminEventsPage.includes('supabase.rpc("event_registration_end_guard_ready")'));
assert.equal(recommendPilotRelease({ blockers: ["missing_pilot"], guestRegistrationOpen: false }), "hold");
assert.equal(recommendPilotRelease({ blockers: [], guestRegistrationOpen: false }), "ready_for_human_go_no_go");
assert.equal(recommendPilotRelease({ blockers: ["missing_pilot"], guestRegistrationOpen: true }), "pause_and_review");
assert.equal(recommendPilotRelease({ blockers: [], guestRegistrationOpen: true }), "open_monitor");
const acceptedPilotLaunchChecks = pilotLaunchKeys.map((key) => ({
  key, status: "passed", verified: true, evidenceRecorded: true,
}));
assert.equal(pilotLaunchGateBlockers(acceptedPilotLaunchChecks).length, 0);
assert(!pilotLaunchKeys.includes("paystack_reconciliation"),
  "A free manual pilot must not depend on automatic card-payment acceptance");
assert(pilotLaunchKeys.includes("safety_support_privacy"));
assert(pilotLaunchKeys.includes("device_accessibility"));
assert.deepEqual(pilotLaunchGateBlockers(acceptedPilotLaunchChecks.slice(1)),
  ["launch_member_email_otp_not_accepted"]);
assert.deepEqual(pilotLaunchGateBlockers(acceptedPilotLaunchChecks.map((check) =>
  check.key === "backup_restore_rehearsal" ? { ...check, verified: false } : check)),
  ["launch_backup_restore_rehearsal_not_accepted"]);
assert.deepEqual(pilotLaunchGateBlockers(acceptedPilotLaunchChecks.map((check) =>
  check.key === "notification_delivery" ? { ...check, evidenceRecorded: false } : check)),
  ["launch_notification_delivery_not_accepted"]);
console.log("Pilot event audit rejects unrelated, incomplete, unsaleable and unstaffed events.");
