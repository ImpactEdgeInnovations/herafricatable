"use client";
import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AdminEvent } from "@/components/admin/event-manager";
import { useActionDialog } from "@/components/ui/action-dialog";
export type AdminEventFeedback = {
  connection_rating: number;
  feedback_id: string;
  followup_note: string | null;
  followup_status: string | null;
  highlight: string | null;
  improvement: string | null;
  member_email: string;
  member_name: string | null;
  overall_rating: number;
  relevance_rating: number;
  submitted_at: string;
  testimonial_consent: string;
  testimonial_quote: string | null;
  testimonial_status: string;
  user_id: string;
  would_recommend: boolean;
};
export type EventFeedbackSummary = {
  average_connections: number | null;
  average_overall: number | null;
  average_relevance: number | null;
  event_id: string;
  open_followups: number;
  pending_testimonials: number;
  recommendation_percent: number | null;
  response_count: number;
};
export type EventRecap = {
  event_id: string;
  highlights: string[];
  status: string;
  summary: string;
  title: string;
};
export function EventFeedbackManager({
  events,
  feedback,
  summaries,
  recaps,
  migrationReady,
}: {
  events: AdminEvent[];
  feedback: (AdminEventFeedback & { event_id: string })[];
  summaries: EventFeedbackSummary[];
  recaps: EventRecap[];
  migrationReady: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const selected = events.find((event) => event.id === eventId);
  const rows = feedback.filter((item) => item.event_id === eventId);
  const summary = summaries.find((item) => item.event_id === eventId);
  const recap = recaps.find((item) => item.event_id === eventId);
  async function saveRecap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("recap");
    const { error } = await supabase.rpc("save_event_recap", {
      p_event_id: eventId,
      p_highlights: String(form.get("highlights") || "").split("\n"),
      p_status: form.get("status"),
      p_summary: form.get("summary"),
      p_title: form.get("title"),
    });
    setBusy("");
    setMessage(error ? error.message : "Event recap saved.");
    if (!error) window.location.reload();
  }
  async function review(
    id: string,
    action:
      | "approve_testimonial"
      | "reject_testimonial"
      | "open_followup"
      | "resolve_followup",
  ) {
    let note = "";
    if (action.includes("followup")) {
      const result = await ask({ title: action === "open_followup" ? "Open a private follow-up?" : "Resolve this private follow-up?", description: action === "open_followup" ? "Record what the team should follow up on. This note is internal and is never included in public recaps or testimonials." : "Record how the concern was handled before closing the follow-up.", confirmLabel: action === "open_followup" ? "Open follow-up" : "Resolve follow-up", fields: [{ name: "note", label: "Internal follow-up note", type: "textarea", required: true, minLength: 5, maxLength: 1000, help: "Use at least 5 characters. Include only information needed for this follow-up." }] });
      if (!result) return;
      note = String(result.note ?? "");
    }
    setBusy(id);
    const { error } = await supabase.rpc("review_event_feedback", {
      p_action: action,
      p_feedback_id: id,
      p_note: note,
    });
    setBusy("");
    setMessage(error ? error.message : "Feedback action recorded and audited.");
    if (!error) window.location.reload();
  }
  if (!migrationReady)
    return (
      <section className="admin-section" id="event-feedback">
        <div className="admin-empty">
          <strong>Post-event feedback migration required</strong>
          <p>Apply the latest post-event migration in Supabase.</p>
        </div>
      </section>
    );
  return (
    <section
      className="admin-section event-feedback-manager"
      id="event-feedback"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">After the table</p>
          <h2>Feedback and recaps</h2>
          <p>
            Understand event outcomes, follow up privately, and publish only
            consented testimonials and reviewed recaps.
          </p>
        </div>
        <label className="event-content-select">
          Working event
          <select
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          >
            {events.map((event) => (
              <option value={event.id} key={event.id}>
                {event.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selected ? (
        <>
          <div className="feedback-admin-metrics">
            <article>
              <strong>{summary?.response_count ?? 0}</strong>
              <span>Responses</span>
            </article>
            <article>
              <strong>{summary?.average_overall ?? "—"}</strong>
              <span>Overall / 5</span>
            </article>
            <article>
              <strong>{summary?.recommendation_percent ?? "—"}%</strong>
              <span>Recommend</span>
            </article>
            <article>
              <strong>{summary?.open_followups ?? 0}</strong>
              <span>Follow-ups</span>
            </article>
          </div>
          <div className="feedback-admin-layout">
            <form onSubmit={(event) => void saveRecap(event)}>
              <p className="eyebrow">Public recap</p>
              <label>
                Title
                <input
                  name="title"
                  minLength={4}
                  maxLength={140}
                  required
                  defaultValue={
                    recap?.title ?? `${selected.title} — reflections`
                  }
                />
              </label>
              <label>
                Summary
                <textarea
                  name="summary"
                  minLength={40}
                  maxLength={4000}
                  required
                  defaultValue={recap?.summary ?? ""}
                />
              </label>
              <label>
                Highlights, one per line
                <textarea
                  name="highlights"
                  maxLength={3000}
                  defaultValue={recap?.highlights?.join("\n") ?? ""}
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue={recap?.status ?? "draft"}>
                  <option value="draft">Private draft</option>
                  <option value="published">Publish recap</option>
                  <option value="archived">Archive</option>
                </select>
              </label>
              <button
                className="button button-primary"
                disabled={busy === "recap"}
              >
                {busy === "recap" ? "Saving…" : "Save recap"}
              </button>
            </form>
            <div className="feedback-admin-list">
              <header>
                <strong>Private feedback</strong>
                <span>
                  {rows.length} response{rows.length === 1 ? "" : "s"}
                </span>
              </header>
              {rows.length ? (
                rows.map((row) => (
                  <article key={row.feedback_id}>
                    <div className="feedback-score">
                      <strong>{row.overall_rating}/5</strong>
                      <span>
                        {row.would_recommend ? "Would recommend" : "Not yet"}
                      </span>
                    </div>
                    <div>
                      <strong>{row.member_name || row.member_email}</strong>
                      <small>
                        {row.member_email} ·{" "}
                        {new Intl.DateTimeFormat("en-KE", {
                          dateStyle: "medium",
                        }).format(new Date(row.submitted_at))}
                      </small>
                      {row.highlight ? (
                        <p>
                          <b>Highlight:</b> {row.highlight}
                        </p>
                      ) : null}
                      {row.improvement ? (
                        <p>
                          <b>Improve:</b> {row.improvement}
                        </p>
                      ) : null}
                      {row.testimonial_quote ? (
                        <blockquote>
                          “{row.testimonial_quote}”
                          <small>
                            {row.testimonial_consent} consent ·{" "}
                            {row.testimonial_status}
                          </small>
                        </blockquote>
                      ) : null}
                      {row.followup_note ? (
                        <p className="followup-note">
                          <b>Internal follow-up:</b> {row.followup_note}
                        </p>
                      ) : null}
                    </div>
                    <div className="member-actions">
                      {row.testimonial_status === "pending" ? (
                        <>
                          <button
                            disabled={busy === row.feedback_id}
                            onClick={() =>
                              void review(
                                row.feedback_id,
                                "approve_testimonial",
                              )
                            }
                          >
                            Approve quote
                          </button>
                          <button
                            disabled={busy === row.feedback_id}
                            onClick={() =>
                              void review(row.feedback_id, "reject_testimonial")
                            }
                          >
                            Reject quote
                          </button>
                        </>
                      ) : null}
                      {row.followup_status === "open" ? (
                        <button
                          disabled={busy === row.feedback_id}
                          onClick={() =>
                            void review(row.feedback_id, "resolve_followup")
                          }
                        >
                          Resolve follow-up
                        </button>
                      ) : (
                        <button
                          disabled={busy === row.feedback_id}
                          onClick={() =>
                            void review(row.feedback_id, "open_followup")
                          }
                        >
                          Open follow-up
                        </button>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <div className="admin-empty">
                  <strong>No feedback received</strong>
                  <p>Eligible attendees can submit after the event end time.</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="admin-empty">
          <strong>No managed event</strong>
          <p>Create an event or assign an event staff scope first.</p>
        </div>
      )}
      {message ? (
        <p className="manager-message content-manager-message" role="status">
          {message}
        </p>
      ) : null}
      {dialog}
    </section>
  );
}
