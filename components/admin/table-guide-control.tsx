"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useActionDialog } from "@/components/ui/action-dialog";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";

export type TableGuideAdmin = {
  assistant_members: number;
  feature_enabled: boolean;
  handoffs_24h: number;
  last_used_at: string | null;
  recommended_members: number;
  refusals_24h: number;
  requests_24h: number;
};

export function TableGuideControl({
  configuration,
  keyConfigured,
  migrationReady,
}: {
  configuration: TableGuideAdmin | null;
  keyConfigured: boolean;
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [busy, setBusy] = useState<"" | "test" | "toggle">("");
  const [notice, setNotice] = useState("");

  async function toggle() {
    if (!configuration) return;
    const nextEnabled = !configuration.feature_enabled;
    const confirmed = await ask({
      title: nextEnabled ? "Open the Table Guide?" : "Close the Table Guide?",
      description: nextEnabled
        ? "Approved members who opt in may ask questions. Recommendations remain limited to visible members who separately opt in and accept direct introductions."
        : "Members will no longer be able to ask the Guide. Their consent choices and privacy-safe usage totals will remain preserved.",
      confirmLabel: nextEnabled ? "Open the Guide" : "Close the Guide",
      tone: nextEnabled ? "default" : "danger",
    });
    if (!confirmed) return;
    setBusy("toggle");
    setNotice("");
    const { error } = await supabase.rpc("set_feature_flag", {
      p_enabled: nextEnabled,
      p_key: "table_guide",
    });
    setBusy("");
    setNotice(
      error
        ? adminErrorMessage(error, "change the Table Guide availability")
        : nextEnabled
          ? "The Table Guide is now open to members who opt in."
          : "The Table Guide is closed platform-wide.",
    );
    if (!error) router.refresh();
  }

  async function testConnection() {
    setBusy("test");
    setNotice("");
    try {
      const response = await fetch("/api/admin/table-guide/test", { method: "POST" });
      const result = (await response.json()) as { error?: string; model?: string; ready?: boolean };
      setNotice(
        response.ok && result.ready
          ? `Nia can reach OpenAI using ${result.model}. Member questions are ready.`
          : result.error ?? "The AI connection test did not complete.",
      );
    } catch {
      setNotice("The AI connection test could not start. Try again shortly.");
    } finally {
      setBusy("");
    }
  }

  if (!migrationReady || !configuration) {
    return (
      <section className="admin-section table-guide-admin">
        <header className="admin-section-heading">
          <div>
            <p className="eyebrow">Member concierge</p>
            <h2>Table Guide</h2>
          </div>
        </header>
        <div className="admin-empty">
          <strong>Table Guide controls are not installed yet</strong>
          <p>Run the latest Supabase migration before opening this feature.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-section table-guide-admin">
      {dialog}
      <header className="admin-section-heading">
        <div>
          <p className="eyebrow">Member concierge</p>
          <h2>Table Guide</h2>
          <p>
            A consent-led guide for member questions and thoughtful introductions.
            Prompts and responses are not stored in Her Africa Table.
          </p>
        </div>
        <span className={configuration.feature_enabled ? "ready" : "pending"}>
          {configuration.feature_enabled ? "Open" : "Closed"}
        </span>
      </header>
      <div className="table-guide-admin-metrics">
        <article><strong>{configuration.assistant_members}</strong><span>Members opted in</span></article>
        <article><strong>{configuration.recommended_members}</strong><span>Open to suggestions</span></article>
        <article><strong>{configuration.requests_24h}</strong><span>Questions · 24 hours</span></article>
        <article><strong>{configuration.handoffs_24h}</strong><span>Human handoffs</span></article>
      </div>
      <div className="table-guide-admin-readiness">
        <span className={keyConfigured ? "ready" : "blocked"}>
          <i aria-hidden="true" />
          {keyConfigured
            ? "AI safety configuration ready"
            : "OPENAI_API_KEY or AI_SAFETY_SALT missing in Vercel"}
        </span>
        <span className="ready"><i aria-hidden="true" />Consent required per member</span>
        <span className="ready"><i aria-hidden="true" />Private messages excluded</span>
        <span className="ready"><i aria-hidden="true" />Admin off-switch available</span>
      </div>
      <div className="table-guide-admin-actions">
        <button
          className={
            configuration.feature_enabled
              ? "button button-outline"
              : "button button-primary"
          }
          disabled={Boolean(busy) || (!keyConfigured && !configuration.feature_enabled)}
          onClick={() => void toggle()}
        >
          {busy === "toggle"
            ? "Saving…"
            : configuration.feature_enabled
              ? "Close the Table Guide"
              : "Open the Table Guide"}
        </button>
        <button
          className="button button-outline"
          disabled={Boolean(busy) || !keyConfigured}
          onClick={() => void testConnection()}
          type="button"
        >
          {busy === "test" ? "Testing…" : "Test AI connection"}
        </button>
      </div>
      {notice ? <p className="network-message" role="status">{notice}</p> : null}
    </section>
  );
}
