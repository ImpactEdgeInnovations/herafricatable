"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";

export type MemberReport = { category: string; created_at: string; details: string; evidence_snapshot: Record<string, unknown>; report_id: string; reporter_email: string; reporter_id: string; reporter_name: string | null; status: string; target_email: string; target_name: string | null; target_user_id: string };

export function ModerationQueue({ reports, migrationReady }: { reports: MemberReport[]; migrationReady: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function review(id: string, action: "start_review" | "resolve" | "dismiss") {
    let outcome = "";
    if (action !== "start_review") {
      const result = await ask({
        title: action === "resolve" ? "Resolve this member report?" : "Dismiss this member report?",
        description: action === "resolve" ? "Record the reviewed outcome and any protective action taken. The decision is added to the moderation audit history." : "Dismiss only when the captured evidence does not require further action. Record why for accountability.",
        confirmLabel: action === "resolve" ? "Resolve report" : "Dismiss report",
        tone: action === "dismiss" ? "danger" : "default",
        fields: [{ name: "outcome", label: "Moderation outcome", type: "textarea", required: true, minLength: 5, maxLength: 1000, help: "Use at least 5 characters. Do not add unrelated private information." }],
      });
      if (!result) return;
      outcome = String(result.outcome ?? "");
    }
    setBusy(id);
    const { error } = await supabase.rpc("review_member_report", { p_action: action, p_outcome: outcome, p_report_id: id });
    setBusy("");
    setMessage(error ? error.message : "Report updated and audit logged.");
    if (!error) window.location.reload();
  }

  if (!migrationReady) return <section className="admin-section" id="moderation"><div className="admin-empty"><strong>Safety migration required</strong><p>Apply <code>20260723090000_network_safety_foundation.sql</code>.</p></div></section>;

  return <>
    <section className="admin-section moderation-queue" id="moderation">
      <div className="admin-section-heading"><div><p className="eyebrow">Trust and safety</p><h2>Member reports</h2><p>Evidence is limited to the submitted report and a captured profile or message snapshot. This queue never grants general conversation access.</p></div><span className="status-count">{reports.filter((report) => ["open", "reviewing"].includes(report.status)).length} active</span></div>
      {reports.length ? <div>{reports.map((report) => <article key={report.report_id}>
        <div><span className="member-status">{report.status}</span><small>{report.category} · {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(report.created_at))}</small></div>
        <div><strong>{report.reporter_name || report.reporter_email} reported {report.target_name || report.target_email}</strong><p>{report.details}</p>{typeof report.evidence_snapshot.body === "string" ? <blockquote>Reported message: “{report.evidence_snapshot.body}”</blockquote> : null}</div>
        {["open", "reviewing"].includes(report.status) ? <div className="member-actions">{report.status === "open" ? <button disabled={busy === report.report_id} onClick={() => void review(report.report_id, "start_review")}>Start review</button> : null}<button disabled={busy === report.report_id} onClick={() => void review(report.report_id, "resolve")}>Resolve</button><button disabled={busy === report.report_id} onClick={() => void review(report.report_id, "dismiss")}>Dismiss</button></div> : null}
      </article>)}</div> : <div className="admin-empty"><strong>No member reports</strong><p>New safety reports will appear here for scoped review.</p></div>}
      {message ? <p className="manager-message content-manager-message" role="status">{message}</p> : null}
    </section>
    {dialog}
  </>;
}
