import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compiled = ts.transpileModule(read("lib/upcoming-countdown.ts"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { upcomingCountdown } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const now = Date.parse("2026-10-02T15:00:00Z");
const event = { city: "Nairobi", event_name: "The Founding Table", starts_at: "2026-10-06T15:00:00Z" };
assert.deepEqual(upcomingCountdown(event, now), event);
assert.equal(upcomingCountdown({ ...event, starts_at: "2026-09-13T18:36:42Z" }, now), null);
assert.equal(upcomingCountdown({ ...event, starts_at: "2026-10-02T15:00:00Z" }, now), null);
assert.equal(upcomingCountdown({ ...event, starts_at: "not-a-date" }, now), null);
assert.equal(upcomingCountdown({ ...event, event_name: " " }, now), null);
assert.equal(upcomingCountdown(null, now), null);

const home = read("app/page.tsx");
const clock = read("components/event-countdown.tsx");
const adminControl = read("components/admin/event-countdown-manager.tsx");
assert(home.includes('endpoint.searchParams.set("starts_at", `gt.${new Date().toISOString()}`)'));
assert(home.includes('publicEventUrl.searchParams.set("status", "eq.published")'));
assert(home.includes('publicEventUrl.searchParams.set("audience", "eq.public")'));
assert(home.includes("const configured = upcomingCountdown(rows[0])"));
assert(clock.includes("const activeEvent = timeLeft ? upcomingCountdown(initialEvent) : null"));
assert(!clock.includes('from("site_event_countdown")'));
assert(adminControl.includes('parseEventTimeInput(startsAt, "Africa/Nairobi")'));
assert(adminControl.includes('Date.parse(publishedAt) <= Date.now()'));
assert(adminControl.includes('.eq("status", "published")'));
assert(adminControl.includes('.eq("audience", "public")'));
assert(!clock.includes("Launch of the Africa Table Platform"));
console.log("The homepage hides past countdowns and unapproved public events.");
