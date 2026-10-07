"use client";
import { useRouter } from "next/navigation";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { adminErrorMessage } from "@/lib/admin-error";

export type CommunityReport = {
  report_id: string;
  community_id: string | null;
  community_name: string;
  reporter_email: string;
  category: string;
  details: string;
  evidence_snapshot: Record<string, unknown>;
  status: string;
  created_at: string;
  content_type?: "check_in" | "event_question" | "gathering_message" | "post" | "photo";
  photo_id?: string | null;
  blocks_photo?: boolean;
};

function ReportedPhotoPreview({ photoId, reportId }: { photoId: string; reportId: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p>The photo file is no longer available for preview. Captured report details remain below.</p> :
    <figure><img className="community-report-photo" src={`/api/community/photos/${photoId}?report=${reportId}`} loading="lazy" alt="Reported Community photo" onError={() => setFailed(true)} /><figcaption>Preview is limited to this report, for up to 30 days.</figcaption></figure>;
}

export function CommunityModeration({
  reports,
  migrationReady,
}: {
  reports: CommunityReport[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function review(
    id: string,
    action: "start_review" | "hide" | "dismiss" | "restore",
  ) {
    let outcome = "";
    if (action !== "start_review") {
      const result = await ask({
        title:
          action === "restore" ? "Release this photo's safety hold?" : action === "hide"
            ? "Hide this community content?"
            : "Dismiss this community report?",
        description:
          action === "restore" ? "Release this report's hold only after checking the concern. Other safety holds and member removal remain in place." : action === "hide"
            ? "The reported content will be hidden from members. The report and its captured details remain available for review."
            : "Dismiss only when the captured evidence does not require further action.",
        confirmLabel: action === "restore" ? "Release hold" : action === "hide" ? "Hide content" : "Dismiss report",
        tone: "danger",
        fields: [
          {
            name: "outcome",
            label:
              action === "restore" ? "Reason for releasing the hold" : action === "hide" ? "Reason for hiding" : "Reason for dismissing",
            type: "textarea",
            required: true,
            minLength: 5,
            maxLength: 1000,
            help: "Use at least 5 characters and refer only to the reported evidence.",
          },
        ],
      });
      if (!result) return;
      outcome = String(result.outcome ?? "");
    }
    setBusy(id);
    setMessage("");
    try {
    const report = reports.find((item) => item.report_id === id);
    const { error } = report?.content_type === "photo"
      ? await supabase.rpc("review_community_photo_report", { p_action: action, p_outcome: outcome, p_report_id: id })
      : report?.content_type === "event_question"
      ? await supabase.rpc("review_event_question_report", {
          p_action: action,
          p_outcome: outcome,
          p_report_id: id,
        })
      : report?.content_type === "gathering_message"
      ? await supabase.rpc("review_community_gathering_report", {
          p_action: action,
          p_outcome: outcome,
          p_report_id: id,
        })
      : report?.content_type
      ? await supabase.rpc("review_community_safety_report", {
          p_action: action,
          p_content_type: report.content_type,
          p_outcome: outcome,
          p_report_id: id,
        })
      : await supabase.rpc("review_community_report", {
          p_action: action,
          p_outcome: outcome,
          p_report_id: id,
        });
    setMessage(
      error
        ? adminErrorMessage(error, "record this community moderation decision")
        : "Decision saved.",
    );
    if (!error) router.refresh();
    } catch (error) { setMessage(adminErrorMessage(error, "save this decision")); }
    finally { setBusy(""); }
  }

  if (!migrationReady) return null;
  return (
    <>
      <section
        className="admin-section moderation-queue"
        id="community-moderation"
      >
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">Private reports</p>
            <h2>Community safety</h2>
            <p>
              Moderators receive only the reported photo, question, post, message or
              check-in—never general access to private Community feeds or any
              member’s private check-in answer.
            </p>
          </div>
          <span className="status-count">
            {
              reports.filter((report) =>
                ["open", "reviewing"].includes(report.status),
              ).length
            }{" "}
            active
          </span>
        </div>
        {reports.length ? (
          <div>
            {reports.map((report) => (
              <article key={report.report_id}>
                <div>
                  <span className="member-status">{report.status}</span>
                  <small>
                    {report.community_name} · {report.content_type === "photo" ? "Photo" : report.content_type === "check_in" ? "Quick check-in" : report.content_type === "event_question" ? "Event question" : report.content_type === "gathering_message" ? "Gathering message" : "Post"} · {report.category}
                  </small>
                </div>
                <div>
                  <strong>{report.reporter_email}</strong>
                  <p>{report.details}</p>
                  {report.content_type === "photo" ? <><strong>{String(report.evidence_snapshot.album_title ?? "Photo album")}</strong>
                    <p>{String(report.evidence_snapshot.caption ?? "No caption")}</p>
                    {report.photo_id && (["open", "reviewing"].includes(report.status) || report.blocks_photo) ? <ReportedPhotoPreview photoId={report.photo_id} reportId={report.report_id} /> : null}
                  </> : null}
                  <blockquote>
                    {String(
                      report.evidence_snapshot.body ??
                        report.evidence_snapshot.question ??
                        report.evidence_snapshot.caption ??
                        "Captured evidence available",
                    )}
                  </blockquote>
                </div>
                {["open", "reviewing"].includes(report.status) ? (
                  <div className="member-actions">
                    {report.status === "open" ? (
                      <button
                        disabled={busy === report.report_id}
                        onClick={() =>
                          void review(report.report_id, "start_review")
                        }
                      >
                        Start review
                      </button>
                    ) : null}
                    <button
                      className="danger-action"
                      disabled={busy === report.report_id}
                      onClick={() => void review(report.report_id, "hide")}
                    >
                      Hide content
                    </button>
                    <button
                      disabled={busy === report.report_id}
                      onClick={() => void review(report.report_id, "dismiss")}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
                {report.content_type === "photo" && report.blocks_photo ? <button disabled={Boolean(busy)} onClick={() => void review(report.report_id, "restore")}>Release photo hold</button> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <strong>No Community reports</strong>
            <p>Reported event questions and Community content appear here for bounded review.</p>
          </div>
        )}
        {message ? (
          <p className="manager-message content-manager-message" role="status">
            {message}
          </p>
        ) : null}
      </section>
      {dialog}
    </>
  );
}
