import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
assert(url && secretKey, "Supabase URL and secret key are required");

const service = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function readQuery(label, request) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await request();
    if (!result.error) return result;
    const retryable = !result.status || result.status >= 500;
    if (!retryable || attempt === 3) {
      const detail = String(result.error.message || "No database error text was returned").slice(0, 160);
      throw new Error(`${label} failed (HTTP ${result.status || "unknown"}, ${result.error.code || "unknown"}): ${detail}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }
}

const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
const statuses = ["queued", "processing", "failed", "sent", "suppressed"];
const statusResults = [];
for (const status of statuses) {
  statusResults.push(await readQuery(`${status} notification count`, () =>
    service.from("notification_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", status)
      .gte("created_at", since)));
}

const [latestSent, oldestWaiting, latestFailure, latestDirectTest, latestDirectFailure] = await Promise.all([
  readQuery("last provider-accepted notification", () => service.from("notification_jobs")
    .select("updated_at,provider_message_id")
    .eq("status", "sent")
    .not("provider_message_id", "is", null)
    .not("provider_message_id", "like", "suppressed:%")
    .order("updated_at", { ascending: false })
    .limit(1)),
  readQuery("oldest waiting notification", () => service.from("notification_jobs")
    .select("created_at")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: true })
    .limit(1)),
  readQuery("last failed notification", () => service.from("notification_jobs")
    .select("updated_at,template_key")
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(1)),
  readQuery("last accepted direct Admin delivery test", () => service.from("audit_events")
    .select("created_at")
    .eq("action", "notification.delivery_test")
    .order("created_at", { ascending: false })
    .limit(1)),
  readQuery("last failed direct Admin delivery test", () => service.from("audit_events")
    .select("created_at")
    .eq("action", "notification.delivery_test_failed")
    .order("created_at", { ascending: false })
    .limit(1)),
]);

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
  directAdminDeliveryTest: {
    lastProviderAcceptedAt: latestDirectTest.data?.[0]?.created_at ?? null,
    lastFailureAt: latestDirectFailure.data?.[0]?.created_at ?? null,
    inboxReceiptVerifiedByAudit: false,
  },
  recipientsOrPayloadsPrinted: false,
}, null, 2));
