import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const migration = read("supabase/migrations/20260812170000_community_gathering_rooms.sql");
const room = read("components/member/community-gathering-room.tsx");
const navigation = read("components/member/community-local-navigation.tsx");
const page = read("app/communities/[slug]/gatherings/[eventSlug]/page.tsx");

for (const contract of [
  "can_access_community_gathering",
  "set_community_gathering_rsvp",
  "send_community_gathering_message",
  "submit_community_gathering_question",
  "report_community_gathering_message",
  "review_community_gathering_report",
  "save_community_gathering_settings",
  "publish_community_gathering_recap",
  "event.starts_at - interval '30 minutes'",
  "event.ends_at + interval '24 hours'",
  "rsvp.status = 'going'",
  "not public.is_blocked_pair(auth.uid()",
  "event.ends_at + interval '1 hour'",
  "Please pause for a moment before sending another message",
]) assert(migration.includes(contract), `Gathering migration must include ${contract}`);

assert(
  migration.includes("meeting_url is null or meeting_url ~ '^https://'") &&
    migration.includes("then room.meeting_url else null end"),
  "Meeting links must be validated and recipient-gated",
);
assert(
  navigation.includes('"overview"') && navigation.includes('"conversations"') &&
    navigation.includes('"gatherings"') && navigation.includes('"people"'),
  "Community local navigation must keep four calm primary areas",
);
assert(page.includes("membership_status !== \"active\"") && page.includes("get_community_gathering_room"),
  "Gathering route must require active Community membership and use its protected RPC");
for (const contract of [
  "Let other attendees see me",
  "Questions for the room",
  "Live conversation",
  "Report this message",
  "Host settings",
  "Publish to Conversations",
  'target="_blank"',
]) assert(room.includes(contract), `Gathering room UI must include ${contract}`);

console.log("Community gathering contracts verified.");
