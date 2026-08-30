import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const auth = read("components/auth/auth-panel.tsx");
for (const contract of [
  "I’m already a member",
  "I’m new here",
  "Welcome back",
  "Begin your request",
  "Receive our decision",
]) {
  assert(auth.includes(contract), `Sign-in journey is missing: ${contract}`);
}
assert(
  !auth.includes("when your seat is ready"),
  "The sign-in journey must not use ambiguous seat-ready wording",
);

const session = read("lib/table-guide-session.ts");
for (const contract of [
  "window.sessionStorage",
  "slice(-12)",
  "clearGuideSession",
  "href.startsWith(\"/\")",
]) {
  assert(session.includes(contract), `Nia session boundary is missing: ${contract}`);
}
assert(
  !session.includes("window.localStorage"),
  "Nia conversations must not persist beyond the browser session",
);

for (const component of [
  "components/member/floating-table-guide.tsx",
  "components/member/table-guide.tsx",
]) {
  const source = read(component);
  for (const contract of [
    "loadGuideSession",
    "saveGuideSession",
    "GuideResultCards",
    "GuideFeedback",
    "suggestions",
  ]) {
    assert(source.includes(contract), `${component} is missing: ${contract}`);
  }
}

const floating = read("components/member/floating-table-guide.tsx");
for (const contract of [
  "Reset position",
  "Hide today",
  "Dock ",
  'pathname === "/guide"',
  "remaining <= 5",
]) {
  assert(floating.includes(contract), `Floating Nia is missing: ${contract}`);
}

const api = read("app/api/table-guide/route.ts");
for (const contract of [
  "suggestionsFor",
  "GUIDE_TOOLS",
  "search_visible_members",
  "search_visible_communities",
  "search_upcoming_events",
  "safeToolResult",
  "suggestionsFromTool",
  "Draft — review before using:",
  "tool_choice: \"auto\"",
  "parallel_tool_calls: false",
  'kind: "member"',
  'kind: "community"',
  'kind: "event"',
  "user_id: item.user_id",
  "untrusted reference material",
]) {
  assert(api.includes(contract), `Nia response API is missing: ${contract}`);
}

const feedback = read(
  "supabase/migrations/20260813130000_table_guide_experience_feedback.sql",
);
for (const contract of [
  "table_guide_feedback",
  "record_table_guide_feedback",
  "get_table_guide_feedback_admin",
  "save_table_guide_suggestion_feedback",
  "Approved membership required",
  "Feedback limit reached",
  "No member question, answer or result content is stored",
]) {
  assert(feedback.includes(contract), `Nia feedback boundary is missing: ${contract}`);
}
assert(
  read("components/member/guide-result-cards.tsx").includes("Not for me"),
  "Nia result cards must let members dismiss irrelevant suggestions",
);
for (const forbidden of ["prompt text", "response text", "message_body"]) {
  assert(
    !feedback.toLowerCase().includes(forbidden),
    `Nia feedback must not store ${forbidden}`,
  );
}

console.log(
  "Sign-in clarity and Nia experience contracts passed: separate member intent, shared session-only conversation, inline results, quiet controls, usefulness feedback and privacy boundaries.",
);
