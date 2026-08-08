"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityReleaseCheck = {
  active_moderator_count: number;
  active_owner_count: number;
  check_key: string;
  community_status: "archived" | "draft" | "published";
  evidence_note: string | null;
  feature_enabled: boolean;
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

const statusLabels: Record<CommunityReleaseCheck["status"], string> = {
  blocked: "Blocked",
  in_progress: "In progress",
  not_started: "Not started",
  passed: "Passed",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CommunityReleaseGate({
  checks,
  communityId,
  communityName,
  migrationReady,
}: {
  checks: CommunityReleaseCheck[];
  communityId: string | null;
  communityName: string | null;
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const context = checks[0];
  const required = checks.filter((check) => check.required);
  const passed = required.filter((check) => check.status === "passed").length;
  const blocked = required.filter((check) => check.status === "blocked").length;
  const hostReady =
    Number(context?.active_owner_count ?? 0) === 1 &&
    Number(context?.active_moderator_count ?? 0) >= 1;
  const ready =
    required.length === 8 && passed === required.length && hostReady;

  async function update(check: CommunityReleaseCheck) {
    const result = await ask({
      title: `Update “${check.label}”?`,
      description:
        "Record what happened without passwords, one-time codes, private member content or private system keys. Every change is saved.",
      confirmLabel: "Save acceptance evidence",
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
          help: "Choose Passed only after the full check succeeds.",
        },
        {
          name: "owner",
          label: "Accountable owner",
          type: "text",
          initialValue: check.owner_label ?? "",
          maxLength: 120,
          placeholder: "For example, Community operations lead",
          help: "Use a name or role, not private contact details.",
        },
        {
          name: "evidence",
          label: "Evidence or blocker",
          type: "textarea",
          initialValue: check.evidence_note ?? "",
          maxLength: 2000,
          placeholder:
            "State who tested what, the environment/device, outcome and date.",
          help: "Passed checks require at least 20 characters of clear evidence.",
        },
      ],
    });
    if (!result || !communityId) return;
    const status = String(result.status);
    const owner = String(result.owner).trim();
    const evidence = String(result.evidence).trim();
    if (status === "passed" && evidence.length < 20) {
      setMessage("Add clear evidence before marking this check passed.");
      return;
    }
    if (["blocked", "in_progress"].includes(status) && !owner) {
      setMessage("Assign an accountable owner while work is open or blocked.");
      return;
    }
    setBusy(check.check_key);
    setMessage("");
    const { error } = await supabase.rpc("save_community_release_check", {
      p_check_key: check.check_key,
      p_community_id: communityId,
      p_evidence_note: evidence || null,
      p_owner_label: owner || null,
      p_status: status,
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "save this Community acceptance check")
        : `${check.label} updated and added to the audit history.`,
    );
    if (!error) router.refresh();
  }

  async function changePublication() {
    if (!communityId || !context) return;
    const publishing = context.community_status !== "published";
    const confirmed = await ask({
      title: publishing
        ? `Publish ${communityName ?? "this community"}?`
        : `Return ${communityName ?? "this community"} to draft?`,
      description: publishing
        ? "Publication is allowed only after all eight checks pass and both the host and backup moderator are active. Community feature access remains a separate global control."
        : "The room remains preserved for existing members, but it will no longer be offered as a published community.",
      confirmLabel: publishing ? "Publish accepted community" : "Return to draft",
      tone: publishing ? "default" : "danger",
    });
    if (!confirmed) return;
    setBusy("publication");
    setMessage("");
    const { error } = await supabase.rpc(
      "publish_community_after_acceptance",
      {
        p_community_id: communityId,
        p_publish: publishing,
      },
    );
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "change this Community release state")
        : publishing
          ? "Community acceptance approved and publication audited."
          : "Community returned to controlled draft.",
    );
    if (!error) router.refresh();
  }

  if (!migrationReady) {
    return (
      <section className="community-release-gate">
        <div className="admin-empty">
          <strong>Community acceptance evidence is awaiting its database update</strong>
          <p>
            Existing cohort controls are unchanged. Apply the latest Community
            release migration, then return here.
          </p>
        </div>
      </section>
    );
  }

  if (!communityId || !context) return null;

  return (
    <>
      <section
        className="community-release-gate"
        aria-labelledby="community-release-title"
      >
        <header>
          <div>
            <p className="eyebrow">Nairobi release acceptance</p>
            <h2 id="community-release-title">Prove the room is ready.</h2>
            <p>
              Evidence—not activity volume—controls publication. Every check is
              private to Super Admin and every update is audited.
            </p>
          </div>
          <aside className={blocked ? "blocked" : ready ? "ready" : ""}>
            <strong>
              {passed}/{required.length}
            </strong>
            <span>
              {blocked
                ? "Release blocked"
                : ready
                  ? "Ready to publish"
                  : "Acceptance open"}
            </span>
            <small>
              {context.community_status} ·{" "}
              {context.feature_enabled
                ? "member access enabled"
                : "member access controlled"}
            </small>
          </aside>
        </header>

        <div className="community-release-hosts">
          <div className={Number(context.active_owner_count) === 1 ? "ready" : ""}>
            <span>Named host</span>
            <strong>
              {Number(context.active_owner_count) === 1
                ? "Assigned"
                : "Needs attention"}
            </strong>
          </div>
          <div className={Number(context.active_moderator_count) >= 1 ? "ready" : ""}>
            <span>Backup moderator</span>
            <strong>
              {Number(context.active_moderator_count) >= 1
                ? "Assigned"
                : "Required"}
            </strong>
          </div>
          <p>
            Publishing is database-blocked until all checks pass and host
            coverage is complete.
          </p>
        </div>

        <div className="community-release-checks">
          {checks.map((check) => (
            <article className={check.status} key={check.check_key}>
              <header>
                <span>{statusLabels[check.status]}</span>
                <small>Required</small>
              </header>
              <h3>{check.label}</h3>
              <p>{check.guidance}</p>
              {check.evidence_note ? (
                <blockquote>{check.evidence_note}</blockquote>
              ) : (
                <div>No evidence recorded yet.</div>
              )}
              <footer>
                <span>
                  <strong>{check.owner_label ?? "No owner assigned"}</strong>
                  <small>
                    {check.verified_at
                      ? `Passed ${formatDate(check.verified_at)}${check.verified_by_name ? ` by ${check.verified_by_name}` : ""}`
                      : `Updated ${formatDate(check.updated_at)}`}
                  </small>
                </span>
                <button
                  disabled={busy === check.check_key}
                  onClick={() => void update(check)}
                  type="button"
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

        <footer className="community-release-decision">
          <div>
            <strong>
              {context.community_status === "published"
                ? "This community is published."
                : ready
                  ? "Every release condition is satisfied."
                  : "Publication remains locked."}
            </strong>
            <p>
              Global Community availability is managed separately in{" "}
              <Link href="/admin/programs">Programmes and benefits</Link>.
            </p>
          </div>
          <button
            className={
              context.community_status === "published"
                ? "button button-outline"
                : "button button-primary"
            }
            disabled={
              busy === "publication" ||
              (context.community_status !== "published" && !ready)
            }
            onClick={() => void changePublication()}
            type="button"
          >
            {busy === "publication"
              ? "Saving…"
              : context.community_status === "published"
                ? "Return to controlled draft"
                : "Publish accepted community"}
          </button>
        </footer>

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
