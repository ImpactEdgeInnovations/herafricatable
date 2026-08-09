import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishable) {
  throw new Error("Supabase public credentials are required.");
}

const publicClient = createClient(url, publishable, {
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
const [
  proposalTable,
  eventAudience,
  membershipApplicationTable,
  hostList,
  adminList,
  membershipAdminList,
  eventVisibility,
] = await Promise.all([
  publicClient
    .from("community_event_proposals")
    .select("id", { count: "exact", head: true }),
  publicClient.from("events").select("audience").limit(1),
  publicClient
    .from("membership_applications")
    .select("user_id", { count: "exact", head: true }),
  publicClient.rpc("list_my_community_event_proposals", {
    p_community_id: unknownId,
  }),
  publicClient.rpc("list_admin_community_event_proposals"),
  publicClient.rpc("list_admin_members_v3"),
  publicClient.rpc("can_view_event", {
    p_event_id: unknownId,
    p_user_id: null,
  }),
]);

assertRelationExists(proposalTable, "community_event_proposals");
assert.ifError(eventAudience.error);
assertRelationExists(membershipApplicationTable, "membership_applications");
assertFunctionExists(hostList, "list_my_community_event_proposals");
assertFunctionExists(adminList, "list_admin_community_event_proposals");
assertFunctionExists(membershipAdminList, "list_admin_members_v3");
assertFunctionExists(eventVisibility, "can_view_event");
assert.equal(eventVisibility.error, null, "Anonymous event visibility check failed");
assert.equal(eventVisibility.data, false, "Unknown events must remain private");
assert(hostList.error, "Signed-out visitors must not read Host proposals");
assert(adminList.error, "Signed-out visitors must not read Admin proposals");
assert(
  membershipAdminList.error || (membershipAdminList.data?.length ?? 0) === 0,
  "Signed-out visitors must not receive membership applications",
);

process.stdout.write(
  `${JSON.stringify(
    {
      checks: {
        communityEventAudience: "ready",
        communityEventProposalFunctions: "ready and access-controlled",
        communityEventProposalTable: "ready",
        membershipApplicationJourney: "ready and access-controlled",
        unknownEventBoundary: "private",
      },
      records: {
        membershipApplicationProjection: membershipApplicationTable.error
          ? "private"
          : "available",
        proposalProjection: proposalTable.error ? "private" : "available",
      },
      secretsPrinted: false,
    },
    null,
    2,
  )}\n`,
);
