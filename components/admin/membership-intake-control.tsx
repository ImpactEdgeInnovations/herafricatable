"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type MembershipIntakeAdmin = {
  mode: "closed" | "manual_review" | "trusted_auto";
  pending_applications: number;
  trusted_pending_invites: number;
  updated_at: string;
  updated_by_email: string | null;
};

const choices = {
  manual_review: {
    label: "Review every request",
    summary: "Every completed application waits for your decision.",
  },
  trusted_auto: {
    label: "Welcome verified invitations automatically",
    summary: "Only a valid, unexpired invitation can skip manual review.",
  },
  closed: {
    label: "Pause new requests",
    summary: "Existing members can sign in, but new applications cannot be submitted.",
  },
} as const;

export function MembershipIntakeControl({
  configuration,
  migrationReady,
}: {
  configuration: MembershipIntakeAdmin | null;
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [selectedMode, setSelectedMode] = useState(configuration?.mode ?? "manual_review");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!migrationReady || !configuration) {
    return (
      <section className="admin-section membership-intake-control">
        <div className="admin-empty">
          <strong>Membership intake controls are not installed yet</strong>
          <p>New applications remain under manual Admin review.</p>
        </div>
      </section>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const mode = String(form.get("mode")) as keyof typeof choices;
    const choice = choices[mode];
    if (!choice) return;
    const confirmed = await ask({
      confirmLabel: mode === "closed" ? "Pause requests" : "Use this setting",
      description: `${choice.summary} Existing member access and submitted applications are not removed.`,
      title: `Change membership intake to “${choice.label}”?`,
      tone: mode === "closed" ? "danger" : "default",
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("set_membership_intake_mode", {
      p_mode: mode,
      p_reason: `Membership intake changed to ${mode} from the Admin People workspace`,
    });
    setBusy(false);
    setMessage(
      error
        ? adminErrorMessage(error, "change how membership requests are reviewed")
        : "Membership intake updated and recorded.",
    );
    if (!error) router.refresh();
  }

  return (
    <section className="admin-section membership-intake-control" id="membership-intake">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Who enters the table</p>
          <h2>Membership intake</h2>
          <p>Choose how new membership requests are handled. Email verification alone never grants member access.</p>
        </div>
        <span className="status-count">{choices[configuration.mode].label}</span>
      </div>

      <div className="membership-intake-layout">
        <form onSubmit={save}>
          <label>
            New membership requests
            <select
              name="mode"
              onChange={(event) => setSelectedMode(event.target.value as keyof typeof choices)}
              value={selectedMode}
            >
              <option value="manual_review">Review every request</option>
              <option value="trusted_auto">Auto-welcome verified invitations</option>
              <option value="closed">Pause new requests</option>
            </select>
          </label>
          <p>{choices[selectedMode].summary}</p>
          <button className="button button-primary" disabled={busy} type="submit">
            {busy ? "Saving…" : "Save intake choice"}
          </button>
        </form>

        <aside aria-label="Membership intake activity">
          <div><strong>{configuration.pending_applications}</strong><span>Requests waiting</span></div>
          <div><strong>{configuration.trusted_pending_invites}</strong><span>Verified invitations ready</span></div>
          <small>
            Last changed {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(configuration.updated_at))}
            {configuration.updated_by_email ? ` by ${configuration.updated_by_email}` : ""}.
          </small>
        </aside>
      </div>
      {message ? <p className="admin-form-message" role="status">{message}</p> : null}
      {dialog}
    </section>
  );
}
