import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/table-guide-event-answer.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { eventFallbackAnswer } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const event = {
  ends_at: "2026-10-10T20:00:00Z", format: "hybrid", programme: [
    { description: "Public session", starts_at: "2026-10-10T17:30:00Z", title: "Founding conversations" },
  ], registration_mode: "manual_review", slug: "the-founding-table-nairobi",
  starts_at: "2026-10-10T17:00:00Z", status: "published",
  summary: "A public event summary", timezone: "Africa/Nairobi",
  title: "The Founding Table — Nairobi", venue: { name: "The Table", city: "Nairobi", country: "Kenya" },
  online_url: "SECRET_JOINING_LINK", private_seat: "SECRET_SEAT", safety_phone: "SECRET_PHONE",
};
const answer = (currentEvent, requestedEventSlug = event.slug, upcomingEvents = []) =>
  eventFallbackAnswer({ firstName: "Amina", currentEvent, requestedEventSlug, upcomingEvents });

const published = answer(event);
assert.match(published, /Amina, The Founding Table/);
assert.match(published, /Founding conversations/);
assert.match(published, /request a place/);
for (const secret of [event.online_url, event.private_seat, event.safety_phone])
  assert(!published.includes(secret), "Nia must not include private event data in her deterministic answer");

const missingProgramme = answer({ ...event, programme: [], registration_mode: "closed", venue: null });
assert.match(missingProgramme, /programme has not been published/);
assert.match(missingProgramme, /Registration is closed/);
assert.match(missingProgramme, /joining details privately/);
assert(!missingProgramme.includes("request a place"));

const ended = answer({ ...event, status: "completed" });
assert.match(ended, /was held/);
assert.match(ended, /This event has ended/);
assert(!ended.includes("request a place"));

const unavailable = answer(null, "private-draft-slug", [{ title: "Another public event" }]);
assert.match(unavailable, /cannot see published details/);
assert(!unavailable.includes("Another public event"), "An inaccessible slug must not be answered as another event");
assert(!unavailable.includes("private-draft-slug"), "An inaccessible slug must not be echoed");

assert.match(answer(null, null, [{ title: "Another public event" }]), /Another public event/);
assert.match(answer({ ...event, timezone: "Invalid/Time_Zone" }), /The Founding Table/);

const route = readFileSync(new URL("../app/api/table-guide/route.ts", import.meta.url), "utf8");
assert(route.includes("safeFallback = platformAnswer(category, context, eventSlug)"));
assert(route.includes('if (eventSlug && !currentEvent && category === "events")'),
  "Inaccessible event links must be answered before any provider request");
assert(route.includes("answer: safeFallback") && route.includes("limited: true"),
  "Provider failure must return the permission-filtered deterministic answer");
assert(route.includes('.in("status", ["published", "completed"])'));
assert(route.includes('.eq("status", "published")'));
assert(!route.includes('.from("event_private_details")') && !route.includes('.from("event_safety_contacts")'));
console.log("Nia event fallback handles published facts, absent details, closed registration, private slugs and provider failure without private data.");
