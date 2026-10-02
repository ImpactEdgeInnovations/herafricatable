import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const adminPage = readFileSync(new URL("../app/admin/events/page.tsx", import.meta.url), "utf8");
assert(adminPage.includes('supabase.from("event_staff_scopes").select("event_id,user_id")'));
assert(adminPage.includes('supabase.from("user_roles").select("user_id,role")'));
assert(adminPage.includes("doorStaffActive:"));

const source = readFileSync(new URL("../lib/event-pilot-readiness.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { eventPilotReadiness } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const now = new Date("2026-09-24T12:00:00.000Z");
const ready = {
  event: {
    capacity: 25,
    ends_at: "2026-10-01T16:00:00.000Z",
    format: "hybrid",
    registration_mode: "manual_review",
    starts_at: "2026-10-01T13:00:00.000Z",
    status: "draft",
    summary: "A carefully hosted gathering for useful conversations and trusted introductions.",
    venues: { address_line: "Mbaazi Road", city: "Nairobi", country: "Kenya", map_url: null, name: "The Table" },
  },
  doorStaffActive: true,
  hasSafetyContact: true,
  hostActive: true,
  hostDraftStatus: "approved",
  onlineLinkReady: true,
  tickets: [{ inventory_quantity: 25, price_minor: 0, status: "on_sale" }],
};
const steps = (input) => eventPilotReadiness(input, now);
assert.equal(steps(ready).length, 7);
assert(steps(ready).every((step) => step.ready));
const status = (input, label) => steps(input).find((step) => step.label === label)?.ready;
assert.equal(status({ ...ready, onlineLinkReady: false }, "Place and joining details"), false);
assert.equal(status({ ...ready, event: { ...ready.event, venues: null } }, "Place and joining details"), false);
assert.equal(status({ ...ready, event: { ...ready.event, venues: { ...ready.event.venues, address_line: null } } }, "Place and joining details"), false);
assert.equal(status({ ...ready, event: { ...ready.event, registration_mode: "automatic" } }, "Free place with private review"), false);
assert.equal(status({ ...ready, tickets: [{ inventory_quantity: 25, price_minor: 0, status: "draft" }] }, "Free place with private review"), false);
assert.equal(status({ ...ready, tickets: [{ inventory_quantity: 25, price_minor: 500, status: "draft" }] }, "Free place with private review"), false);
assert.equal(status({ ...ready, hostActive: false }, "Event Host"), false);
assert.equal(status({ ...ready, hostDraftStatus: "submitted" }, "Host content reviewed"), false);
assert.equal(status({ ...ready, hasSafetyContact: false }, "On-the-day safety contact"), false);
assert.equal(status({ ...ready, doorStaffActive: false }, "Guest arrival lead"), false);
assert.equal(status({ ...ready, event: { ...ready.event, starts_at: "2026-09-25T13:00:00.000Z" } }, "Event basics"), false);
assert.equal(status({ ...ready, event: { ...ready.event, status: "published", starts_at: "2026-09-25T13:00:00.000Z" } }, "Event basics"), true);
console.log("Event pilot setup checks verified across arrival, on-sale free places, Host, safety, staff and timing states.");
