import assert from "node:assert/strict";
import { assessPilotEvent } from "./lib/assess-pilot-event.mjs";

const now = new Date("2026-09-27T12:00:00Z");
const ready = {
  event: {
    audience: "public", capacity: 20, ends_at: "2026-10-10T20:00:00Z",
    format: "hybrid", registration_mode: "manual_review", starts_at: "2026-10-10T17:00:00Z",
    status: "published", summary: "A hosted Nairobi gathering for trusted introductions and useful conversations.",
    timezone: "Africa/Nairobi",
  },
  tickets: [{ inventory_quantity: 20, price_minor: 0, sales_start_at: null,
    sales_end_at: null, status: "on_sale" }],
  host: { status: "active" }, hostProfile: { access_status: "active" },
  workspace: { status: "approved" }, safetyContact: { event_id: "pilot" },
  onlineLink: "https://meet.example.test/private", venue: { name: "The Table", city: "Nairobi", country: "Kenya" },
  doorStaffActive: true,
};
const checks = (input) => assessPilotEvent(input, now);
assert(Object.values(checks(ready)).every(Boolean));
assert.equal(checks({ ...ready, event: { ...ready.event, audience: "community" } }).publicAndPublished, false);
assert.equal(checks({ ...ready, event: { ...ready.event, status: "draft" } }).publicAndPublished, false);
assert.equal(checks({ ...ready, event: { ...ready.event, capacity: null } }).basics, false);
assert.equal(checks({ ...ready, event: { ...ready.event, starts_at: "2026-09-26T17:00:00Z" } }).basics, false);
assert.equal(checks({ ...ready, onlineLink: "" }).placeReady, false);
assert.equal(checks({ ...ready, venue: null }).placeReady, false);
assert.equal(checks({ ...ready, tickets: [{ ...ready.tickets[0], status: "draft" }] }).freeManualTicket, false);
assert.equal(checks({ ...ready, tickets: [{ ...ready.tickets[0], sales_start_at: "2026-10-11T00:00:00Z" }] }).freeManualTicket, false);
assert.equal(checks({ ...ready, tickets: [{ ...ready.tickets[0], price_minor: 100 }] }).freeManualTicket, false);
assert.equal(checks({ ...ready, hostProfile: { access_status: "suspended" } }).hostReady, false);
assert.equal(checks({ ...ready, workspace: { status: "submitted" } }).hostContentApproved, false);
assert.equal(checks({ ...ready, safetyContact: null }).safetyContactReady, false);
assert.equal(checks({ ...ready, doorStaffActive: false }).doorStaffAssigned, false);
console.log("Pilot event audit rejects unrelated, incomplete, unsaleable and unstaffed events.");
