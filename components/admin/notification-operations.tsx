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
}: {
  briefingBatches: AdminCommunityBriefingBatch[];
  briefingMigrationReady: boolean;
  jobs: AdminNotificationJob[];
  providerConfigured: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
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
          <p className="eyebrow">Delivery operations</p>
          <h2>Notification outbox</h2>
          <p>
            Transactional messages are queued, idempotent, retried with backoff,
            and processed outside member requests.
          </p>
        </div>
        <span
          className={`provider-state ${providerConfigured ? "ready" : "pending"}`}
        >
          {providerConfigured
            ? "Provider configured"
            : "Provider setup required"}
        </span>
      </div>
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
              One privacy-safe aggregate per active room member, queued only
              when a room moved or a linked gathering is within seven days.
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
              No weekly batch yet. The next authenticated worker run will create
              the first idempotent batch.
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
