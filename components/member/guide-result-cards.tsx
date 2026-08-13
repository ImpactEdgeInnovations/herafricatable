"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  GuideCategory,
  GuideSuggestion,
} from "@/lib/table-guide-session";
import { dismissGuideSuggestion } from "@/lib/table-guide-session";

export function GuideResultCards({
  compact = false,
  suggestions,
}: {
  compact?: boolean;
  suggestions: GuideSuggestion[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const visible = suggestions
    .filter((suggestion) => !dismissed.has(`${suggestion.kind}:${suggestion.id}`))
    .slice(0, compact ? 2 : 3);

  async function dismiss(suggestion: GuideSuggestion) {
    const key = `${suggestion.kind}:${suggestion.id}`;
    if (busy) return;
    setBusy(key);
    setNotice("");
    const { error } = await supabase.rpc(
      "save_table_guide_suggestion_feedback",
      {
        p_relevant: false,
        p_target_key: suggestion.id,
        p_target_kind: suggestion.kind,
      },
    );
    setBusy("");
    if (error) {
      setNotice("That choice could not be saved just now.");
      return;
    }
    dismissGuideSuggestion(suggestion.kind, suggestion.id);
    setDismissed((current) => new Set([...current, key]));
    setNotice("Understood. Nia will not suggest that again.");
  }

  if (!visible.length)
    return notice ? (
      <small className="guide-result-notice" role="status">{notice}</small>
    ) : null;
  return (
    <div className={`guide-result-cards${compact ? " is-compact" : ""}`}>
      {visible.map((suggestion) => (
        <div className="guide-result-card" key={`${suggestion.kind}:${suggestion.id}`}>
          <Link href={suggestion.href}>
            <span>{suggestion.kind === "member" ? "Member" : suggestion.kind === "community" ? "Community" : suggestion.kind === "event" ? "Event" : "Next step"}</span>
            <strong>{suggestion.title}</strong>
            {suggestion.meta ? <small>{suggestion.meta}</small> : null}
            <p>{suggestion.description}</p>
            <b>Open <i aria-hidden="true">→</i></b>
          </Link>
          {suggestion.kind !== "page" ? (
            <button
              disabled={busy === `${suggestion.kind}:${suggestion.id}`}
              onClick={() => void dismiss(suggestion)}
              type="button"
            >
              Not for me
            </button>
          ) : null}
        </div>
      ))}
      {notice ? <small className="guide-result-notice" role="status">{notice}</small> : null}
    </div>
  );
}

export function GuideFeedback({
  category,
  compact = false,
}: {
  category?: GuideCategory;
  compact?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [choice, setChoice] = useState<"helpful" | "not_helpful" | "">("");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  if (!category) return null;

  async function record(helpful: boolean) {
    if (busy || choice) return;
    setBusy(true);
    const { error } = await supabase.rpc("record_table_guide_feedback", {
      p_category: category,
      p_helpful: helpful,
    });
    setBusy(false);
    if (error) {
      setUnavailable(true);
      return;
    }
    setChoice(helpful ? "helpful" : "not_helpful");
  }

  return (
    <div className={`guide-feedback${compact ? " is-compact" : ""}`}>
      {unavailable ? (
        <span>Feedback could not be saved just now.</span>
      ) : choice ? (
        <span>Thank you. This helps Nia improve.</span>
      ) : (
        <>
          <span>Was this useful?</span>
          <button disabled={busy} onClick={() => void record(true)} type="button">Yes</button>
          <button disabled={busy} onClick={() => void record(false)} type="button">Not really</button>
        </>
      )}
    </div>
  );
}

export function GuideCopyButton({
  compact = false,
  text,
}: {
  compact?: boolean;
  text: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={`guide-copy${compact ? " is-compact" : ""}`}
      onClick={() => void copy()}
      type="button"
    >
      {copied ? "Copied" : "Copy answer"}
    </button>
  );
}
