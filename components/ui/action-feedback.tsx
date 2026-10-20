"use client";

import { useState, type ReactNode } from "react";

export type FeedbackTone = "success" | "error" | "notice";
export type ActionFeedbackValue = { message: string; tone: FeedbackTone };

/** Success is chosen by the operation's result, never guessed from its wording. */
export function useActionFeedback() {
  const [feedback, setFeedback] = useState<ActionFeedbackValue | null>(null);
  function setMessage(message: string, tone: FeedbackTone = "error") {
    setFeedback(message ? { message, tone } : null);
  }
  return { feedback, message: feedback?.message ?? "", setMessage };
}

export function ActionFeedback({ value, children, floating = false, onDismiss }: { value: ActionFeedbackValue | null; children?: ReactNode; floating?: boolean; onDismiss?: () => void }) {
  if (!value) return null;
  return <div className={`action-feedback action-feedback-${value.tone}${floating ? " action-feedback-floating" : ""}`} role={value.tone === "error" ? "alert" : "status"} aria-atomic="true">
    <span className="action-feedback-icon" aria-hidden="true">{value.tone === "success" ? "✓" : value.tone === "error" ? "!" : "i"}</span>
    <div><strong>{value.tone === "success" ? "All set" : value.tone === "error" ? "Please check" : "Good to know"}</strong><p>{value.message}</p>{children ? <div className="action-feedback-next">{children}</div> : null}</div>
    {onDismiss ? <button className="action-feedback-dismiss" type="button" aria-label="Dismiss this message" onClick={onDismiss}>×</button> : null}
  </div>;
}
