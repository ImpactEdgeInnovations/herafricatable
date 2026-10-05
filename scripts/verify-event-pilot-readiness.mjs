import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const adminPage = readFileSync(new URL("../app/admin/events/page.tsx", import.meta.url), "utf8");
assert(adminPage.includes('supabase.from("event_staff_scopes").select("event_id,user_id")'));
assert(adminPage.includes('supabase.from("user_roles").select("user_id,role,expires_at")'));
assert(adminPage.includes('supabase.from("event_hosts").select("event_id,user_id,status")'));
assert(adminPage.includes('supabase.from("orders").select("event_id,status,order_items(ticket_type_id,quantity)"'));
assert(adminPage.includes('pilotSources[5].count === (pilotSources[5].data?.length ?? 0)'));
assert(adminPage.includes('activeProfileIds.has(row.user_id)'));
assert(adminPage.includes("doorStaffActive:"));
assert(adminPage.includes("eventIds.includes(requestedEventId)"));
assert(adminPage.includes("selectedEventId={selectedEventId}"));
assert(adminPage.includes("&event=${encodeURIComponent(selectedEventId)}"));
assert(adminPage.includes('view === "host" && eventIds.length'));
assert(adminPage.includes('hostTicketResult.count === (hostTicketResult.data?.length ?? 0)'));
assert(adminPage.includes('const detailEventIds = view === "registrations" || view === "arrival"'));
assert(adminPage.includes('[selectedEventId ?? eventIds[0]].filter'));
assert(adminPage.includes('detailEventIds.map((eventId) => supabase.rpc("list_event_checkins"'));
assert(adminPage.includes('.in("event_id", detailEventIds)'));
assert(adminPage.includes('role === "super_admin" && ["overview", "proposals", "host"].includes(view)'));
assert(adminPage.includes('supabase.rpc("list_event_work_counts")'));
const countMigration = readFileSync(new URL("../supabase/migrations/20261005090000_event_admin_work_counts.sql", import.meta.url), "utf8");
assert(countMigration.includes('where public.can_manage_event(event.id)'));
assert(countMigration.includes("membership.status in ('confirmed', 'attended')"));
assert(countMigration.includes('grant execute on function public.list_event_work_counts() to authenticated'));

