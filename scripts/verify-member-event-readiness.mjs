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
    !result.error?.message?.includes("Could not find the function"),
    `${name} is not available through the production API`,
  );
  assert(
    !result.error?.message?.includes("schema cache"),
    `${name} has not reached the production API schema cache`,
  );
}

function assertRelationExists(result, name) {
  assert(
    !result.error?.message?.includes("Could not find the table"),
    `${name} is not available through the production API`,
  );
  assert(
    !result.error?.message?.includes("schema cache"),
    `${name} has not reached the production API schema cache`,
  );
}

const unknownId = randomUUID();
const futureStart = new Date(Date.now() + 21 * 86_400_000).toISOString();
const futureEnd = new Date(Date.now() + 21 * 86_400_000 + 2 * 3_600_000).toISOString();
const [
  proposalTable,
  followUpTable,
  archiveTable,
  mediaTable,
  continuationTable,
  ownList,
  adminList,
  followUp,
  ownArchive,
  adminArchives,
  adminMedia,
  signedOutSave,
] =
  await Promise.all([
    client.from("member_event_proposals").select("id", { count: "exact", head: true }),
    client.from("event_follow_up_interests").select("event_id", { count: "exact", head: true }),
    client.from("member_event_archive_submissions").select("event_id", { count: "exact", head: true }),
    client.from("member_event_media_submissions").select("id", { count: "exact", head: true }),
    client.from("event_community_continuations").select("event_id", { count: "exact", head: true }),
    client.rpc("list_my_member_event_proposals"),
    client.rpc("list_admin_member_event_proposals"),
    client.rpc("get_my_event_follow_up_interest", { p_event_id: unknownId }),
    client.rpc("get_my_member_event_archive", { p_event_id: unknownId }),
    client.rpc("list_admin_member_event_archives"),
    client.rpc("list_admin_event_media_submissions"),
    client.rpc("save_member_event_proposal", {
      p_accessibility_notes: null,
      p_address_line: null,
      p_capacity: 20,
      p_city: "Nairobi",
      p_community_after_event: false,
      p_community_idea: null,
      p_country: "Kenya",
      p_ends_at: futureEnd,
      p_format: "in_person",
      p_host_experience: "A signed-out boundary check that must never save.",
      p_host_note: null,
      p_map_url: null,
      p_online_url: null,
      p_proposal_id: null,
      p_safety_contact_name: "Boundary Check",
      p_safety_contact_phone: "+254700000000",
      p_starts_at: futureStart,
      p_submit: false,
      p_summary: "A signed-out boundary check that must never create an event proposal.",
      p_timezone: "Africa/Nairobi",
      p_title: "Boundary check event",
      p_venue_name: "Boundary Venue",
    }),
  ]);

assertRelationExists(proposalTable, "member_event_proposals");
assertRelationExists(followUpTable, "event_follow_up_interests");
assertRelationExists(archiveTable, "member_event_archive_submissions");
assertRelationExists(mediaTable, "member_event_media_submissions");
assertRelationExists(continuationTable, "event_community_continuations");
assertFunctionExists(ownList, "list_my_member_event_proposals");
assertFunctionExists(adminList, "list_admin_member_event_proposals");
assertFunctionExists(followUp, "get_my_event_follow_up_interest");
assertFunctionExists(ownArchive, "get_my_member_event_archive");
assertFunctionExists(adminArchives, "list_admin_member_event_archives");
assertFunctionExists(adminMedia, "list_admin_event_media_submissions");
assertFunctionExists(signedOutSave, "save_member_event_proposal");
assert(ownList.error, "Signed-out visitors must not list member event proposals");
assert(adminList.error, "Signed-out visitors must not list Admin event proposals");
assert(adminArchives.error, "Signed-out visitors must not list event archive reviews");
assert(adminMedia.error, "Signed-out visitors must not list event media reviews");
assert(signedOutSave.error, "Signed-out visitors must not create an event proposal");
assert.equal(
  (followUp.data ?? [])[0]?.available,
  false,
  "An unknown event must not offer Community follow-up",
);

process.stdout.write(
  `${JSON.stringify(
    {
      checks: {
        adminProposalBoundary: "private",
        attendeeFollowUpConsent: "ready",
        attendeeMediaReview: "ready and private by default",
        eventArchiveReview: "ready and access-controlled",
        memberProposalBoundary: "private",
        publicEventProposalFunctions: "ready and access-controlled",
        signedOutWrite: "blocked",
        unknownEventFollowUp: "unavailable",
      },
      secretsPrinted: false,
    },
    null,
    2,
  )}\n`,
);
