import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

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
const keyboardActivation = floating.match(/onClick=\{(event => \{ if \(event\.detail === 0\)[^\n]+)\}/)?.[1];
assert(keyboardActivation, "Nia needs native keyboard and assistive-click activation");
let expanded = false;
const activate = new Function('setOpen','event',`(${keyboardActivation})(event);`);
const setOpen = update => { expanded = typeof update === 'function' ? update(expanded) : update; };
activate(setOpen,{detail:0}); assert.equal(expanded,true,'Keyboard click must open Nia');
activate(setOpen,{detail:1}); assert.equal(expanded,true,'Pointer-generated click must not double-toggle pointer-up');
activate(setOpen,{detail:0}); assert.equal(expanded,false,'Keyboard click must also close Nia');
let restoredFocus=false;
const closeBody=floating.match(/function closeGuide\(\) \{([\s\S]*?)\n  \}/)?.[1];
assert(closeBody);
new Function('setOpen','launcher',closeBody)(setOpen,{current:{focus(){restoredFocus=true;}}});
assert.equal(expanded,false); assert.equal(restoredFocus,true);
for(const contract of ['aria-expanded={open}','id="floating-table-guide-panel"','event.key === "Escape"','cancelAnimationFrame(frame)']) assert(floating.includes(contract),contract);
const dockFunctions = ts.transpileModule(floating.slice(floating.indexOf('function clampPosition('), floating.indexOf('function quotaLabel(')), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const dockAt = (width,height,actionTop,controls=[]) => new Function('window','document','DOCK_SIZE','EDGE_GAP',`${dockFunctions};return defaultPosition();`)(
  {innerWidth:width,innerHeight:height},
  {querySelector:()=>actionTop === null ? null : {getBoundingClientRect:()=>({top:actionTop})},querySelectorAll:()=>controls.map(rect=>({getBoundingClientRect:()=>rect}))},
  64,16,
);
assert.equal(dockAt(320,740,474).y + 64,458, 'Nia must rest above Host save buttons with a 16px gap');
assert.equal(dockAt(390,844,640).y + 64,624);
assert.equal(dockAt(390,844,null).y,676, 'Other pages retain the existing resting position');
assert.equal(dockAt(1200,900,640).y,732, 'Desktop positions remain unchanged');
assert.equal(dockAt(320,400,30).y,16, 'Positions stay inside the viewport');
const invitation = {width:130,height:44,left:170,right:300,top:400,bottom:444};
assert.equal(dockAt(320,740,474,[invitation]).y,320, 'Moving above the footer must not obscure the invitation button');
assert.equal(dockAt(320,740,474,[{...invitation,left:0,right:130}]).y,394, 'Controls outside the dock lane must not displace it');
assert(floating.includes('hostObserver?.disconnect()') && floating.includes('window.removeEventListener("scroll", keepInView)'));
for (const contract of [
  "Reset position",
  "Hide today",
  "Dock ",
  'pathname === "/guide"',
  "remaining <= 5",
  "eventSlug: pathname.match",
  "What is on the published programme?",
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
  "if (!apiKey || !safetySalt)",
  "limited: true",
  "currentEventResult.error ? null",
  '.in("status", ["published", "completed"])',
  '.eq("status", "published")',
]) {
  assert(api.includes(contract), `Nia response API is missing: ${contract}`);
}
const eventPage = read("app/events/[slug]/page.tsx");
const eventAnswer = read("lib/table-guide-event-answer.ts");
assert(
  eventAnswer.includes("I cannot see your private seat, pass or joining link"),
  "Nia's event answer must explicitly exclude private passes and joining details",
);
assert(
  eventPage.includes("<FloatingTableGuide") && eventPage.includes("get_my_table_guide_access"),
  "Published event pages must offer Nia only to eligible signed-in members",
);
assert(
  !api.includes('.from("event_private_details")') &&
    !api.includes('.from("event_safety_contacts")'),
  "Nia event context must not read private joining or safety details",
);

const feedback = read(
  "supabase/migrations/20260813130000_table_guide_experience_feedback.sql",
);
const referralCategory = read(
  "supabase/migrations/20260925100000_table_guide_referral_category.sql",
);
assert(
  referralCategory.includes("table_guide_usage_category_check") &&
    referralCategory.includes("table_guide_feedback_category_check") &&
    referralCategory.includes("'referrals'") &&
    referralCategory.includes("record_table_guide_usage") &&
    referralCategory.includes("record_table_guide_feedback"),
  "Nia referral answers and feedback must use an accepted database category",
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
