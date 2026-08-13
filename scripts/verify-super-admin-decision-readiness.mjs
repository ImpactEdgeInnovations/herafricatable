import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishable) throw new Error("Supabase public credentials are required.");

const client = createClient(url, publishable, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const unknown = randomUUID();

const operations = [
  ["member approval", "review_member", { p_decision: "approve", p_member_id: unknown, p_note: "Boundary check" }],
  ["membership intake", "set_membership_intake_mode", { p_mode: "manual_review", p_reason: "Boundary check" }],
  ["Community member approval", "review_community_membership", { p_action: "approve", p_membership_id: unknown }],
  ["Community application approval", "review_community_host_application", { p_action: "start_review", p_admin_note: null, p_application_id: unknown, p_approved_slug: null }],
  ["member event approval", "review_member_event_proposal", { p_action: "start_review", p_proposal_id: unknown, p_review_note: null }],
  ["Community event approval", "review_community_event_proposal", { p_action: "start_review", p_proposal_id: unknown, p_review_note: null }],
  ["manual registration approval", "review_manual_registration", { p_action: "approve", p_order_id: unknown, p_reviewer_note: "Boundary check" }],
  ["event-question moderation", "review_event_question_report", { p_action: "start_review", p_outcome: null, p_report_id: unknown }],
];

const results = await Promise.all(
  operations.map(async ([label, rpc, args]) => ({ label, rpc, result: await client.rpc(rpc, args) })),
);

for (const { label, rpc, result } of results) {
  assert(
    !result.error?.message?.includes("Could not find the function") &&
      !result.error?.message?.includes("schema cache"),
    `${rpc} is not deployed`,
  );
  assert(result.error, `Signed-out visitors must not perform ${label}`);
}

process.stdout.write(`${JSON.stringify({
  checks: Object.fromEntries(results.map(({ label }) => [label, "deployed and signed-out blocked"])),
  limitation: "Positive approve/decline writes require tagged Admin and member credentials",
  secretsPrinted: false,
}, null, 2)}\n`);
