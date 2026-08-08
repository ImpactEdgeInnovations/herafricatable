"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type CommunityCheckInOption = {
  option_id: string;
  label: string;
  position: number;
  response_count: number | null;
};

export type CommunityCheckIn = {
  check_in_id: string;
  creator_id: string;
  creator_name: string;
  question: string;
  status: "open" | "closed";
  closes_at: string | null;
  created_at: string;
  response_count: number;
  results_visible: boolean;
  my_option_id: string | null;
  can_close: boolean;
  can_remove: boolean;
  options: CommunityCheckInOption[];
};

export function CommunityCheckIns({
  checkIns,
  communityId,
  currentUserId,
}: {
  checkIns: CommunityCheckIn[];
  communityId: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [composerOpen, setComposerOpen] = useState(false);
  const [choices, setChoices] = useState(["", ""]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("create");
    setMessage("");
    const duration = String(data.get("duration") ?? "7");
    const { error } = await supabase.rpc("create_community_check_in", {
      p_community_id: communityId,
      p_duration_days: duration === "open" ? null : Number(duration),
      p_options: choices.map((choice) => choice.trim()).filter(Boolean),
      p_question: data.get("question"),
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "start this check-in")
        : "Your check-in is open. Members can answer when it suits them.",
    );
    if (!error) {
      form.reset();
      setChoices(["", ""]);
      setComposerOpen(false);
      router.refresh();
    }
  }

  async function respond(checkIn: CommunityCheckIn, optionId: string) {
    if (checkIn.status !== "open") return;
    const action = `respond-${checkIn.check_in_id}`;
    setBusy(action);
    setMessage("");
    const { error } = await supabase.rpc("respond_to_community_check_in", {
      p_check_in_id: checkIn.check_in_id,
      p_option_id: optionId,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "save your answer")
        : "Your answer is saved privately. You can change it while the check-in is open.",
    );
    if (!error) router.refresh();
  }

  async function close(checkIn: CommunityCheckIn) {
    const confirmed = await ask({
      title: "Close this check-in?",
      description:
        "Members will still see the identity-private result, but no one can add or change an answer.",
      confirmLabel: "Close check-in",
    });
    if (!confirmed) return;
    const action = `close-${checkIn.check_in_id}`;
    setBusy(action);
    setMessage("");
    const { error } = await supabase.rpc("close_community_check_in", {
      p_check_in_id: checkIn.check_in_id,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "close this check-in")
        : "Check-in closed.",
    );
    if (!error) router.refresh();
  }

  async function remove(checkIn: CommunityCheckIn) {
    const confirmed = await ask({
      title: "Remove this check-in?",
      description:
        "It will disappear from the Community immediately. The safety audit record is retained.",
      confirmLabel: "Remove check-in",
      tone: "danger",
    });
    if (!confirmed) return;
    const action = `remove-${checkIn.check_in_id}`;
    setBusy(action);
    setMessage("");
    const { error } = await supabase.rpc("remove_community_check_in", {
      p_check_in_id: checkIn.check_in_id,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "remove this check-in")
        : "Check-in removed from the Community.",
    );
    if (!error) router.refresh();
  }

  async function report(checkIn: CommunityCheckIn) {
    const result = await ask({
      title: "Report this check-in privately?",
      description:
        "Only the Her Africa Table safety team will receive your reason and a copy of the question and choices. Member answers are never included.",
      confirmLabel: "Send private report",
      tone: "danger",
      fields: [
        {
          initialValue: "safety",
          label: "What is the concern?",
          name: "category",
          options: [
            { label: "Safety concern", value: "safety" },
            { label: "Harassment", value: "harassment" },
            { label: "Privacy", value: "privacy" },
            { label: "Spam", value: "spam" },
            { label: "Misinformation", value: "misinformation" },
            { label: "Other", value: "other" },
          ],
          required: true,
          type: "select",
        },
        {
          help: "Tell the Her Africa Table safety team what happened. Do not add another member’s private information.",
          label: "What happened?",
          maxLength: 2000,
          minLength: 10,
          name: "details",
          required: true,
          type: "textarea",
        },
      ],
    });
    if (!result) return;
    const action = `report-${checkIn.check_in_id}`;
    setBusy(action);
    setMessage("");
    const { error } = await supabase.rpc("report_community_check_in", {
      p_category: result.category,
      p_check_in_id: checkIn.check_in_id,
      p_details: result.details,
    });
    setBusy("");
    setMessage(
      error
        ? memberErrorMessage(error, "send this private report")
        : "Your report was sent privately to the Her Africa Table safety team.",
    );
  }

  return (
    <section className="community-check-ins" id="check-ins">
      <header>
        <div>
          <p className="eyebrow">Quick check-ins</p>
          <h2>Ask one clear question.</h2>
          <p>
            Make a small decision, understand what members need or choose a
            useful next topic. Answers never reveal member names.
          </p>
        </div>
        <button
          aria-expanded={composerOpen}
          className="button button-outline"
          onClick={() => setComposerOpen((open) => !open)}
          type="button"
        >
          {composerOpen ? "Close" : "Start a check-in"}
        </button>
      </header>

      {composerOpen ? (
        <form className="community-check-in-composer" onSubmit={(event) => void create(event)}>
          <label className="community-check-in-question">
            <span>Your question</span>
            <input
              maxLength={220}
              minLength={10}
              name="question"
              placeholder="What would be most useful for our next session?"
              required
            />
          </label>
          <fieldset>
            <legend>Answer choices</legend>
            {choices.map((choice, index) => (
              <label key={index}>
                <span>Choice {index + 1}</span>
                <input
                  aria-label={`Choice ${index + 1}`}
                  maxLength={100}
                  onChange={(event) =>
                    setChoices((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? event.target.value : item,
                      ),
                    )
                  }
                  required={index < 2}
                  value={choice}
                />
                {choices.length > 2 ? (
                  <button
                    aria-label={`Remove choice ${index + 1}`}
                    onClick={() =>
                      setChoices((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                ) : null}
              </label>
            ))}
            {choices.length < 6 ? (
              <button
                className="community-check-in-add-choice"
                onClick={() => setChoices((current) => [...current, ""])}
                type="button"
              >
                + Add another choice
              </button>
            ) : null}
          </fieldset>
          <footer>
            <label>
              <span>Keep answers open for</span>
              <select defaultValue="7" name="duration">
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="open">Until I close it</option>
              </select>
            </label>
            <div>
              <small>Up to three check-ins each week</small>
              <button className="button button-primary" disabled={busy === "create"}>
                {busy === "create" ? "Opening…" : "Open check-in"}
              </button>
            </div>
          </footer>
        </form>
      ) : null}

      {message ? <p className="community-check-in-message" role="status">{message}</p> : null}

      {checkIns.length ? (
        <div className="community-check-in-list">
          {checkIns.map((checkIn) => {
            const total = Number(checkIn.response_count);
            const open = checkIn.status === "open";
            return (
              <article className={open ? "is-open" : "is-closed"} key={checkIn.check_in_id}>
                <header>
                  <div>
                    <span>{open ? "Open check-in" : "Closed"}</span>
                    <h3>{checkIn.question}</h3>
                    <p>
                      Started by {checkIn.creator_name} · {total}{" "}
                      {total === 1 ? "answer" : "answers"}
                    </p>
                  </div>
                  {checkIn.can_close || checkIn.can_remove ? (
                    <div className="community-check-in-controls">
                      {open && checkIn.can_close ? (
                        <button
                          disabled={busy === `close-${checkIn.check_in_id}`}
                          onClick={() => void close(checkIn)}
                          type="button"
                        >
                          Close
                        </button>
                      ) : null}
                      {checkIn.can_remove ? (
                        <button
                          className="danger-action"
                          disabled={busy === `remove-${checkIn.check_in_id}`}
                          onClick={() => void remove(checkIn)}
                          type="button"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </header>
                <div className="community-check-in-options">
                  {checkIn.options.map((option) => {
                    const selected = checkIn.my_option_id === option.option_id;
                    const count = Number(option.response_count ?? 0);
                    const percentage = total ? Math.round((count / total) * 100) : 0;
                    return (
                      <button
                        aria-pressed={selected}
                        className={selected ? "is-selected" : ""}
                        disabled={!open || busy === `respond-${checkIn.check_in_id}`}
                        key={option.option_id}
                        onClick={() => void respond(checkIn, option.option_id)}
                        type="button"
                      >
                        {checkIn.results_visible ? (
                          <i aria-hidden="true" style={{ width: `${percentage}%` }} />
                        ) : null}
                        <span>{option.label}</span>
                        <strong>
                          {checkIn.results_visible
                            ? `${percentage}%`
                            : selected
                              ? "Your answer"
                              : "Choose"}
                        </strong>
                      </button>
                    );
                  })}
                </div>
                <footer>
                  <span>
                    {checkIn.results_visible
                      ? "Results show totals only—never who chose an answer."
                      : "Results appear after at least three members answer."}
                  </span>
                  {open && checkIn.my_option_id ? <em>You can change your answer</em> : null}
                  {checkIn.creator_id !== currentUserId ? (
                    <button
                      disabled={busy === `report-${checkIn.check_in_id}`}
                      onClick={() => void report(checkIn)}
                      type="button"
                    >
                      Report privately
                    </button>
                  ) : null}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="community-check-in-empty">
          <strong>No check-in is open yet.</strong>
          <p>Start with one question that helps the Community make a useful decision.</p>
        </div>
      )}
      {dialog}
    </section>
  );
}
