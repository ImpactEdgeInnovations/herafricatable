import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("app/member-readability.css");
const layout = read("app/layout.tsx");
const today = read("components/member/your-table-today.tsx");
const home = read("app/home/page.tsx");
assert(layout.indexOf('./member-readability.css') > layout.indexOf('./community-room.css'));
assert(today.includes('id="table-today-title">Your Table today'));
assert(today.includes('aria-labelledby="table-today-title"'));
assert(today.includes('const suggestions = [person, community, action]'), "Keep the three useful suggestions");
assert(today.includes('href={suggestion.href}'), "Suggestion actions must retain their real destination");
assert(!today.includes("table-today-number"), "Remove decorative numbering, not the actual suggestions");
assert(home.includes("Getting started, invitations and account details."));
assert(!home.includes("Your main Home page stays"), "Avoid explaining the interface to the member");
for (const scope of [".member-home-page", ".community-page", ".network-page", ".events-page", ".community-room-page"]) {
  assert(css.includes(scope));
}
assert(!/\b(?:body|html|:root)\s*\{/.test(css), "No global landing/Admin typography changes");
assert(!/display:\s*none|visibility:\s*hidden|overflow:\s*hidden/.test(css), "Do not hide controls or clip content to reduce density");
assert(css.includes("font-size: 1rem") && css.includes("min-height: 44px"));
assert(css.includes(":focus-visible") && css.includes("overflow-wrap: anywhere"));
assert(css.includes("grid-template-columns: minmax(0, 1fr)"), "Mobile suggestions should stack");
console.log("Member readability source contracts passed; populated-room visual acceptance remains separate.");
