import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !publishable) throw new Error("Supabase public credentials are required.");

const client = createClient(url, publishable, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const unknownId = randomUUID();

function schemaReady(result, name) {
  const unavailable = result.error && (
    ["42P01", "42883", "PGRST202", "PGRST205"].includes(result.error.code ?? "") ||
    /could not find|does not exist|schema cache/i.test(result.error.message ?? "")
  );
  assert(!unavailable, `${name} is not available through the deployed Supabase API`);
}

const [rooms, cards, room, send, reports, reminderWorker] = await Promise.all([
  client.from("community_gathering_rooms").select("id", { count: "exact", head: true }),
  client.rpc("list_community_gathering_cards", { p_community_id: unknownId }),
  client.rpc("get_community_gathering_room", { p_community_id: unknownId, p_event_id: unknownId }),
  client.rpc("send_community_gathering_message", { p_body: "Boundary check", p_room_id: unknownId }),
  client.rpc("list_community_gathering_reports"),
  client.rpc("queue_due_community_event_reminders", { p_run_at: new Date().toISOString() }),
]);

schemaReady(rooms, "community_gathering_rooms");
schemaReady(cards, "list_community_gathering_cards");
schemaReady(room, "get_community_gathering_room");
schemaReady(send, "send_community_gathering_message");
schemaReady(reports, "list_community_gathering_reports");
schemaReady(reminderWorker, "queue_due_community_event_reminders");
assert(cards.error, "Signed-out visitors must not list Community gatherings");
assert(send.error, "Signed-out visitors must not send Gathering messages");
assert(reports.error, "Signed-out visitors must not read Gathering safety reports");
assert(reminderWorker.error, "Only the notification worker may queue Gathering reminders");
assert.equal((room.data ?? []).length, 0, "Unknown Gathering rooms must remain private");

process.stdout.write(`${JSON.stringify({
  checks: {
    adminSafetyBoundary: "private",
    gatheringFunctions: "deployed",
    gatheringReminderWorker: "deployed and service-only",
    gatheringRooms: rooms.error ? "private" : "deployed",
    memberWriteBoundary: "private",
    unknownRoomBoundary: "private",
  },
  secretsPrinted: false,
}, null, 2)}\n`);
