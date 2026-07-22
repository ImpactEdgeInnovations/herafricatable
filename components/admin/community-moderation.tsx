"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityReport = { report_id: string; community_id: string; community_name: string; reporter_email: string; category: string; details: string; evidence_snapshot: Record<string, unknown>; status: string; created_at: string };

export function CommunityModeration({ reports, migrationReady }: { reports: CommunityReport[]; migrationReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function review(id: string, action: "start_review" | "hide" | "dismiss") {
    let outcome = "";
    if (action !== "start_review") {
      const result = await ask({
        title: action === "hide" ? "Hide this community post?" : "Dismiss this community report?",
        description: action === "hide" ? "The post will be removed from the private community feed while its captured evidence remains available for audit." : "Dismiss only when the captured evidence does not require further action.",
        confirmLabel: action === "hide" ? "Hide post" : "Dismiss report",
        tone: "danger",
        fields: [{ name: "outcome", label: action === "hide" ? "Reason for hiding" : "Reason for dismissing", type: "textarea", required: true, minLength: 5, maxLength: 1000, help: "Use at least 5 characters and refer only to the reported evidence." }],
      });
      if (!result) return;
      outcome = String(result.outcome ?? "");
    }
    setBusy(id);
    const { error } = await supabase.rpc("review_community_report", { p_action: action, p_outcome: outcome, p_report_id: id });
    setBusy("");
    setMessage(error ? error.message : "Community moderation decision recorded.");
    if (!error) window.location.reload();
  }

  if (!migrationReady) return null;
  return <>
    <section className="admin-section moderation-queue" id="community-moderation">
      <div className="admin-section-heading"><div><p className="eyebrow">Report-scoped access</p><h2>Community safety</h2><p>Moderators receive only captured evidence from reported posts, never general access to private community feeds.</p></div><span className="status-count">{reports.filter((report) => ["open", "reviewing"].includes(report.status)).length} active</span></div>
      {reports.length ? <div>{reports.map((report) => <article key={report.report_id}>
        <div><span className="member-status">{report.status}</span><small>{report.community_name} · {report.category}</small></div>
        <div><strong>{report.reporter_email}</strong><p>{report.details}</p><blockquote>{String(report.evidence_snapshot.body ?? "")}</blockquote></div>
        {["open", "reviewing"].includes(report.status) ? <div className="member-actions">{report.status === "open" ? <button disabled={busy === report.report_id} onClick={() => void review(report.report_id, "start_review")}>Start review</button> : null}<button className="danger-action" disabled={busy === report.report_id} onClick={() => void review(report.report_id, "hide")}>Hide post</button><button disabled={busy === report.report_id} onClick={() => void review(report.report_id, "dismiss")}>Dismiss</button></div> : null}
      </article>)}</div> : <div className="admin-empty"><strong>No community reports</strong><p>Reported post snapshots will appear here for bounded review.</p></div>}
      {message ? <p className="manager-message content-manager-message" role="status">{message}</p> : null}
    </section>
    {dialog}
  </>;
}
