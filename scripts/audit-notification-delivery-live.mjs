import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
assert(url && secretKey, "Supabase URL and secret key are required");

const service = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
const statuses = ["queued", "processing", "failed", "sent", "suppressed"];
const statusResults = await Promise.all(statuses.map((status) =>
  service.from("notification_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", status)
    .gte("created_at", since)));
statusResults.forEach((result) => assert.ifError(result.error));

const [latestSent, oldestWaiting, latestFailure] = await Promise.all([
  service.from("notification_jobs")
    .select("updated_at,provider_message_id")
    .eq("status", "sent")
    .not("provider_message_id", "is", null)
    .not("provider_message_id", "like", "suppressed:%")
    .order("updated_at", { ascending: false })
    .limit(1),
  service.from("notification_jobs")
    .select("created_at")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(1),
  service.from("notification_jobs")
    .select("updated_at,template_key")
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(1),
]);
for (const result of [latestSent, oldestWaiting, latestFailure])
  assert.ifError(result.error);

const counts = Object.fromEntries(statuses.map((status, index) =>
  [status, statusResults[index].count ?? 0]));

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  window: "last_7_days",
  counts,
  lastProviderAcceptedAt: latestSent.data?.[0]?.updated_at ?? null,
  oldestWaitingAt: oldestWaiting.data?.[0]?.created_at ?? null,
  latestFailureAt: latestFailure.data?.[0]?.updated_at ?? null,
  latestFailureCategory: latestFailure.data?.[0]?.template_key ?? null,
  recipientsOrPayloadsPrinted: false,
}, null, 2));
