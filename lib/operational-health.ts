import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/env";

export type OperationalCheckStatus = "attention" | "ready" | "unavailable";

export type OperationalCheck = {
  guidance: string;
  key: "database" | "email" | "payments" | "server" | "site_url";
  label: string;
  required: boolean;
  status: OperationalCheckStatus;
  summary: string;
};

export type OperationalHealth = {
  checkedAt: string;
  checks: OperationalCheck[];
  latencyMs: number;
  release: string;
  status: "degraded" | "ok";
};

function validSiteUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      (process.env.VERCEL_ENV !== "production" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

export async function assessOperationalHealth(): Promise<OperationalHealth> {
  const startedAt = Date.now();
  const release =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local";
  const checks: OperationalCheck[] = [];
  let publicEnvironment:
    | ReturnType<typeof getSupabasePublicEnv>
    | undefined;

  try {
    publicEnvironment = getSupabasePublicEnv();
    const publicClient = createClient(
      publicEnvironment.url,
      publicEnvironment.publishableKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error } = await publicClient
      .from("site_event_countdown")
      .select("id", { count: "exact", head: true })
      .limit(1);
    checks.push({
      guidance: error
        ? "Confirm the Supabase project URL, publishable key and public database availability."
        : "The public application can reach its database boundary.",
      key: "database",
      label: "Public database",
      required: true,
      status: error ? "unavailable" : "ready",
      summary: error ? "Public data check failed" : "Reachable",
    });
  } catch {
    checks.push({
      guidance:
        "Add the Supabase project URL and publishable key to this deployment scope.",
      key: "database",
      label: "Public database",
      required: true,
      status: "unavailable",
      summary: "Configuration missing or invalid",
    });
  }

  const siteReady = validSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
  checks.push({
    guidance: siteReady
      ? "Authentication, email and payment callbacks have a valid canonical origin."
      : "Set NEXT_PUBLIC_SITE_URL to the exact HTTPS production origin. Local HTTP is accepted outside Production.",
    key: "site_url",
    label: "Canonical site URL",
    required: true,
    status: siteReady ? "ready" : "unavailable",
    summary: siteReady ? "Valid deployment origin" : "Missing or invalid",
  });

  let automaticPublishedEvents = 0;
  let queuedEmailJobs = 0;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (publicEnvironment && secretKey) {
    const adminClient = createClient(publicEnvironment.url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const [auditResult, automaticResult, emailJobResult] = await Promise.all([
      adminClient
        .from("audit_events")
        .select("id", { count: "exact", head: true })
        .limit(1),
      adminClient
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("registration_mode", "automatic"),
      adminClient
        .from("notification_jobs")
        .select("id", { count: "exact", head: true })
        .in("status", ["queued", "processing"]),
    ]);
    automaticPublishedEvents = automaticResult.error
      ? 0
      : (automaticResult.count ?? 0);
    queuedEmailJobs = emailJobResult.error ? 0 : (emailJobResult.count ?? 0);
    const serviceErrors = [
      auditResult.error,
      automaticResult.error,
      emailJobResult.error,
    ].filter(Boolean);
    checks.push({
      guidance: serviceErrors.length
        ? "Confirm SUPABASE_SECRET_KEY belongs to this project and that every committed migration is applied."
        : "Server-only operations can reach audit, event and delivery records.",
      key: "server",
      label: "Server integration",
      required: true,
      status: serviceErrors.length ? "unavailable" : "ready",
      summary: serviceErrors.length ? "Privileged checks failed" : "Verified",
    });
  } else {
    checks.push({
      guidance:
        "Add the server-only Supabase secret key to this deployment scope. Never expose it as NEXT_PUBLIC.",
      key: "server",
      label: "Server integration",
      required: true,
      status: "unavailable",
      summary: "Secret integration unavailable",
    });
  }

  const paymentConfigured = Boolean(
    process.env.PAYSTACK_SECRET_KEY && siteReady,
  );
  const paymentsRequired = automaticPublishedEvents > 0;
  checks.push({
    guidance: paymentConfigured
      ? "Configuration is present. A signed webhook and low-value reconciliation test are still required before public sale."
      : paymentsRequired
        ? "Switch every published event to manual review or closed immediately, or configure and verify Paystack."
        : "Manual review and closed registration remain safe while provider approval is pending.",
    key: "payments",
    label: "Online payments",
    required: paymentsRequired,
    status: paymentConfigured
      ? "ready"
      : paymentsRequired
        ? "unavailable"
        : "attention",
    summary: paymentConfigured
      ? "Configured, live proof pending"
      : paymentsRequired
        ? `${automaticPublishedEvents} automatic event${automaticPublishedEvents === 1 ? "" : "s"} exposed`
        : "Manual fallback available",
  });

  const cronSecretReady = (process.env.CRON_SECRET?.length ?? 0) >= 32;
  const emailConfigured = Boolean(
    process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      cronSecretReady &&
      siteReady,
  );
  const emailRequired = queuedEmailJobs > 0;
  checks.push({
    guidance: emailConfigured
      ? "Configuration is present. Verify the sending domain, provider delivery and retry operations before launch."
      : emailRequired
        ? "Pause non-essential email generation or configure Resend, EMAIL_FROM and a 32+ character CRON_SECRET."
        : "In-app notifications remain available while email delivery is configured and rehearsed.",
    key: "email",
    label: "Email delivery",
    required: emailRequired,
    status: emailConfigured
      ? "ready"
      : emailRequired
        ? "unavailable"
        : "attention",
    summary: emailConfigured
      ? "Configured, delivery proof pending"
      : emailRequired
        ? `${queuedEmailJobs} queued job${queuedEmailJobs === 1 ? "" : "s"} cannot be proven deliverable`
        : "Not active yet",
  });

  const requiredChecks = checks.filter((check) => check.required);
  const status = requiredChecks.every((check) => check.status === "ready")
    ? "ok"
    : "degraded";

  return {
    checkedAt: new Date().toISOString(),
    checks,
    latencyMs: Date.now() - startedAt,
    release,
    status,
  };
}