const linkSource = readFileSync(new URL("../lib/events/admin-event-link.ts", import.meta.url), "utf8");
const linkCompiled = ts.transpileModule(linkSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { eventToolHref } = await import(`data:text/javascript;base64,${Buffer.from(linkCompiled).toString("base64")}`);
assert.equal(eventToolHref("/admin/events?view=edit", "pilot-123"), "/admin/events?view=edit&event=pilot-123");
assert.equal(eventToolHref("/admin/events?view=host#review", "pilot-123"), "/admin/events?view=host&event=pilot-123#review");
assert.equal(eventToolHref("/admin/operations?area=event-work#event-work", "pilot-123"), "/admin/operations?area=event-work#event-work");

for (const path of ["event-manager.tsx", "registration-manager.tsx", "event-checkin-console.tsx", "event-host-review-manager.tsx", "event-command-centre.tsx"]) {
  const view = readFileSync(new URL(`../components/admin/${path}`, import.meta.url), "utf8");
  assert(view.includes("selectedEventId"), `${path} must select the event from an Admin deep link`);
}
const eventOverview = readFileSync(new URL("../components/admin/event-command-centre.tsx", import.meta.url), "utf8");
assert(eventOverview.includes('router.replace(eventToolHref("/admin/events?view=overview", item.id)'));
assert(eventOverview.includes('eventToolHref("/admin/events?view=edit", event.id)'));
assert(eventOverview.includes("hostDraftPublicationCutoff(event.starts_at)"));
assert(eventOverview.includes("Publication cutoff:"));
assert(eventOverview.includes('href="/admin/release"'));
const eventManager = readFileSync(new URL("../components/admin/event-manager.tsx", import.meta.url), "utf8");
assert(eventManager.includes("initialEvents.find((event) => event.id === selectedEventId)"));

const source = readFileSync(new URL("../lib/event-pilot-readiness.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { eventPilotReadiness } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const publicationSource = readFileSync(new URL("../lib/events/host-publication-window.ts", import.meta.url), "utf8");
const publicationCompiled = ts.transpileModule(publicationSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { hostDraftPublicationCutoff, hostDraftPublicationWindowOpen } = await import(
  `data:text/javascript;base64,${Buffer.from(publicationCompiled).toString("base64")}`
);
const startsAt = "2026-10-06T15:00:00.000Z";
assert.equal(hostDraftPublicationCutoff(startsAt).toISOString(), "2026-10-04T15:00:00.000Z");
assert.equal(hostDraftPublicationWindowOpen(startsAt, Date.parse("2026-10-04T14:59:59.999Z")), true);
assert.equal(hostDraftPublicationWindowOpen(startsAt, Date.parse("2026-10-04T15:00:00.000Z")), false);
assert.equal(hostDraftPublicationWindowOpen(startsAt, Date.parse("2026-10-04T15:00:00.001Z")), false);
assert.equal(hostDraftPublicationWindowOpen("invalid date"), false);
const hostReview = readFileSync(new URL("../components/admin/event-host-review-manager.tsx", import.meta.url), "utf8");
assert(hostReview.includes("!hostDraftPublicationWindowOpen(item.starts_at)"));
assert(hostReview.includes("Move the event date"));
assert(hostReview.includes("!ticketEventIds.includes(item.event_id)"));
assert(hostReview.includes("registration_mode === \"closed\""));
assert(hostReview.includes("exactArrivalReady(event)"));
assert(hostReview.includes('href="/sign-in?mode=apply"'));
assert(hostReview.includes("Once approved and set up, enter the same email here"));

const arrivalSource = readFileSync(new URL("../lib/events/host-publication-check.ts", import.meta.url), "utf8");
const arrivalCompiled = ts.transpileModule(arrivalSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { exactArrivalReady } = await import(`data:text/javascript;base64,${Buffer.from(arrivalCompiled).toString("base64")}`);
const venue = { name: "Geco Cafe", city: "Nairobi", country: "Kenya", address_line: "Mbaazi Rd, Lavington", map_url: null };
assert.equal(exactArrivalReady({ format: "in_person", venues: venue }), true);
assert.equal(exactArrivalReady({ format: "in_person", venues: { ...venue, address_line: " " } }), false);
assert.equal(exactArrivalReady({ format: "hybrid", venues: { ...venue, address_line: null, map_url: "https://example.com/map" } }), true);
assert.equal(exactArrivalReady({ format: "virtual", venues: null }), true);
assert.equal(exactArrivalReady(undefined), false);

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
  orders: [],
  tickets: [{ id: "free-place", inventory_quantity: 25, price_minor: 0, sales_start_at: null, sales_end_at: null, status: "on_sale" }],
};
const steps = (input) => eventPilotReadiness(input, now);
assert.equal(steps(ready).length, 8);
assert(steps(ready).every((step) => step.ready));
const status = (input, label) => steps(input).find((step) => step.label === label)?.ready;
const step = (input, label) => steps(input).find((candidate) => candidate.label === label);
assert.equal(status({ ...ready, onlineLinkReady: false }, "Place and joining details"), false);
assert.equal(status({ ...ready, event: { ...ready.event, venues: null } }, "Place and joining details"), false);
assert.equal(status({ ...ready, event: { ...ready.event, venues: { ...ready.event.venues, address_line: null } } }, "Place and joining details"), false);
assert.equal(status({ ...ready, event: { ...ready.event, registration_mode: "automatic" } }, "Free place with private review"), false);
assert.equal(step({ ...ready, event: { ...ready.event, registration_mode: "closed" } }, "Free place with private review").href, "/admin/events?view=edit");
assert.match(step({ ...ready, event: { ...ready.event, registration_mode: "closed" } }, "Free place with private review").guidance, /Publishing with registration closed/);
assert.equal(status({ ...ready, tickets: [{ ...ready.tickets[0], status: "draft" }] }, "Free place with private review"), false);
assert.equal(step({ ...ready, tickets: [{ ...ready.tickets[0], status: "draft" }] }, "Free place with private review").href, "/admin/events?view=registrations");
assert.equal(status({ ...ready, tickets: [{ ...ready.tickets[0], price_minor: 500 }] }, "Free place with private review"), false);
assert.equal(status({ ...ready, tickets: [{ ...ready.tickets[0], sales_start_at: "2026-09-25T12:00:00Z" }] }, "Free place with private review"), false);
assert.equal(status({ ...ready, tickets: [{ ...ready.tickets[0], sales_end_at: "2026-09-24T11:59:00Z" }] }, "Free place with private review"), false);
const reserved = [{ event_id: "event", status: "approved", order_items: [{ ticket_type_id: "free-place", quantity: 25 }] }];
assert.equal(status({ ...ready, orders: reserved }, "Free place with private review"), false);
assert.equal(status({ ...ready, orders: reserved }, "Places remaining"), false);
assert.equal(status({ ...ready, orders: [{ ...reserved[0], status: "refunded" }] }, "Free place with private review"), true);
assert.equal(status({ ...ready, hostActive: false }, "Event Host"), false);
assert.match(step({ ...ready, hostActive: false }, "Event Host").guidance, /request membership and finish her profile/);
assert.equal(status({ ...ready, hostDraftStatus: "submitted" }, "Host content reviewed"), false);
assert.equal(status({ ...ready, hasSafetyContact: false }, "On-the-day safety contact"), false);
assert.equal(status({ ...ready, doorStaffActive: false }, "Guest arrival lead"), false);
assert.equal(status({ ...ready, event: { ...ready.event, starts_at: "2026-09-25T13:00:00.000Z" } }, "Event basics"), false);
assert.match(step({ ...ready, event: { ...ready.event, starts_at: "2026-09-25T13:00:00.000Z" } }, "Event basics").guidance, /Move this private draft/);
assert.match(step({ ...ready, event: { ...ready.event, summary: "Too short" } }, "Event basics").guidance, /introduction/);
assert.match(step({ ...ready, event: { ...ready.event, capacity: null } }, "Event basics").guidance, /number of places/);
assert.equal(status({ ...ready, event: { ...ready.event, status: "published", starts_at: "2026-09-25T13:00:00.000Z" } }, "Event basics"), true);
console.log("Event pilot setup checks verified across arrival, ticket windows and inventory, Host, safety, staff and timing states.");
