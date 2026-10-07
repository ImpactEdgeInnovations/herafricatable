import "server-only";

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

function migrationPending(error: RpcError | null, functionName: string) {
  if (!error) return false;
  return (
    ["42883", "PGRST202"].includes(error.code ?? "") ||
    new RegExp(`(?:could not find|does not exist).*${functionName}`, "i").test(
      error.message ?? "",
    )
  );
}

export async function processNotificationQueue({
  dedupeKey,
  strictTarget = false,
}: {
  dedupeKey?: string;
  strictTarget?: boolean;
} = {}) {
  const admin = createAdminClient();
  const { data: lifecycleData, error: lifecycleError } = await admin.rpc(
    "reconcile_community_host_subscriptions",
  );
  if (
    lifecycleError &&
    !migrationPending(lifecycleError as RpcError, "reconcile_community_host_subscriptions")
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
  if (
    briefingError &&
    !migrationPending(briefingError as RpcError, "queue_community_weekly_briefings")
  ) {
    return NextResponse.json(
      { error: "Community briefing queue unavailable" },
      { status: 503 },
    );
  }
  const briefingsQueued = Number(briefingData ?? 0);

  const { data: reminderData, error: reminderError } = await admin.rpc(
    "queue_due_community_event_reminders",
  );
  if (
    reminderError &&
    !migrationPending(reminderError as RpcError, "queue_due_community_event_reminders")
  ) {
    return NextResponse.json(
      { error: "Community event reminders unavailable" },
      { status: 503 },
    );
  }
  const eventRemindersQueued = Number(reminderData ?? 0);

  const { data: standaloneReminderData, error: standaloneReminderError } = await admin.rpc(
    "queue_due_standalone_event_reminders",
  );
  if (
    standaloneReminderError &&
    !migrationPending(standaloneReminderError as RpcError, "queue_due_standalone_event_reminders")
  ) {
    return NextResponse.json(
      { error: "Standalone event reminders unavailable" },
      { status: 503 },
    );
  }
  const standaloneRemindersQueued = Number(standaloneReminderData ?? 0);

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    return NextResponse.json(
      {
        briefingsQueued,
        eventRemindersQueued,
        error: "Email provider not configured",
        hostLifecycle,
        standaloneRemindersQueued,
      },
      { status: 503 },
    );
  }

  let claimResult = dedupeKey
    ? await admin.rpc("claim_notification_job", {
        p_dedupe_key: dedupeKey,
      })
    : await admin.rpc("claim_notification_jobs", { p_limit: 25 });
  if (
    dedupeKey && !strictTarget &&
    migrationPending(claimResult.error as RpcError | null, "claim_notification_job")
  ) {
    claimResult = await admin.rpc("claim_notification_jobs", { p_limit: 25 });
  }
  const { data, error } = claimResult;
  if (error) {
    return NextResponse.json(
      { briefingsQueued, error: "Queue unavailable" },
      { status: 503 },
    );
  }

  const jobs = (data as ClaimedJob[] | null) ?? [];
  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  await Promise.all(
    jobs.map(async (job) => {
      if (job.dedupe_key.startsWith("pilot-member-invite:")) {
        const inviteId = job.dedupe_key.slice("pilot-member-invite:".length);
        const [inviteResult, intakeResult] = await Promise.all([
          admin.from("beta_invites").select("status,expires_at").eq("id", inviteId).eq("source", "admin_pilot").maybeSingle(),
          admin.from("membership_intake_settings").select("mode,trusted_auto_expires_at").eq("id", true).maybeSingle(),
        ]);
        if (inviteResult.error || intakeResult.error) {
          await admin.rpc("finish_notification_job", {
            p_error_code: "pilot_invitation_eligibility_unavailable",
            p_job_id: job.job_id,
            p_provider_message_id: null,
            p_success: false,
          });
          failed += 1;
          return;
        }
        const eligible = inviteResult.data?.status === "pending"
          && Date.parse(inviteResult.data.expires_at ?? "") > Date.now()
          && intakeResult.data?.mode === "trusted_auto"
          && Date.parse(intakeResult.data.trusted_auto_expires_at ?? "") > Date.now();
        if (!eligible) {
          const { error: suppressionError } = await admin.from("notification_jobs")
            .update({ status: "suppressed", locked_at: null, updated_at: new Date().toISOString() })
            .eq("id", job.job_id).eq("status", "processing");
          if (suppressionError) {
            await admin.rpc("finish_notification_job", {
              p_error_code: "pilot_invitation_suppression_unavailable",
              p_job_id: job.job_id,
              p_provider_message_id: null,
              p_success: false,
            });
            failed += 1;
          } else {
            suppressed += 1;
          }
          return;
        }
      }
      if (job.dedupe_key.startsWith("standalone-event-reminder:")) {
        const { data: allowed, error: reminderCheckError } = await admin.rpc(
          "check_standalone_event_reminder_job",
          { p_job_id: job.job_id },
        );
        if (reminderCheckError) {
          await admin.rpc("finish_notification_job", {
            p_error_code: "reminder_eligibility_unavailable",
            p_job_id: job.job_id,
            p_provider_message_id: null,
            p_success: false,
          });
          failed += 1;
          return;
        }
        if (allowed !== true) {
          suppressed += 1;
          return;
        }
      }
      if (/\.invalid$/i.test(job.to_email.trim())) {
        await admin.rpc("finish_notification_job", {
          p_error_code: null,
          p_job_id: job.job_id,
          p_provider_message_id: "suppressed:test-address",
          p_success: true,
        });
        suppressed += 1;
        return;
      }
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
    standaloneRemindersQueued,
    sent,
    suppressed,
    targeted: Boolean(dedupeKey),
  });
}
