"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";

export type MarketplaceReport = { category: string; created_at: string; details: string; evidence_snapshot: Record<string, unknown>; post_id: string; report_id: string; reporter_email: string; reporter_id: string; status: string };

export function MarketplaceModeration({ reports, migrationReady }: { reports: MarketplaceReport[]; migrationReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function review(id: string, action: "start_review" | "hide" | "dismiss") {
    let outcome = "";
    if (action !== "start_review") {
      const result = await ask({
        title: action === "hide" ? "Hide this marketplace post?" : "Dismiss this marketplace report?",
        description: action === "hide" ? "The post will stop appearing to members while its captured evidence and audit history are preserved." : "Dismiss only when the captured evidence does not require further action.",
        confirmLabel: action === "hide" ? "Hide post" : "Dismiss report",
        tone: "danger",
        fields: [{ name: "outcome", label: action === "hide" ? "Reason for hiding" : "Reason for dismissing", type: "textarea", required: true, minLength: 5, maxLength: 1000, help: "Use at least 5 characters. Keep the decision specific to the reported evidence." }],
      });
      if (!result) return;
      outcome = String(result.outcome ?? "");
    }
    setBusy(id);
    const { error } = await supabase.rpc("review_marketplace_report", { p_action: action, p_outcome: outcome, p_report_id: id });
    setBusy("");
    setMessage(error ? error.message : "Marketplace moderation decision recorded.");
    if (!error) window.location.reload();
  }

  if (!migrationReady) return null;
  return <>
    <section className="admin-section moderation-queue" id="marketplace-moderation">
      <div className="admin-section-heading"><div><p className="eyebrow">Marketplace safety</p><h2>Asks &amp; Offers reports</h2><p>Review only the captured post snapshot submitted with a report. Hiding removes the post while preserving evidence and audit history.</p></div><span className="status-count">{reports.filter((report) => ["open", "reviewing"].includes(report.status)).length} active</span></div>
      {reports.length ? <div>{reports.map((report) => <article key={report.report_id}>
        <div><span className="member-status">{report.status}</span><small>{report.category} · {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(report.created_at))}</small></div>
        <div><strong>{String(report.evidence_snapshot.title ?? "Reported marketplace post")}</strong><p>{report.details}</p><blockquote>{String(report.evidence_snapshot.body ?? "")}</blockquote><small>Reported by {report.reporter_email}</small></div>
        {["open", "reviewing"].includes(report.status) ? <div className="member-actions">{report.status === "open" ? <button disabled={busy === report.report_id} onClick={() => void review(report.report_id, "start_review")}>Start review</button> : null}<button className="danger-action" disabled={busy === report.report_id} onClick={() => void review(report.report_id, "hide")}>Hide post</button><button disabled={busy === report.report_id} onClick={() => void review(report.report_id, "dismiss")}>Dismiss</button></div> : null}
      </article>)}</div> : <div className="admin-empty"><strong>No marketplace reports</strong><p>Reported Asks and Offers will appear here with their captured evidence.</p></div>}
      {message ? <p className="manager-message content-manager-message" role="status">{message}</p> : null}
    </section>
    {dialog}
  </>;
}
