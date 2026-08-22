"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import { memberErrorMessage } from "@/lib/member-error";
import { InstallAppCard } from "@/components/pwa/install-app";

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
export type TableGuidePreference = {
  assistant_enabled: boolean;
  feature_enabled: boolean;
  recommend_me: boolean;
  remaining_today: number;
  uses_today: number;
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
  tableGuidePreference,
  tableGuideReady,
  visibilityPaused,
  requests,
}: {
  email: string;
  connectionPreference: ConnectionPreference;
  tableGuidePreference: TableGuidePreference | null;
  tableGuideReady: boolean;
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
  const [assistantEnabled, setAssistantEnabled] = useState(
    tableGuidePreference?.assistant_enabled ?? false,
  );
  const [recommendMe, setRecommendMe] = useState(
    tableGuidePreference?.recommend_me ?? false,
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
          ? "Other members can no longer find your profile."
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
  async function updateTableGuide(
    nextAssistantEnabled: boolean,
    nextRecommendMe: boolean,
  ) {
    setBusy("table-guide");
    setNotice("");
    const { error } = await supabase.rpc("set_my_table_guide_preferences", {
      p_assistant_enabled: nextAssistantEnabled,
      p_recommend_me: nextRecommendMe,
    });
    setBusy("");
    setNotice(
      error
        ? memberErrorMessage(error, "change your Table Guide choices")
        : nextAssistantEnabled
          ? nextRecommendMe
            ? "The Table Guide is on, and your visible profile may be suggested to suitable members."
            : "The Table Guide is on. Your profile is not included in its suggestions."
          : "The Table Guide is off for your account.",
    );
    if (!error) {
      setAssistantEnabled(nextAssistantEnabled);
      setRecommendMe(nextRecommendMe);
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
    setNotice("Your private copy is ready and was created on this device.");
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
          <span>Who can find you</span>
          <strong>{visibilityPaused ? "Hidden" : "Visible"}</strong>
          <small>
            {visibilityPaused
              ? "Other members cannot currently find your profile."
              : "Active members can find the details you choose to share."}
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
            <dt>Profile visibility</dt>
            <dd>{visibilityPaused ? "Paused" : "Visible"}</dd>
          </div>
        </dl>
      </section>
      <section className="settings-card settings-action">
        <div>
          <p className="eyebrow">Who can find you</p>
          <h2>Show or hide your profile</h2>
          <p>
            Pausing hides your profile from new people. Your account, event
            bookings and existing connections will stay as they are.
          </p>
        </div>
        <button
          className="button button-outline"
          disabled={busy === "visibility" || Boolean(activeDeletion)}
          onClick={() => void visibility(!visibilityPaused)}
        >
          {visibilityPaused ? "Show my profile" : "Hide my profile"}
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
                "Members may send thoughtful requests and our team may suggest introductions.",
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
      {tableGuideReady ? (
        <section className="settings-card table-guide-settings-card">
          <div>
            <p className="eyebrow">Optional member concierge</p>
            <h2>Your Table Guide choices</h2>
            <p>
              Decide whether to use the Guide and whether your visible profile may
              be suggested to members with relevant interests or goals.
            </p>
          </div>
          <div className="table-guide-setting-options">
            <button
              aria-pressed={assistantEnabled}
              disabled={busy === "table-guide"}
              onClick={() => {
                const nextAssistant = !assistantEnabled;
                void updateTableGuide(
                  nextAssistant,
                  nextAssistant ? recommendMe : false,
                );
              }}
              type="button"
            >
              <span aria-hidden="true"><i /></span>
              <strong>Use the Table Guide</strong>
              <small>
                It can answer platform questions but cannot read private messages or act for you.
              </small>
            </button>
            <button
              aria-pressed={recommendMe}
              disabled={
                busy === "table-guide" ||
                !assistantEnabled ||
                visibilityPaused ||
                connectionMode !== "open"
              }
              onClick={() => void updateTableGuide(true, !recommendMe)}
              type="button"
            >
              <span aria-hidden="true"><i /></span>
              <strong>Include me in suitable introductions</strong>
              <small>
                Requires a visible profile and Open to introductions. Only public profile details are compared.
              </small>
            </button>
          </div>
          {!tableGuidePreference?.feature_enabled ? (
            <small>The Table Guide is currently closed platform-wide. Your choices will be remembered.</small>
          ) : null}
        </section>
      ) : null}
      <InstallAppCard />
      <section className="settings-card settings-action">
        <div>
          <p className="eyebrow">Your information</p>
          <h2>Download a private copy</h2>
          <p>
            Download a private copy of your profile, choices, event bookings,
            messages and help requests.
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
