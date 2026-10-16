"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { useAdminOperation } from "@/lib/use-admin-operation";
import { adminErrorMessage } from "@/lib/admin-error";

export type AdminPrivacyRequest = {
  request_id: string;
  reference: string;
  user_id: string;
  email: string;
  display_name: string | null;
  request_type: string;
  reason: string | null;
  status: string;
  scheduled_for: string | null;
  reviewer_note: string | null;
  created_at: string;
  updated_at: string;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

export function PrivacyOperations({
  requests,
}: {
  requests: AdminPrivacyRequest[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { ask, dialog, clearDraft } = useActionDialog({ retainDrafts: true });
  const [notice, setNotice] = useState("");
  const { busy, setBusy, runAdminAction, markSaved } = useAdminOperation<string>("", "pending", setNotice, clearDraft);

  async function manage(
    id: string,
    action: "start_review" | "approve" | "reject",
  ) {
    const actionKey = "privacy:" + id + ":" + action;
    return runAdminAction(actionKey, async () => {
      const result = await ask({ draftKey: actionKey,
        title:
          action === "start_review"
            ? "Start reviewing this request?"
            : action === "approve"
              ? "Approve this privacy request?"
              : "Reject this privacy request?",
        description:
          action === "start_review"
            ? "This records that an authorized administrator has begun handling the request."
            : action === "approve"
              ? "Approval records the decision. Account deletion still observes its cooling-off period and requires a separate final confirmation."
              : "Record a clear reason explaining why this request cannot be approved.",
        confirmLabel:
          action === "start_review"
            ? "Start review"
            : action === "approve"
              ? "Approve request"
              : "Reject request",
        tone: action === "reject" ? "danger" : "default",
        fields: [
          {
            name: "note",
            label:
              action === "reject"
                ? "Reason for rejection"
                : "Review note (optional)",
            type: "textarea",
            required: action === "reject",
            minLength: action === "reject" ? 5 : undefined,
            maxLength: 1000,
            help: "Do not copy identity documents or unrelated personal information into this note.",
          },
        ],
      });
      if (!result) return;
      setBusy(id);
      const { error } = await supabase.rpc("manage_privacy_request", {
        p_action: action,
        p_note: String(result.note ?? ""),
        p_request_id: id,
      });
      if (!error) markSaved();
      setBusy("");
      setNotice(
        error
          ? adminErrorMessage(
              error,
              `${action.replace("_", " ")} this privacy request`,
            )
          : `Request ${action.replace("_", " ")} completed.`,
      );
      if (!error) router.refresh();
    });
  }

  async function execute(item: AdminPrivacyRequest) {
    const actionKey = "privacy-execute:" + item.request_id;
    return runAdminAction(actionKey, async () => {
      const resuming=item.status==='processing';
      const result = await ask({ draftKey: actionKey,
        title: resuming ? "Retry account cleanup?" : "Permanently anonymize this account?",
        description:
          "This revokes sign-in access and removes personal profile data. Only records required for financial, security and audit obligations are retained. This cannot be undone.",
        confirmLabel: resuming ? "Retry cleanup" : "Permanently anonymize",
        tone: "danger",
        fields: resuming ? [] : [
          {
            name: "email",
            label: "Type the member email to confirm",
            type: "text",
            required: true,
            matchValue: item.email,
            maxLength: 320,
            placeholder: item.email,
            help: `Enter ${item.email} exactly.`,
          },
        ],
      });
      if (!result) return;
      setBusy(item.request_id);
      const response = await fetch("/api/admin/privacy/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestId: item.request_id }),
      });
      const payload = (await response.json()) as { error?: string };
      if (response.ok) markSaved();
      setNotice(
        response.ok
          ? "Account cleanup completed. New sign-in is blocked."
          : adminErrorMessage(payload.error, "execute this account deletion"),
      );
      router.refresh();
    });
  }

  return (
    <>
      <section className="admin-section privacy-operations">
        <div className="admin-section-heading">
          <div>
            <p className="eyebrow">Privacy operations</p>
            <h2>Rights request queue</h2>
            <p>
              Review deliberately. Deletion becomes executable only after
              approval and the seven-day cooling-off window.
            </p>
          </div>
          <span>
            {
              requests.filter(
                (item) =>
                  !["rejected", "completed", "cancelled"].includes(item.status),
              ).length
            }{" "}
            open
          </span>
        </div>
        {requests.length ? (
          <div className="privacy-request-list">
            {requests.map((item) => (
              <article key={item.request_id}>
                <div>
                  <span className={`support-state ${item.status}`}>
                    {item.status==='processing' ? 'Cleanup in progress' : item.status.replace("_", " ")}
                  </span>
                  <small>
                    {item.reference} · {item.request_type}
                  </small>
                </div>
                <div>
                  <h3>{item.display_name || item.email}</h3>
                  <p>{item.email}</p>
                  {item.reason ? <blockquote>{item.reason}</blockquote> : null}
                  <small>
                    Submitted {date(item.created_at)}
                    {item.scheduled_for
                      ? ` · Earliest deletion ${date(item.scheduled_for)}`
                      : ""}
                  </small>
                </div>
                <div className="member-actions">
                  {item.status === "submitted" ? (
                    <button
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void manage(item.request_id, "start_review")
                      }
                    >
                      Start review
                    </button>
                  ) : null}
                  {["submitted", "in_review"].includes(item.status) ? (
                    <>
                      <button
                        disabled={Boolean(busy)}
                        onClick={() => void manage(item.request_id, "approve")}
                      >
                        Approve
                      </button>
                      <button
                        disabled={Boolean(busy)}
                        onClick={() => void manage(item.request_id, "reject")}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {item.request_type==='deletion' && ["approved","processing"].includes(item.status) ? (
                    <button
                      className="danger"
                      disabled={
                        Boolean(busy) ||
                        Boolean(
                          item.scheduled_for &&
                            new Date(item.scheduled_for) > new Date(),
                        )
                      }
                      onClick={() => void execute(item)}
                    >
                      {item.status==='processing' ? 'Retry cleanup' : 'Execute deletion'}
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <strong>No privacy requests</strong>
            <p>
              Member rights requests will appear here with their review deadline
              and history.
            </p>
          </div>
        )}
        {notice ? (
          <p className="manager-message content-manager-message" role="status">
            {notice}
          </p>
        ) : null}
      </section>
      {dialog}
    </>
  );
}
