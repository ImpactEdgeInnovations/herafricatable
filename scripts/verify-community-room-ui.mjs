import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const nav = read("components/member/community-local-navigation.tsx");
const room = read("app/communities/[slug]/page.tsx");
const css = read("app/community-room.css");
const gatherings = read("components/member/community-gatherings.tsx");

for (const label of ["Home", "Conversations", "Meetups", "People", "Host tools"]) {
  assert(nav.includes(`"${label}"`) || nav.includes(`>${label}<`), `Missing plain navigation label: ${label}`);
}
assert(nav.includes('aria-current={active === area.key ? "page" : undefined}'));
assert(nav.includes("{canManage ?"), "Host tools must remain role-gated");
const tabs = read("components/ui/scrollable-tabs.tsx");
assert(nav.includes("ScrollableTabs") && tabs.includes("node.scrollLeft += item.right - bounds.right"), "Selected tab must stay visible on narrow screens");
assert(tabs.includes("Show more") && tabs.includes("Show previous"), "Overflow must have visible, labelled controls");
assert(!nav.includes("scrollIntoView"), "Local tabs must not scroll the entire page");
assert(room.includes('membership_status !== "active"'), "Community membership gate must remain intact");
assert(room.includes('className="community-page community-room-page"'));
assert(room.includes('href={`/communities/${slug}?view=conversations`}'), "Retry must retain the conversation view");
assert(css.includes("overflow-x: auto") && css.includes("min-width: 0"), "Tab overflow must stay inside its container");
assert(css.includes(":focus-visible"), "Room controls require visible keyboard focus");
assert(css.includes("font-size: 1rem") && css.includes("line-height: 1.65"), "Conversations must use readable body text");
assert(gatherings.includes("Upcoming meetups"));
assert(!gatherings.includes("Spend time together, with purpose."));
console.log("Community room UI contracts passed; visual and multi-account acceptance remain separate.");
