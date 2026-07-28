"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";

export type PrivacyRequest = {
  id: string;
  reference: string;
  request_type: string;
  reason: string | null;
  status: string;
  scheduled_for: string | null;
  reviewer_note: string | null;
  created_at: string;
};
export type ConnectionPreference = {
  request_mode: "open" | "curated_only" | "paused";
  updated_at: string | null;
};
const date = (value: string) =>
  new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));

export function AccountSettings({
  email,
  connectionPreference,
  visibilityPaused,
  requests,
}: {
  email: string;
  connectionPreference: ConnectionPreference;
  visibilityPaused: boolean;
  requests: PrivacyRequest[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [connectionMode, setConnectionMode] = useState(
    connectionPreference.request_mode,
  );
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const activeDeletion = requests.find(
    (item) =>
      item.request_type === "deletion" &&
      ["submitted", "in_review", "approved"].includes(item.status),
  );
  const { ask, dialog } = useActionDialog();
  async function visibility(paused: boolean) {
    setBusy("visibility");
    const { error } = await supabase.rpc("set_profile_visibility", {
      p_paused: paused,
    });
    setBusy("");
    setNotice(
      error
        ? memberErrorMessage(error, "change your profile visibility")
        : paused
          ? "Your profile is now hidden from member discovery."
          : "Your profile is visible to active members again.",
    );
    if (!error) router.refresh();
  }
  async function updateConnectionMode(
    mode: ConnectionPreference["request_mode"],
  ) {
    setBusy("connection-mode");
    setNotice("");
    const { error } = await supabase.rpc("set_my_connection_preferences", {
      p_request_mode: mode,
    });
    setBusy("");
    setNotice(
      error
        ? memberErrorMessage(error, "change your introduction preference")
        : mode === "open"
          ? "Members may now request an introduction directly."
          : mode === "curated_only"
            ? "Only Her Africa Table may propose new introductions."
            : "New introductions are paused. Existing connections are unchanged.",
    );
    if (!error) {
      setConnectionMode(mode);
      router.refresh();
    }
  }
  async function exportData() {
    setBusy("export");
    setNotice("");
    const { data, error } = await supabase.rpc("get_my_data_export");
    setBusy("");
    if (error) {
      setNotice(memberErrorMessage(error, "prepare your data download"));
      return;
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `her-africa-table-data-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
    setNotice("Your private JSON export was generated on this device.");
  }
  async function requestDeletion(event: FormEvent) {
    event.preventDefault();
    const result = await ask({
      title: "Submit deletion request?",
      description:
        "Your public profile will be hidden immediately and a seven-day review window will begin. Paid transaction records may be retained for legal and financial obligations.",
      confirmLabel: "Submit request",
      tone: "danger",
    });
    if (!result) return;
    setBusy("delete");
    const { error } = await supabase.rpc("request_account_deletion", {
      p_confirmation: confirmation,
      p_reason: reason,
    });
    setBusy("");
    setNotice(
      error
        ? memberErrorMessage(error, "submit your deletion request")
        : "Deletion request submitted. Your profile is hidden during the seven-day review window.",
    );
    if (!error) {
      setConfirmation("");
      setReason("");
      router.refresh();
    }
  }
  async function cancelDeletion() {
    if (!activeDeletion) return;
    setBusy("cancel");
    const { error } = await supabase.rpc("cancel_account_deletion", {
      p_request_id: activeDeletion.id,
    });
    setBusy("");
    setNotice(
      error
        ? memberErrorMessage(error, "cancel your deletion request")
        : "Deletion request cancelled.",
    );
    if (!error) router.refresh();
  }
  return (
    <div className="account-settings-shell">
      {dialog}
      <header>
        <div>
          <p className="eyebrow">Privacy and control</p>
          <h1>Account &amp; privacy.</h1>
          <p>
            Control how members find you, download your information, and manage
            important account decisions.
          </p>
        </div>
        <aside>
          <span>Directory status</span>
          <strong>{visibilityPaused ? "Hidden" : "Visible"}</strong>
          <small>
            {visibilityPaused
              ? "Other members cannot currently discover your profile."
              : "Active members can discover your public profile."}
          </small>
        </aside>
      </header>
      <section className="settings-card">
        <div>
          <p className="eyebrow">Identity</p>
          <h2>Account details</h2>
        </div>
        <dl>
          <div>
            <dt>Sign-in email</dt>
            <dd>{email}</dd>
          </div>
          <div>
            <dt>Directory visibility</dt>
            <dd>{visibilityPaused ? "Paused" : "Visible"}</dd>
          </div>
        </dl>
      </section>
      <section className="settings-card settings-action">
        <div>
          <p className="eyebrow">Member discovery</p>
          <h2>Profile visibility</h2>
          <p>
            Pausing removes you from discovery and prevents new network
            activity. Your account, event records, and existing information
            remain intact.
          </p>
        </div>
        <button
          className="button button-outline"
          disabled={busy === "visibility" || Boolean(activeDeletion)}
          onClick={() => void visibility(!visibilityPaused)}
        >
          {visibilityPaused ? "Restore visibility" : "Pause visibility"}
        </button>
      </section>
      <section className="settings-card connection-preferences-card">
        <div>
          <p className="eyebrow">Your boundaries</p>
          <h2>How would you like to connect?</h2>
          <p>
            This controls new introductions only. Existing connections,
            messages, and event participation are never removed.
          </p>
        </div>
        <div
          aria-label="Connection availability"
          className="connection-preference-options"
          role="group"
        >
          {[
            {
              description:
                "Members may send thoughtful requests and Admin may suggest introductions.",
              label: "Open to introductions",
              value: "open" as const,
            },
            {
              description:
                "Only Her Africa Table may propose a match; you still decide privately.",
              label: "Curated only",
              value: "curated_only" as const,
            },
            {
              description:
                "No new direct or curated introductions until you reopen them.",
              label: "Pause new introductions",
              value: "paused" as const,
            },
          ].map((option) => (
            <button
              aria-pressed={connectionMode === option.value}
              className={
                connectionMode === option.value ? "is-selected" : undefined
              }
              disabled={busy === "connection-mode"}
              key={option.value}
              onClick={() => void updateConnectionMode(option.value)}
              type="button"
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="settings-card settings-action">
        <div>
          <p className="eyebrow">Data portability</p>
          <h2>Download your information</h2>
          <p>
            Generate a private JSON file containing your profile, consent
            history, registrations, authored messages, support history, and
            account activity.
          </p>
        </div>
        <button
          className="button button-outline"
          disabled={busy === "export"}
          onClick={() => void exportData()}
        >
          {busy === "export" ? "Preparing…" : "Download my data"}
        </button>
      </section>
      <details className="settings-card deletion-zone" open={Boolean(activeDeletion)}>
        <summary>
          <span>
            <small>Account deletion</small>
            <strong>
              {activeDeletion
                ? "Deletion review in progress"
                : "Close your account"}
            </strong>
            <em>
              {activeDeletion
                ? `Request ${activeDeletion.reference} requires your attention.`
                : "A reviewed process with a seven-day waiting period."}
            </em>
          </span>
          <b>{activeDeletion ? "Review request" : "View options"}</b>
        </summary>
        <div className="deletion-zone-content">
          {activeDeletion ? (
            <>
              <p>
                Your request <strong>{activeDeletion.reference}</strong> is{" "}
                {activeDeletion.status.replace("_", " ")}.{" "}
                {activeDeletion.scheduled_for
                  ? `The earliest execution date is ${date(activeDeletion.scheduled_for)}.`
                  : ""}
              </p>
              {activeDeletion.reviewer_note ? (
                <p>Review note: {activeDeletion.reviewer_note}</p>
              ) : null}
              <button
                className="button button-outline"
                disabled={busy === "cancel"}
                onClick={() => void cancelDeletion()}
              >
                Cancel deletion request
              </button>
            </>
          ) : (
            <>
              <p>
                A seven-day review window begins immediately. Your public
                profile is hidden, team responsibilities must be transferred,
                and paid transaction records may be retained for financial and
                legal obligations.
              </p>
              <form onSubmit={requestDeletion}>
                <label>
                  Reason (optional)
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <label>
                  Type DELETE to confirm
                  <input
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </label>
                <button
                  className="button button-danger"
                  disabled={busy === "delete" || confirmation !== "DELETE"}
                >
                  Submit deletion request
                </button>
              </form>
            </>
          )}
        </div>
      </details>
      {requests.length ? (
        <section className="settings-history">
          <p className="eyebrow">Request history</p>
          {requests.map((item) => (
            <article key={item.id}>
              <span>{item.reference}</span>
              <strong>{item.request_type}</strong>
              <small>
                {item.status.replace("_", " ")} · {date(item.created_at)}
              </small>
            </article>
          ))}
        </section>
      ) : null}
      {notice ? (
        <p className="network-message" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
