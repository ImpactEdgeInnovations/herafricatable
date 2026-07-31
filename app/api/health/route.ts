import { NextResponse } from "next/server";
import { assessOperationalHealth } from "@/lib/operational-health";

export const dynamic = "force-dynamic";

export async function GET() {
  const assessment = await assessOperationalHealth();
  const database = assessment.checks.find(
    (check) => check.key === "database",
  );
  const server = assessment.checks.find((check) => check.key === "server");

  return NextResponse.json(
    {
      status: assessment.status,
      database:
        database?.status === "ready" ? "reachable" : "unavailable",
      server_integration:
        server?.status === "ready" ? "ready" : "unavailable",
      release: assessment.release,
      latency_ms: assessment.latencyMs,
    },
    {
      status: assessment.status === "ok" ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
