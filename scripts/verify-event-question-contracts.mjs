import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const migration = read("supabase/migrations/20260813110000_event_host_questions.sql");
const questions = read("components/events/event-questions.tsx");
const eventPage = read("app/events/[slug]/page.tsx");
const moderation = read("components/admin/community-moderation.tsx");

for (const contract of [
  "can_manage_event_questions",
  "list_event_questions",
  "submit_event_question",
  "toggle_event_question_support",
  "answer_event_question",
  "hide_event_question",
  "report_event_question",
  "list_event_question_reports",
  "review_event_question_report",
  "public.is_active_member(auth.uid())",
  "public.can_view_event",
  "public.is_blocked_pair",
  "interval '1 hour'",
  "enqueue_notification",
  "audit_events",
]) assert(migration.includes(contract), `Event question migration must include ${contract}`);

for (const contract of [
  "Questions for the Host",
  "I’d like this answered",
  "Report this question privately",
  "Host answer",
  "Open Gathering room",
  "Do not include phone numbers",
]) assert(questions.includes(contract), `Event question UI must include ${contract}`);

assert(eventPage.includes("useCommunityGathering") && eventPage.includes("list_event_questions"),
  "Event pages must keep Community Gathering conversation unified and provide standalone Q&A");
assert(moderation.includes('content_type === "event_question"') && moderation.includes("review_event_question_report"),
  "Reported event questions must enter the bounded Admin safety queue");

console.log("Event question contracts verified.");
