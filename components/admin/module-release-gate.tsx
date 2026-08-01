"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";

export type ModuleReleaseCheck = {
  check_key: string;
  check_label: string;
  database_ready: boolean;
  enabled: boolean;
  evidence_note: string | null;
  feature_key: string;
  feature_label: string;
  feature_sort_order: number;
  guidance: string;
  missing_database_modules: string[];
  owner_label: string | null;
  release_ready: boolean;
  status: "blocked" | "in_progress" | "not_started" | "passed";
  updated_at: string;
  verified_at: string | null;
  verified_by_name: string | null;
};

const statusLabels: Record<ModuleReleaseCheck["status"], string> = {
  blocked: "Blocked",
  in_progress: "In progress",
  not_started: "Not started",
  passed: "Passed",
};

const friendlyDatabaseName = (value: string) =>
  value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export function ModuleReleaseGate({
  checks,
  migrationReady,
}: {
  checks: ModuleReleaseCheck[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const modules = Object.values(
    checks.reduce<Record<string, ModuleReleaseCheck[]>>((groups, check) => {
      groups[check.feature_key] = [...(groups[check.feature_key] ?? []), check];
      return groups;
    }, {}),
  ).sort(
    (first, second) =>
      first[0].feature_sort_order - second[0].feature_sort_order,
  );

  async function update(check: ModuleReleaseCheck) {
    const result = await ask({
      title: `Record “${check.check_label}”?`,
      description:
        "Record a concise result without passwords, OTPs, payment credentials or private member content. This change is audited.",
      confirmLabel: "Save acceptance result",
      fields: [
        {
          name: "status",
          label: "Current result",
          type: "select",
          required: true,
          initialValue: check.status,
          options: [
            { label: "Not started", value: "not_started" },
            { label: "In progress", value: "in_progress" },
            { label: "Passed", value: "passed" },
            { label: "Blocked", value: "blocked" },
          ],
          help: "Choose Passed only after completing the full check.",
        },
        {
          name: "owner",
          label: "Person or role responsible",
          type: "text",
          initialValue: check.owner_label ?? "",
          maxLength: 120,
          placeholder: "For example, Community lead",
          help: "Required while a check is in progress or blocked.",
        },
        {
          name: "evidence",
          label: "What was tested and what happened?",
          type: "textarea",
          initialValue: check.evidence_note ?? "",
          maxLength: 2000,
          placeholder:
            "Include the date, test accounts or device used, result and follow-up.",
          help: "Passed checks need at least 20 characters of useful evidence.",
        },
      ],
    });
    if (!result) return;
    const status = String(result.status);
    const owner = String(result.owner).trim();
    const evidence = String(result.evidence).trim();
    if (status === "passed" && evidence.length < 20) {
      setMessage(
        "Add at least 20 characters explaining what passed before closing this check.",
      );
      return;
    }
    if (["blocked", "in_progress"].includes(status) && !owner) {
      setMessage("Add the person or role responsible for this open check.");
      return;
    }
    const key = `${check.feature_key}:${check.check_key}`;
    setBusy(key);
    setMessage("");
    const { error } = await supabase.rpc("save_module_release_check", {
      p_check_key: check.check_key,
      p_evidence_note: evidence || null,
      p_feature_key: check.feature_key,
      p_owner_label: owner || null,
      p_status: status,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "save this module opening check")
        : `${check.feature_label} acceptance updated and audited.`,
    );
    if (!error) router.refresh();
  }

  if (!migrationReady) {
    return (
      <section className="module-release-gate" id="module-release-gate">
        <div className="admin-empty">
          <strong>Module opening checks are not installed yet</strong>
          <p>
            Apply <code>20260803050000_module_release_acceptance.sql</code>, then
            reload this page. Existing module settings will not be changed.
          </p>
        </div>
      </section>
    );
  }

  const readyCount = modules.filter((module) => module[0].release_ready).length;

  return (
    <>
      <section className="module-release-gate" id="module-release-gate">
        <header>
          <div>
            <p className="eyebrow">Controlled feature opening</p>
            <h2>Prove each member feature before opening it.</h2>
            <p>
              The database must be complete and all four real-use checks must
              pass. Supabase blocks accidental activation until both are true;
              pausing a feature is always available.
            </p>
          </div>
          <aside
            className={readyCount === modules.length ? "ready" : "attention"}
          >
            <strong>
              {readyCount}/{modules.length}
            </strong>
            <span>Modules ready to open</span>
          </aside>
        </header>

        {message ? (
          <p className="form-message" role="status">
            {message}
          </p>
        ) : null}

        <div className="module-release-list">
          {modules.map((moduleChecks) => {
            const module = moduleChecks[0];
            const passed = moduleChecks.filter(
              (check) => check.status === "passed",
            ).length;
            const state = module.enabled
              ? module.release_ready
                ? "Live and verified"
                : "Live — review required"
              : module.release_ready
                ? "Ready to open"
                : "Keep off for now";
            return (
              <details className="module-release-card" key={module.feature_key}>
                <summary>
                  <div>
                    <span className={module.release_ready ? "ready" : "attention"}>
                      {state}
                    </span>
                    <h3>{module.feature_label}</h3>
                    <p>
                      {module.database_ready
                        ? "Database ready"
                        : "Database update needed"}
                      {" · "}
                      {passed}/{moduleChecks.length} use checks passed
                    </p>
                  </div>
                  <strong aria-hidden="true">Open</strong>
                </summary>

                {!module.database_ready ? (
                  <aside className="module-database-warning">
                    <strong>Finish the database updates first</strong>
                    <p>
                      Missing: {module.missing_database_modules
                        .map(friendlyDatabaseName)
                        .join(", ")}.
                    </p>
                  </aside>
                ) : null}

                <div className="module-check-list">
                  {moduleChecks.map((check) => {
                    const key = `${check.feature_key}:${check.check_key}`;
                    return (
                      <article className={check.status} key={check.check_key}>
                        <header>
                          <span>{statusLabels[check.status]}</span>
                          {check.owner_label ? (
                            <small>{check.owner_label}</small>
                          ) : null}
                        </header>
                        <h4>{check.check_label}</h4>
                        <p>{check.guidance}</p>
                        {check.evidence_note ? (
                          <blockquote>{check.evidence_note}</blockquote>
                        ) : (
                          <small>No result recorded yet.</small>
                        )}
                        <button
                          className="secondary-action"
                          disabled={busy === key}
                          onClick={() => void update(check)}
                          type="button"
                        >
                          {busy === key ? "Saving…" : "Record result"}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </section>
      {dialog}
    </>
  );
}
