import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/events/booking-availability.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { assessEventBookingAvailability } = await import(
  `data:text/javascript,${encodeURIComponent(compiled)}`
);
const now = new Date("2026-10-01T12:00:00Z");
const tickets = [
  { id: "free", name: "Free", description: null, currency: "KES", price_minor: 0,
    inventory_quantity: 1, sales_start_at: null, sales_end_at: null },
  { id: "supporter", name: "Supporter", description: null, currency: "KES", price_minor: 500,
    inventory_quantity: 10, sales_start_at: null, sales_end_at: null },
];
const order = (status, ticket_type_id, quantity = 1) => ({
  status, order_items: [{ ticket_type_id, quantity }],
});
const assess = (orders = [], capacity = 2, choices = tickets) =>
  assessEventBookingAvailability(choices, orders, capacity, now);

assert.equal(assess().eventFull, false);
assert.deepEqual(assess().tickets.map((ticket) => ticket.bookingState), ["available", "available"]);
assert.deepEqual(assess([order("pending_review", "free")]).tickets.map((ticket) => ticket.bookingState),
  ["ticket_full", "available"]);
assert.equal(assess([order("pending_review", "free"), order("pending_payment", "supporter")]).eventFull, true);
assert.deepEqual(assess([order("pending_review", "free"), order("pending_payment", "supporter")])
  .tickets.map((ticket) => ticket.bookingState), ["event_full", "event_full"]);
assert.equal(assess([order("cancelled", "free"), order("refunded", "supporter")]).eventFull, false);
assert.equal(assess([order("cancelled", "free")]).tickets[0].bookingState, "available");
assert.equal(assess([order("pending_review", "free")], null).eventFull, false);
assert.equal(assess([], 2, [{ ...tickets[0], sales_start_at: "2026-10-02T12:00:00Z" }])
  .tickets[0].bookingState, "not_open");
assert.equal(assess([], 2, [{ ...tickets[0], sales_end_at: "2026-09-30T12:00:00Z" }])
  .tickets[0].bookingState, "ended");
assert.throws(() => assess([order("pending_review", "free", -1)]), /quantity is invalid/);

const form = readFileSync(new URL("../components/events/event-registration-form.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../app/events/[slug]/page.tsx", import.meta.url), "utf8");
const register = readFileSync(new URL("../app/events/[slug]/register/page.tsx", import.meta.url), "utf8");
assert(form.includes('disabled={item.bookingState !== "available"}'));
assert(form.includes("We could not check places right now") && form.includes("Check again"));
assert(detail.includes("loadEventBookingAvailability(event.id, event.capacity"));
assert(register.includes("loadEventBookingAvailability(event.id, event.capacity"));
console.log("Event booking availability respects shared capacity, ticket stock and sale windows.");
