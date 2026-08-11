"use client";

import { FormEvent, useState } from "react";
import { memberErrorMessage } from "@/lib/member-error";

const options = [
  ["welcome", "Welcome new members"],
  ["discussion", "Start a useful conversation"],
  ["event", "Outline an event"],
  ["recap", "Write a short recap"],
] as const;

export function CommunityHostAssistant({ communityId }: { communityId: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setCopied(false);
    setMessage("");
    try {
      const response = await fetch("/api/table-guide/host-draft", {
        body: JSON.stringify({
          communityId,
          notes: form.get("notes"),
          task: form.get("task"),
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const result = (await response.json()) as { draft?: string; error?: string };
      if (!response.ok || !result.draft) throw new Error(result.error || "Draft unavailable");
      setDraft(result.draft);
      setMessage("Draft ready. Read it carefully and change anything that does not sound like you.");
    } catch (error) {
      setMessage(memberErrorMessage(error, "prepare this draft"));
    } finally {
      setBusy(false);
    }
  }

  async function copyDraft() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
  }

  return (
    <section className="community-host-panel host-writing-assistant" id="writing-help">
      <header>
        <div>
          <p className="eyebrow">Writing help from Nia</p>
          <h2>Begin with a thoughtful draft.</h2>
        </div>
        <p>Nia prepares words. You decide what is true, make changes and publish it yourself.</p>
      </header>
      <div className="host-writing-layout">
        <form onSubmit={(event) => void generate(event)}>
          <label>
            What are you preparing?
            <select name="task" defaultValue="discussion">
              {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            What should Nia know?
            <textarea
              maxLength={1800}
              name="notes"
              placeholder="For example: We met last Saturday to discuss exporting beauty products across East Africa."
            />
          </label>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Preparing…" : "Prepare a draft"}
          </button>
        </form>
        <div className="host-writing-draft">
          <span>Your private draft</span>
          {draft ? (
            <>
              <textarea aria-label="Generated draft" onChange={(event) => setDraft(event.target.value)} value={draft} />
              <button className="button button-outline" onClick={() => void copyDraft()} type="button">
                {copied ? "Copied" : "Copy draft"}
              </button>
            </>
          ) : <p>Your draft will appear here. Nothing is posted or sent automatically.</p>}
        </div>
      </div>
      {message ? <p className="community-host-message" role="status">{message}</p> : null}
    </section>
  );
}
