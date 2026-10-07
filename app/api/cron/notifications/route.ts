import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/worker";
import { cleanCommunityPhotos } from "@/lib/community-photo-cleanup";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

async function processRequest(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Daily housekeeping uses the existing authorised schedule, not a public endpoint.
  try { await cleanCommunityPhotos(); }
  catch { console.error("Community photo housekeeping failed; reserved allowance is retained."); }
  return processNotificationQueue();
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return processRequest(request);
}

export async function POST(request: Request) {
  return processRequest(request);
}
