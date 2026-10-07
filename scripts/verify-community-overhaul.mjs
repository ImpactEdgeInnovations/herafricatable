import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const panel = read("components/member/community-about-panel.tsx");
const room = read("app/communities/[slug]/page.tsx");
const host = read("components/member/community-host-section.tsx");
const roster = read("components/member/community-member-roster.tsx");
const css = read("app/community-overhaul.css");
assert(panel.includes("showModal()") && panel.includes("onClose=") && panel.includes("trigger.current?.focus()"), "About must be modal and restore focus");
assert(panel.includes('aria-labelledby="community-about-title"'));
assert(!room.includes('href={`/communities/${slug}/about`}>About'), "Signed-in About must not redirect");
assert(room.includes("<CommunityAboutPanel"));
assert(!room.includes('className="community-people-intro"'), "People must not repeat introductions");
assert(roster.includes("CommunityAvatar") && roster.includes('membership_role === "owner" ? "Host"'));
assert(host.includes('addEventListener("hashchange"') && host.includes('removeEventListener("hashchange"'), "Anchors must reveal collapsed Host tools and clean up");
assert(css.includes('a[aria-current="page"] { color: var(--room-accent); background: transparent;'));
function luminance(hex) { const parts = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722; }
function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
for (const [foreground, background] of [["64172a", "ffffff"], ["655e60", "ffffff"], ["ffffff", "64172a"], ["655e60", "e8e3e1"]]) assert(contrast(foreground, background) >= 4.5, `Insufficient text contrast: ${foreground}/${background}`);
console.log("Community overhaul source and palette contracts passed; deployed visual/device acceptance is separate.");
