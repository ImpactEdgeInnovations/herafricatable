"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

export type EventQuestion = {
  question_id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  body: string;
  question_status: "open" | "answered" | "hidden";
  answer_body: string | null;
  answerer_name: string | null;
  support_count: number;
  supported_by_me: boolean;
  can_manage: boolean;
  created_at: string;
  answered_at: string | null;
};

export function EventQuestions({
  canAsk,
  currentUserId,
  eventId,
  eventSlug,
  gatheringHref,
  initialQuestions,
  migrationReady,
}: {
  canAsk: boolean;
  currentUserId: string | null;
  eventId: string;
  eventSlug: string;
  gatheringHref?: string | null;
  initialQuestions: EventQuestion[];
  migrationReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [composerOpen, setComposerOpen] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  if (gatheringHref) {
    return (
      <section className="event-questions event-questions-community" id="questions">
        <div>
          <p className="eyebrow">Questions and conversation</p>
          <h2>Join this event’s Gathering room.</h2>
          <p>Questions, useful updates and the live text conversation stay together inside your Community.</p>
        </div>
        <Link className="button button-primary" href={gatheringHref}>Open Gathering room</Link>
      </section>
    );
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy("submit");
    setMessage("");
    const { error } = await supabase.rpc("submit_event_question", {
      p_body: data.get("body"),
      p_event_id: eventId,
    });
    setBusy("");
    if (error) return setMessage(memberErrorMessage(error, "send your question"));
    form.reset();
    setComposerOpen(false);
    setMessage("Your question is now with the Host.");
    router.refresh();
  }

  async function support(question: EventQuestion) {
    setBusy(`support-${question.question_id}`);
    setMessage("");
    const { error } = await supabase.rpc("toggle_event_question_support", { p_question_id: question.question_id });
    setBusy("");
    if (error) return setMessage(memberErrorMessage(error, "support this question"));
    router.refresh();
  }

  async function answer(event: FormEvent<HTMLFormElement>, question: EventQuestion) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(`answer-${question.question_id}`);
    setMessage("");
    const { error } = await supabase.rpc("answer_event_question", {
      p_answer: data.get("answer"),
      p_question_id: question.question_id,
    });
    setBusy("");
    if (error) return setMessage(memberErrorMessage(error, "answer this question"));
    setAnsweringId(null);
    setMessage("Your answer is now visible to members.");
    router.refresh();
  }

  async function hide(question: EventQuestion) {
    const confirmed = await ask({
      title: "Hide this question?",
      description: "It will leave the public event page immediately. A safety audit record remains.",
      confirmLabel: "Hide question",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusy(`hide-${question.question_id}`);
    const { error } = await supabase.rpc("hide_event_question", { p_question_id: question.question_id });
    setBusy("");
    setMessage(error ? memberErrorMessage(error, "hide this question") : "Question hidden.");
    if (!error) router.refresh();
  }

  async function report(question: EventQuestion) {
    const result = await ask({
      title: "Report this question privately?",
      description: "Only the Her Africa Table safety team will receive your report.",
      confirmLabel: "Send private report",
      tone: "danger",
      fields: [
        { initialValue: "safety", label: "What is the concern?", name: "reason", options: [
          { label: "Safety concern", value: "safety" }, { label: "Harassment", value: "harassment" },
          { label: "Privacy", value: "privacy" }, { label: "Spam", value: "spam" }, { label: "Other", value: "other" },
        ], required: true, type: "select" },
        { help: "Share what happened without adding anyone else’s private information.", label: "What happened?", maxLength: 1000, minLength: 10, name: "details", required: true, type: "textarea" },
      ],
    });
    if (!result) return;
    setBusy(`report-${question.question_id}`);
    const { error } = await supabase.rpc("report_event_question", {
      p_details: result.details,
      p_question_id: question.question_id,
      p_reason: result.reason,
    });
    setBusy("");
    setMessage(error ? memberErrorMessage(error, "send this private report") : "Your report was sent privately.");
  }

  return (
    <section className="event-questions" id="questions" aria-labelledby="event-questions-title">
      <header>
        <div>
          <p className="eyebrow">Questions for the Host</p>
          <h2 id="event-questions-title">Ask before you arrive.</h2>
          <p>Ask about the programme, access or what to expect. Support a question instead of repeating it.</p>
        </div>
        {canAsk && migrationReady ? (
          <button className="button button-primary" onClick={() => setComposerOpen((open) => !open)} type="button">
            {composerOpen ? "Close" : "Ask a question"}
          </button>
        ) : null}
      </header>

      {!migrationReady ? <p className="event-question-note">Questions for the Host are being prepared.</p> : null}
      {!currentUserId ? <p className="event-question-note"><Link href={`/sign-in?next=${encodeURIComponent(`/events/${eventSlug}#questions`)}`}>Sign in</Link> with your approved email to ask or support a question.</p> : null}
      {composerOpen ? (
        <form className="event-question-composer" onSubmit={(event) => void submitQuestion(event)}>
          <label><span>Your question</span><textarea autoFocus maxLength={600} minLength={10} name="body" placeholder="What would you like the Host to clarify?" required rows={3} /></label>
          <div><small>Do not include phone numbers, addresses or another person’s private details.</small><button className="button button-primary" disabled={busy === "submit"} type="submit">{busy === "submit" ? "Sending…" : "Send question"}</button></div>
        </form>
      ) : null}
      {message ? <p className="form-message" role="status">{message}</p> : null}

      {initialQuestions.length ? (
        <div className="event-question-list">
          {initialQuestions.map((question) => (
            <article className={question.question_status === "answered" ? "is-answered" : undefined} key={question.question_id}>
              <header><div className="event-question-avatar" aria-hidden="true">{question.author_name.slice(0, 1)}</div><div><strong>{question.author_name}</strong><time>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" }).format(new Date(question.created_at))}</time></div><span>{question.question_status === "answered" ? "Answered" : "For the Host"}</span></header>
              <p>{question.body}</p>
              {question.answer_body ? <blockquote><span>Host answer{question.answerer_name ? ` · ${question.answerer_name}` : ""}</span><p>{question.answer_body}</p></blockquote> : null}
              <footer>
                <button disabled={busy === `support-${question.question_id}`} onClick={() => void support(question)} type="button">{question.supported_by_me ? "Supported" : "I’d like this answered"} · {Number(question.support_count)}</button>
                {question.can_manage ? <><button onClick={() => setAnsweringId(answeringId === question.question_id ? null : question.question_id)} type="button">{question.answer_body ? "Update answer" : "Answer"}</button><button className="danger-link" disabled={busy === `hide-${question.question_id}`} onClick={() => void hide(question)} type="button">Hide</button></> : question.author_id !== currentUserId ? <button className="quiet-link" disabled={busy === `report-${question.question_id}`} onClick={() => void report(question)} type="button">Report privately</button> : null}
              </footer>
              {answeringId === question.question_id ? <form className="event-question-answer" onSubmit={(event) => void answer(event, question)}><label><span>Your answer</span><textarea defaultValue={question.answer_body ?? ""} maxLength={1200} minLength={2} name="answer" required rows={3} /></label><button className="button button-primary" disabled={busy === `answer-${question.question_id}`} type="submit">Publish answer</button></form> : null}
            </article>
          ))}
        </div>
      ) : migrationReady ? <div className="event-question-empty"><strong>No questions yet.</strong><p>If something would help other guests too, ask the Host here.</p></div> : null}
      {dialog}
    </section>
  );
}
