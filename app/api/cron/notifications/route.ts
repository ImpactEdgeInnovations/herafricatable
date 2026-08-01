import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "@/lib/notifications/email";

type ClaimedJob = {
  job_id: string;
  to_email: string;
  template_key: string;
  payload: { title?: string; body?: string; href?: string | null };
  attempt_number: number;
  dedupe_key: string;
};

type RpcError = {
  code?: string;
  message?: string;
};

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function briefingMigrationPending(error: RpcError | null) {
  if (!error) return false;
  return (
    ["42883", "PGRST202"].includes(error.code ?? "") ||
    /(?:could not find|does not exist).*queue_community_weekly_briefings/i.test(
      error.message ?? "",
    )
  );
}

function hostLifecycleMigrationPending(error: RpcError | null) {
  if (!error) return false;
  return (
    ["42883", "PGRST202"].includes(error.code ?? "") ||
    /(?:could not find|does not exist).*reconcile_community_host_subscriptions/i.test(
      error.message ?? "",
    )
  );
}

function eventReminderMigrationPending(error: RpcError | null) {
  if (!error) return false;
  return (
    ["42883", "PGRST202"].includes(error.code ?? "") ||
    /(?:could not find|does not exist).*queue_due_community_event_reminders/i.test(
      error.message ?? "",
    )
  );
}

async function processQueue(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: lifecycleData, error: lifecycleError } = await admin.rpc(
    "reconcile_community_host_subscriptions",
  );
  if (
    lifecycleError &&
    !hostLifecycleMigrationPending(lifecycleError as RpcError)
  ) {
    return NextResponse.json(
      { error: "Community host lifecycle unavailable" },
      { status: 503 },
    );
  }
  const hostLifecycle = lifecycleError
    ? null
    : ((lifecycleData as Record<string, number>[] | null) ?? [])[0] ?? null;

  const { data: briefingData, error: briefingError } = await admin.rpc(
    "queue_community_weekly_briefings",
  );
  if (briefingError && !briefingMigrationPending(briefingError)) {
    return NextResponse.json(
      { error: "Community briefing queue unavailable" },
      { status: 503 },
    );
  }
  const briefingsQueued = Number(briefingData ?? 0);

  const { data: reminderData, error: reminderError } = await admin.rpc(
    "queue_due_community_event_reminders",
  );
  if (reminderError && !eventReminderMigrationPending(reminderError)) {
    return NextResponse.json(
      { error: "Community event reminders unavailable" },
      { status: 503 },
    );
  }
  const eventRemindersQueued = Number(reminderData ?? 0);

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return NextResponse.json(
      {
        briefingsQueued,
        eventRemindersQueued,
        error: "Email provider not configured",
        hostLifecycle,
      },
      { status: 503 },
    );
  }

  const { data, error } = await admin.rpc("claim_notification_jobs", {
    p_limit: 25,
  });
  if (error) {
    return NextResponse.json(
      { briefingsQueued, error: "Queue unavailable" },
      { status: 503 },
    );
  }

  const jobs = (data as ClaimedJob[] | null) ?? [];
  let sent = 0;
  let failed = 0;
  await Promise.all(
    jobs.map(async (job) => {
      try {
        const providerId = await sendNotificationEmail(job);
        await admin.rpc("finish_notification_job", {
          p_error_code: null,
          p_job_id: job.job_id,
          p_provider_message_id: providerId,
          p_success: true,
        });
        sent += 1;
      } catch (error) {
        await admin.rpc("finish_notification_job", {
          p_error_code:
            error instanceof Error ? error.message : "provider_error",
          p_job_id: job.job_id,
          p_provider_message_id: null,
          p_success: false,
        });
        failed += 1;
      }
    }),
  );

  return NextResponse.json({
    briefingsQueued,
    claimed: jobs.length,
    failed,
    hostLifecycle,
    eventRemindersQueued,
    sent,
  });
}

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return processQueue(request);
}

export async function POST(request: Request) {
  return processQueue(request);
}
