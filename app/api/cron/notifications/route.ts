import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/worker";
import { cleanCommunityPhotos } from "@/lib/community-photo-cleanup";
import { createAdminClient } from "@/lib/supabase/admin";

async function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expectedBytes = Buffer.from(expected ?? "");
  const suppliedBytes = Buffer.from(supplied);
  if (expected && suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)) return true;
  if (!/^[a-f0-9]{64}$/.test(supplied)) return false;
  try {
    const result = await createAdminClient().rpc("verify_notification_dispatch_token", { p_token: supplied });
    return !result.error && result.data === true;
  } catch { return false; }
}

async function processRequest(request: Request) {
  if (!await authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  if (url.searchParams.get("check") === "1") {
    return NextResponse.json({ authorized: true, email_configured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.NEXT_PUBLIC_SITE_URL) });
  }
  if (url.searchParams.get("dispatch") !== "1") {
    try { await cleanCommunityPhotos(); }
    catch { console.error("Community photo housekeeping failed; reserved allowance is retained."); }
  }
  return processNotificationQueue();
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return processRequest(request);
}

export async function POST(request: Request) {
  return processRequest(request);
}
