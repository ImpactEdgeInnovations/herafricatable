"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SupportMessage } from "@/components/member/support-center";
import { useAdminOperation } from "@/lib/use-admin-operation";

type SupportDraft = { reply: string; note: string; status: string; priority: string; assignee: string };

export type AdminSupportTicket = {
  ticket_id: string;
  reference: string;
  requester_id: string;
  email: string;
  display_name: string | null;
  category: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  assigned_email: string | null;
  response_due_at: string;
  created_at: string;
  updated_at: string;
};
const label = (value: string) => value.replaceAll("_", " ");
const date = (value: string) =>
  new Intl.DateTimeFormat("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

export function SupportInbox({
  adminEmail,
  tickets,
  messages,
  selectedTicketId,
  messagesReady,
}: {
  adminEmail: string;
  tickets: AdminSupportTicket[];
  messages: SupportMessage[];
  selectedTicketId: string | null;
  messagesReady: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const selected =
    tickets.find((item) => item.ticket_id === selectedTicketId) ?? null;
  // Private drafts belong to a ticket, never to whichever ticket happens to open next.
  // Component memory only; closing/reloading this page clears them.
  const [drafts, setDrafts] = useState<Record<string, Partial<SupportDraft>>>({});
  const [notices, setNotices] = useState<Record<string, string>>({});
  const contextId = selectedTicketId ?? "";
  const baseline: SupportDraft = { reply: "", note: "", status: selected?.status ?? "open", priority: selected?.priority ?? "normal", assignee: selected?.assigned_email ?? adminEmail };
  const { reply, note, status, priority, assignee } = { ...baseline, ...drafts[contextId] };
  const notice = notices[contextId] ?? "";
  const setNotice: Dispatch<SetStateAction<string>> = (next) => setNotices((current) => ({ ...current, [contextId]: typeof next === "function" ? next(current[contextId] ?? "") : next }));
  const { busy, runAdminAction, markSaved } = useAdminOperation<boolean>(false, true, setNotice);
  function updateDraft(patch: Partial<SupportDraft>) {
    setDrafts((current) => ({ ...current, [contextId]: { ...current[contextId], ...patch } }));
  }
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (Object.values(drafts).some((draft) => draft.reply?.trim() || draft.note?.trim())) {
        event.preventDefault(); event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [drafts]);
  useEffect(() => {
    if (!selectedTicketId) return;
    const channel = supabase
      .channel(`admin-support:${selectedTicketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${selectedTicketId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, selectedTicketId, supabase]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!selected || !messagesReady || !reply.trim()) return;
    const ticketId = selected.ticket_id;
    const body = reply;
    return runAdminAction(`support-reply:${ticketId}`, async () => {
      const { error } = await supabase.rpc("reply_support_ticket", { p_body: body, p_ticket_id: ticketId });
      if (error) throw error;
      markSaved();
      setDrafts((current) => ({ ...current, [ticketId]: { ...current[ticketId], reply: current[ticketId]?.reply === body ? "" : current[ticketId]?.reply ?? "" } }));
      setNotice(`Reply saved for ${selected.email}. Email delivery is tracked in Message delivery.`);
      router.refresh();
    });
  }
  async function manage(event: FormEvent) {
    event.preventDefault();
    if (!selected || !messagesReady) return;
    const ticketId = selected.ticket_id;
    return runAdminAction(`support-manage:${ticketId}`, async () => {
      const { error } = await supabase.rpc("manage_support_ticket", { p_assignee_email: assignee, p_note: note, p_priority: priority, p_status: status, p_ticket_id: ticketId });
      if (error) throw error;
      markSaved();
      setDrafts((current) => {
        const next = { ...current[ticketId] };
        for (const [field, saved] of Object.entries({ note, status, priority, assignee })) {
          if (next[field as keyof SupportDraft] === saved) delete next[field as keyof SupportDraft];
        }
        return { ...current, [ticketId]: next };
      });
      setNotice("Request updated and saved.");
      router.refresh();
    });
  }
  return (
    <div className="support-shell admin-support-shell">
      <aside className="support-sidebar">
        <header>
          <p className="eyebrow">Member care</p>
          <h1>Support inbox</h1>
          <p>
            {
              tickets.filter(
                (item) => !["resolved", "closed"].includes(item.status),
              ).length
            }{" "}
            request{tickets.filter((item) => !["resolved", "closed"].includes(item.status)).length === 1 ? "" : "s"} waiting for a reply.
          </p>
        </header>
        <div className="support-ticket-list">
          {tickets.map((ticket) => (
            <Link
              className={
                ticket.ticket_id === selectedTicketId ? "selected" : ""
              }
              href={`/admin/support?ticket=${ticket.ticket_id}`}
              key={ticket.ticket_id}
              onClick={(event) => { if (busy) event.preventDefault(); }}
              aria-disabled={busy}
            >
              <span>
                <strong>{ticket.subject}</strong>
                <small>
                  {ticket.display_name || ticket.email} · {ticket.reference}
                </small>
              </span>
              <b className={`support-state ${ticket.status}`}>
                {label(ticket.status)}
              </b>
            </Link>
          ))}
        </div>
      </aside>
      <section className="support-panel">
        {selected ? (
          <>
            <header>
              <div>
                <p className="eyebrow">
                  {selected.reference} · {label(selected.category)} ·{" "}
                  {selected.email}
                </p>
                <h2>{selected.subject}</h2>
              </div>
              <span className={`support-state ${selected.status}`}>
                {label(selected.status)}
              </span>
            </header>
            <div className="support-thread">
              {!messagesReady ? <div className="admin-empty network-error" role="alert"><strong>Replies could not be loaded</strong><p>This is not an empty conversation. Reload the replies before responding; your draft stays here while you retry.</p><button className="button button-outline" type="button" onClick={() => router.refresh()}>Reload replies</button></div> : null}
              <article className="support-opening">
                <div>
                  <strong>{selected.display_name || selected.email}</strong>
                  <p>{selected.description}</p>
                  <time>{date(selected.created_at)}</time>
                </div>
              </article>
              {messagesReady && !messages.length ? <p className="form-help">No replies yet.</p> : null}
              {messagesReady && messages.map((message) => (
                <article
                  className={message.is_staff ? "staff" : "own"}
                  key={message.id}
                >
                  <div>
                    <strong>
                      {message.is_staff
                        ? "Support team"
                        : selected.display_name || selected.email}
                    </strong>
                    <p>{message.body}</p>
                    <time>{date(message.created_at)}</time>
                  </div>
                </article>
              ))}
            </div>
            <form className="support-composer" onSubmit={send}>
              <p className="form-help support-reply-recipient">Reply to <strong>{selected.display_name || selected.email}</strong> · {selected.email}. Only this member and the support team can read this reply.</p>
              <label>
                <span className="sr-only">Reply</span>
                <textarea
                  rows={3}
                  maxLength={4000}
                  required
                  value={reply}
                  onChange={(event) => updateDraft({ reply: event.target.value })}
                  disabled={busy || !messagesReady}
                  placeholder="Reply as Her Africa Table support…"
                />
              </label>
              <button
                className="button button-primary"
                disabled={busy || !messagesReady || !reply.trim()}
              >
                {busy ? "Saving…" : "Send reply"}
              </button>
              {reply ? <button className="button button-outline support-clear-draft" disabled={busy} onClick={() => updateDraft({ reply: "" })} type="button">Clear draft</button> : null}
            </form>
            <form
              className="support-admin-controls"
              onSubmit={manage}
              aria-describedby="support-operations-guide"
            >
              <p className="admin-form-guide" id="support-operations-guide">
                Use waiting member only when a reply is required. Resolved
                requests can be reopened; closed requests are final.
              </p>
              <label>
                Status
                <select
                  value={status}
                  onChange={(event) => updateDraft({ status: event.target.value })}
                  disabled={busy || !messagesReady}
                >
                  {[
                    "open",
                    "in_progress",
                    "waiting_member",
                    "resolved",
                    "closed",
                  ].map((item) => (
                    <option key={item} value={item}>{item === "waiting_member" ? "Waiting for member" : label(item)}</option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={priority}
                  onChange={(event) => updateDraft({ priority: event.target.value })}
                  disabled={busy || !messagesReady}
                >
                  {["low", "normal", "high", "urgent"].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Assignee email
                <input
                  type="email"
                  value={assignee}
                  onChange={(event) => updateDraft({ assignee: event.target.value })}
                  disabled={busy || !messagesReady}
                />
              </label>
              <label className="support-note">
                Member-visible action note
                <input
                  maxLength={4000}
                  value={note}
                  onChange={(event) => updateDraft({ note: event.target.value })}
                  disabled={busy || !messagesReady}
                  aria-describedby="support-action-note-help"
                />
                <small className="form-help" id="support-action-note-help">
                  Explain the status change clearly. Do not include internal
                  investigation details.
                </small>
              </label>
              <button className="button button-outline" disabled={busy || !messagesReady}>
                Save changes
              </button>
            </form>
          </>
        ) : (
          <div className="conversation-placeholder">
            <p className="eyebrow">Member care</p>
            <h2>Select a request.</h2>
            <p>Urgent and high-priority requests are ordered first.</p>
          </div>
        )}
        {notice ? (
          <p className="message-status" role="status">
            {notice}
          </p>
        ) : null}
      </section>
    </div>
  );
}
