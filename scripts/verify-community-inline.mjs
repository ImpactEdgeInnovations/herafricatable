import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const list = read("components/member/community-gatherings.tsx");
const inline = read("components/member/community-gathering-inline.tsx");
const strip = read("components/member/community-next-gathering.tsx");
const videos = read("components/member/community-video-library.tsx");
for(const token of ["window.history.pushState",'"popstate"',"initialSelection","CommunityGatheringInline",'aria-pressed={area===',"Create a gathering","Link an event"]) assert(list.includes(token), `Missing in-place contract: ${token}`);
for(const token of ["get_community_gathering_room","list_community_gathering_messages","get_community_gathering_video",'access_status !== "active"',"if (active) setData","Back to gatherings","Try again"]) assert(inline.includes(token), `Missing protected loader: ${token}`);
assert(strip.includes("timeZone:next.timezone") && strip.includes("Math.max(0,"));
assert(strip.includes('if (now === null) return null'),"Avoid countdown hydration mismatches");
assert(!strip.includes("marquee"),"Keep the event strip still and readable");
assert(read("components/member/community-gathering-room.tsx").includes("embedded = false"));
for (const token of ['"get_community_gathering_video"', "item.video.is_visible", "!item.video.admin_paused", "item.video.keep_replay", "start += 6", "setRecordings([])", "Watch & discuss", "timeZone: card.timezone", "if (!active) return", "30000", '"focus"']) {
  assert(videos.includes(token), `Missing video discovery contract: ${token}`);
}
assert(!videos.includes("youtube-nocookie") && !videos.includes("<iframe"), "Discovery must not load YouTube before a member opens and loads a video");
assert(list.includes("gatheringArea") && list.includes('next === "videos"'), "Preserve the Videos selection through share links and browser Back");
console.log("In-place Community gathering navigation, loader and countdown contracts passed.");
