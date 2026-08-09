"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";

export type AdminNotificationJob = {
  job_id: string;
  to_email: string;
  template_key: string;
  status: string;
  attempts: number;
  provider_message_id: string | null;
  last_error: string | null;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
};
export type AdminCommunityBriefingBatch = {
  week_start: string;
  status: string;
  queued_recipients: number;
  started_at: string;
  completed_at: string | null;
};
export type EmailReadinessCheck = {
  detail: string;
  key: string;
  label: string;
  ready: boolean;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
export function NotificationOperations({
  briefingBatches,
  briefingMigrationReady,
  jobs,
  providerConfigured,
  readinessChecks,
}: {
  briefingBatches: AdminCommunityBriefingBatch[];
  briefingMigrationReady: boolean;
  jobs: AdminNotificationJob[];
  providerConfigured: boolean;
  readinessChecks: EmailReadinessCheck[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  async function sendDeliveryTest() {
    setBusy("delivery-test");
    setNotice("");
    try {
      const response = await fetch("/api/admin/notifications/test", {
        method: "POST",
      });
      const result = (await response.json()) as {
        deliveredTo?: string;
        error?: string;
      };
      setNotice(
        response.ok
          ? `Test accepted for ${result.deliveredTo ?? "your admin email"}. Check the inbox and spam folder.`
          : result.error ?? "The email provider did not accept the test.",
      );
    } catch {
      setNotice("The delivery test could not be completed. Please try again.");
    } finally {
      setBusy("");
    }
  }
  async function processQueue() {
    setBusy("process-queue");
    setNotice("");
    try {
      const response = await fetch("/api/admin/notifications/process", {
        method: "POST",
      });
      const result = (await response.json()) as {
        claimed?: number;
        error?: string;
        failed?: number;
        sent?: number;
        suppressed?: number;
      };
      setNotice(
        response.ok
          ? `${result.claimed ?? 0} queued message${result.claimed === 1 ? "" : "s"} processed: ${result.sent ?? 0} sent, ${result.suppressed ?? 0} test ${result.suppressed === 1 ? "address" : "addresses"} suppressed, ${result.failed ?? 0} failed.`
          : result.error ?? "The delivery queue could not be processed.",
      );
      if (response.ok) router.refresh();
    } catch {
      setNotice("The delivery queue could not be processed. Please try again.");
    } finally {
      setBusy("");
    }
  }
  async function retry(id: string) {
    setBusy(id);
    const { error } = await supabase.rpc("retry_notification_job", {
      p_job_id: id,
    });
    setBusy("");
    setNotice(
      error
        ? adminErrorMessage(error, "queue this notification for retry")
        : "Delivery queued for retry.",
    );
    if (!error) router.refresh();
  }
  const counts = {
    queued: jobs.filter((job) => job.status === "queued").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    sent: jobs.filter((job) => job.status === "sent").length,
  };
  return (
    <section className="admin-section notification-operations">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Member messages</p>
          <h2>Email and app messages</h2>
          <p>
            See messages waiting to be sent, messages delivered and messages
            that need another try.
          </p>
        </div>
        <div className="notification-provider-actions">
          <span
            className={`provider-state ${providerConfigured ? "ready" : "pending"}`}
          >
            {providerConfigured
              ? "Email service is ready"
              : "Email service needs setup"}
          </span>
          {providerConfigured ? (
            <>
              <button
                className="button button-outline"
                disabled={Boolean(busy)}
                onClick={() => void processQueue()}
                type="button"
              >
                {busy === "process-queue" ? "Sending…" : "Send waiting messages"}
              </button>
              <button
                className="button button-outline"
                disabled={Boolean(busy)}
                onClick={() => void sendDeliveryTest()}
                type="button"
              >
                {busy === "delivery-test" ? "Sending test…" : "Send private test"}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <section className="notification-readiness" aria-labelledby="email-readiness-title">
        <div>
          <p className="eyebrow">Before emails go live</p>
          <h3 id="email-readiness-title">Email readiness</h3>
          <p>
            Every item must be ready, then a private test must arrive in the
            Admin inbox before member email is enabled.
          </p>
        </div>
        <ul>
          {readinessChecks.map((check) => (
            <li className={check.ready ? "ready" : "pending"} key={check.key}>
              <span aria-hidden="true">{check.ready ? "✓" : "·"}</span>
              <div>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="notification-metrics">
        <article>
          <strong>{counts.queued}</strong>
          <span>Queued</span>
        </article>
        <article>
          <strong>{counts.sent}</strong>
          <span>Sent</span>
        </article>
        <article>
          <strong>{counts.failed}</strong>
          <span>Failed</span>
        </article>
        <article>
          <strong>
            {jobs.reduce((sum, job) => sum + Number(job.attempts), 0)}
          </strong>
          <span>Attempts</span>
        </article>
      </div>
      {briefingMigrationReady ? (
        <section className="community-briefing-operations">
          <div>
            <p className="eyebrow">Community rhythm</p>
            <h3>Weekly briefing</h3>
            <p>
              One private weekly summary for each active Community member,
              sent only when there is something useful to share.
            </p>
          </div>
          {briefingBatches[0] ? (
            <dl>
              <div>
                <dt>Latest week</dt>
                <dd>
                  {new Intl.DateTimeFormat("en-KE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(`${briefingBatches[0].week_start}T12:00:00Z`))}
                </dd>
              </div>
              <div>
                <dt>Recipients queued</dt>
                <dd>{briefingBatches[0].queued_recipients}</dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>{briefingBatches[0].status}</dd>
              </div>
            </dl>
          ) : (
            <span>
              No weekly summary has been prepared yet. The next scheduled check
              will prepare one when there is something to share.
            </span>
          )}
        </section>
      ) : null}
      {jobs.length ? (
        <div className="notification-job-list">
          <header>
            <span>Recipient</span>
            <span>Category</span>
            <span>State</span>
            <span>Delivery</span>
            <span></span>
          </header>
          {jobs.map((job) => (
            <article key={job.job_id}>
              <div>
                <strong>{job.to_email}</strong>
                <small>{date(job.created_at)}</small>
              </div>
              <span>{job.template_key}</span>
              <span className={`support-state ${job.status}`}>
                {job.status}
              </span>
              <div>
                <small>
                  {job.provider_message_id
                    ? `Provider ${job.provider_message_id}`
                    : job.last_error
                      ? adminErrorMessage(
                          job.last_error,
                          "deliver this notification",
                        )
                      : `Next attempt ${date(job.next_attempt_at)}`}
                </small>
              </div>
              <div>
                {job.status === "failed" ? (
                  <button
                    disabled={busy === job.job_id}
                    onClick={() => void retry(job.job_id)}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="admin-empty">
          <strong>No delivery jobs yet</strong>
          <p>
            New connection, registration, event and support activity will
            populate the outbox.
          </p>
        </div>
      )}
      {notice ? (
        <p className="manager-message content-manager-message">{notice}</p>
      ) : null}
    </section>
  );
}
