import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../lib/events/zoned-datetime.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { formatEventTimeInput, parseEventTimeInput } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);

for (const deviceZone of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
  process.env.TZ = deviceZone;
  assert.equal(formatEventTimeInput("2026-10-06T15:00:00.000Z", "Africa/Nairobi"),
    "2026-10-06T18:00");
  assert.equal(parseEventTimeInput("2026-10-06T18:00", "Africa/Nairobi"),
    "2026-10-06T15:00:00.000Z");
}
assert.equal(parseEventTimeInput("2026-07-01T18:00", "America/New_York"),
  "2026-07-01T22:00:00.000Z");
assert.equal(parseEventTimeInput("2026-01-01T18:00", "America/New_York"),
  "2026-01-01T23:00:00.000Z");
assert.throws(() => parseEventTimeInput("2026-03-08T02:30", "America/New_York"),
  /does not exist/);
assert.throws(() => parseEventTimeInput("2026-02-30T18:00", "Africa/Nairobi"),
  /Invalid event time/);
assert.throws(() => parseEventTimeInput("2026-10-06T18:00", "Not/A_Timezone"));

const editor = readFileSync(new URL("../components/admin/event-manager.tsx", import.meta.url), "utf8");
const contentEditor = readFileSync(new URL("../components/admin/event-content-manager.tsx", import.meta.url), "utf8");
const hostEditor = readFileSync(new URL("../components/events/event-host-workspace.tsx", import.meta.url), "utf8");
const eventList = readFileSync(new URL("../app/events/page.tsx", import.meta.url), "utf8");
const eventDetail = readFileSync(new URL("../app/events/[slug]/page.tsx", import.meta.url), "utf8");
const pastEvents = readFileSync(new URL("../app/events/past/page.tsx", import.meta.url), "utf8");
assert(editor.includes("formatEventTimeInput(event.starts_at, event.timezone)"));
assert(editor.includes("parseEventTimeInput(form.startsAt, form.timezone)"));
assert(!editor.includes("new Date(form.startsAt).toISOString()"));
assert(contentEditor.includes("parseEventTimeInput(sessionForm.startsAt, selectedEvent.timezone)"));
assert(!contentEditor.includes("new Date(sessionForm.startsAt).toISOString()"));
assert(hostEditor.includes("parseEventTimeInput(item.starts_at, initial.timezone)"));
assert(!hostEditor.includes("device’s local timezone"));
assert(eventList.includes("timeZone: event.timezone"));
assert(eventDetail.includes('year: "numeric", timeZone: event.timezone'));
assert(pastEvents.includes('timeZone: event.timezone'));
console.log("Admin, Host and public event times stay in the event timezone across devices.");
