"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";

export type LaunchGateCheck = {
  category: string;
  check_key: string;
  evidence_note: string | null;
  guidance: string;
  label: string;
  owner_label: string | null;
  required: boolean;
  sort_order: number;
  status: "blocked" | "in_progress" | "not_started" | "passed";
  updated_at: string;
  verified_at: string | null;
  verified_by_name: string | null;
};

export type EnvironmentSignal = {
  label: string;
  ready: boolean;
};

const categoryLabels: Record<string, string> = {
  authentication: "Authentication",
  data_security: "Data and security",
  event_operations: "Event operations",
  experience: "Member experience",
  governance: "Governance",
  member_safety: "Safety and privacy",
  payments: "Payments",
};

const statusLabels: Record<LaunchGateCheck["status"], string> = {
  blocked: "Blocked",
  in_progress: "In progress",
  not_started: "Not started",
  passed: "Passed",
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function LaunchGateControl({
  checks,
  environmentSignals,
  migrationReady,
  release,
}: {
  checks: LaunchGateCheck[];
  environmentSignals: EnvironmentSignal[];
  migrationReady: boolean;
  release: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const required = checks.filter((check) => check.required);
  const passed = required.filter((check) => check.status === "passed").length;
  const blocked = required.filter((check) => check.status === "blocked").length;
  const decision =
    blocked > 0
      ? "Launch blocked"
      : required.length > 0 && passed === required.length
        ? "Ready for final decision"
        : "Not ready yet";
  const grouped = Object.entries(
    checks.reduce<Record<string, LaunchGateCheck[]>>((groups, check) => {
      groups[check.category] = [...(groups[check.category] ?? []), check];
      return groups;
    }, {}),
  );

  async function update(check: LaunchGateCheck) {
    const result = await ask({
      title: `Update “${check.label}”?`,
      description:
        "Record the operational outcome without including passwords, OTPs, payment credentials or private member content. Every change is audited.",
      confirmLabel: "Save launch evidence",
      fields: [
        {
          name: "status",
          label: "Current status",
          type: "select",
          required: true,
          initialValue: check.status,
          options: [
            { label: "Not started", value: "not_started" },
            { label: "In progress", value: "in_progress" },
            { label: "Passed", value: "passed" },
            { label: "Blocked", value: "blocked" },
          ],
          help: "Use Passed only after completing the full check.",
        },
        {
          name: "owner",
          label: "Accountable owner",
          type: "text",
          initialValue: check.owner_label ?? "",
          maxLength: 120,
          placeholder: "For example, Product lead",
          help: "Use a role or name; do not enter private contact details.",
        },
        {
          name: "evidence",
          label: "Evidence or blocker",
          type: "textarea",
          initialValue: check.evidence_note ?? "",
          maxLength: 2000,
          placeholder:
            "State what was tested, the result, date/device or the next action.",
          help: "Passed checks require at least 20 characters of useful evidence.",
        },
      ],
    });
    if (!result) return;
    const status = String(result.status);
    const evidence = String(result.evidence).trim();
    const owner = String(result.owner).trim();
    if (status === "passed" && evidence.length < 20) {
      setMessage(
        "Add at least 20 characters explaining what passed before closing this gate.",
      );
      return;
    }
    if (["blocked", "in_progress"].includes(status) && !owner) {
      setMessage("Add an accountable owner for work that is open or blocked.");
      return;
    }
    setBusy(check.check_key);
    setMessage("");
    const { error } = await supabase.rpc("save_launch_gate_check", {
      p_check_key: check.check_key,
      p_evidence_note: evidence || null,
      p_owner_label: owner || null,
      p_status: status,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "save this launch check")
        : `${check.label} updated and added to the audit history.`,
    );
    if (!error) router.refresh();
  }

  if (!migrationReady)
    return (
      <section className="admin-section launch-gates" id="launch-gates">
        <div className="admin-empty">
          <strong>Launch evidence is not available yet</strong>
          <p>
            Apply the launch-gate migration, then reload this workspace. Existing
            release controls are unchanged.
          </p>
        </div>
      </section>
    );

  return (
    <>
      <section className="admin-section launch-gates" id="launch-gates">
        <div className="admin-section-heading launch-gate-heading">
          <div>
            <p className="eyebrow">Auditable go-live control</p>
            <h2>Launch gates</h2>
            <p>
              Convert rehearsals and sign-offs into owned evidence. A green
              product metric never overrides an open operational blocker.
            </p>
          </div>
          <div className={`launch-decision ${blocked ? "blocked" : ""}`}>
            <strong>
              {passed}/{required.length}
            </strong>
            <span>{decision}</span>
          </div>
        </div>

        <aside className="launch-environment" aria-label="Release environment">
          <div>
            <span>Release</span>
            <strong>{release}</strong>
          </div>
          {environmentSignals.map((signal) => (
            <div className={signal.ready ? "ready" : "missing"} key={signal.label}>
              <span>{signal.label}</span>
              <strong>{signal.ready ? "Configured" : "Needs attention"}</strong>
            </div>
          ))}
        </aside>

        <div className="launch-gate-groups">
          {grouped.map(([category, categoryChecks]) => (
            <section key={category}>
              <header>
                <h3>{categoryLabels[category] ?? category}</h3>
                <span>
                  {
                    categoryChecks.filter((check) => check.status === "passed")
                      .length
                  }
                  /{categoryChecks.length} passed
                </span>
              </header>
              <div>
                {categoryChecks.map((check) => (
                  <article className={check.status} key={check.check_key}>
                    <header>
                      <span>{statusLabels[check.status]}</span>
                      {check.required ? <small>Required</small> : null}
                    </header>
                    <h4>{check.label}</h4>
                    <p>{check.guidance}</p>
                    {check.evidence_note ? (
                      <blockquote>{check.evidence_note}</blockquote>
                    ) : (
                      <div className="launch-no-evidence">
                        No evidence recorded yet.
                      </div>
                    )}
                    <footer>
                      <div>
                        <strong>{check.owner_label ?? "No owner assigned"}</strong>
                        <small>
                          {check.verified_at
                            ? `Passed ${formatDate(check.verified_at)}${check.verified_by_name ? ` by ${check.verified_by_name}` : ""}`
                            : `Updated ${formatDate(check.updated_at)}`}
                        </small>
                      </div>
                      <button
                        disabled={busy === check.check_key}
                        onClick={() => void update(check)}
                      >
                        {busy === check.check_key
                          ? "Saving…"
                          : check.evidence_note
                            ? "Update"
                            : "Record evidence"}
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
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
