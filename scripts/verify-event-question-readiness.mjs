import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishable) {
  throw new Error("Supabase public credentials are required.");
}

const client = createClient(url, publishable, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assertFunctionExists(result, name) {
  assert(
    !result.error?.message?.includes("Could not find the function") &&
      !result.error?.message?.includes("schema cache"),
    `${name} is not available through the production API`,
  );
}

function assertRelationExists(result, name) {
  assert(
    !result.error?.message?.includes("Could not find the table") &&
      !result.error?.message?.includes("schema cache"),
    `${name} is not available through the production API`,
  );
}

const unknownEvent = randomUUID();
const unknownQuestion = randomUUID();
const [
  questions,
  supports,
  reports,
  signedOutList,
  signedOutSubmit,
  signedOutSupport,
  signedOutAnswer,
  signedOutReport,
  signedOutAdminList,
] = await Promise.all([
  client.from("event_questions").select("id", { count: "exact", head: true }),
  client.from("event_question_supports").select("question_id", { count: "exact", head: true }),
  client.from("event_question_reports").select("id", { count: "exact", head: true }),
  client.rpc("list_event_questions", { p_event_id: unknownEvent }),
  client.rpc("submit_event_question", { p_body: "This must never be saved.", p_event_id: unknownEvent }),
  client.rpc("toggle_event_question_support", { p_question_id: unknownQuestion }),
  client.rpc("answer_event_question", { p_answer: "No", p_question_id: unknownQuestion }),
  client.rpc("report_event_question", { p_details: "Signed-out boundary check.", p_question_id: unknownQuestion, p_reason: "safety" }),
  client.rpc("list_event_question_reports"),
]);

assertRelationExists(questions, "event_questions");
assertRelationExists(supports, "event_question_supports");
assertRelationExists(reports, "event_question_reports");
assertFunctionExists(signedOutList, "list_event_questions");
assertFunctionExists(signedOutSubmit, "submit_event_question");
assertFunctionExists(signedOutSupport, "toggle_event_question_support");
assertFunctionExists(signedOutAnswer, "answer_event_question");
assertFunctionExists(signedOutReport, "report_event_question");
assertFunctionExists(signedOutAdminList, "list_event_question_reports");

for (const [name, result] of [
  ["list", signedOutList],
  ["submit", signedOutSubmit],
  ["support", signedOutSupport],
  ["answer", signedOutAnswer],
  ["report", signedOutReport],
  ["admin list", signedOutAdminList],
]) {
  assert(result.error, `Signed-out visitors must not ${name} event questions`);
}

process.stdout.write(`${JSON.stringify({
  checks: {
    adminReportBoundary: "private",
    answerBoundary: "Host or Admin only",
    eventQuestionFunctions: "deployed",
    questionProjection: questions.error ? "private" : "available",
    reportProjection: "private",
    signedOutWrites: "blocked",
  },
  secretsPrinted: false,
}, null, 2)}\n`);
