"use client";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";

type Reply = { comment_id: string; author_id: string; author_name: string | null; body: string; created_at: string };
type Discussion = { post_id: string; comments: Reply[]; has_more: boolean; read_only: boolean; unavailable?: boolean };

export function CommunityGatheringDiscussion({ roomId, currentUserId, revision }: { roomId: string; currentUserId: string; revision: number }) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [item, setItem] = useState<Discussion | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true; let running = false;
    async function load() {
      if (running) return;
      running = true;
      try {
        const result = await supabase.rpc("get_community_gathering_discussion", { p_room_id: roomId, p_before: cursor });
        if (result.error) throw result.error;
        if (active) { setItem(result.data as Discussion | null); setError(""); }
      } catch (cause) { if (active) { setItem(null); setError(memberErrorMessage(cause, "open this conversation")); } }
      finally { running = false; if (active) setLoading(false); }
    }
    setItem(null); setLoading(true); void load();
    const timer = window.setInterval(() => void load(), 30000);
    const focus = () => void load(); window.addEventListener("focus", focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [cursor, retry, revision, roomId, supabase]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice("");
    try {
      const result = await supabase.rpc("reply_to_community_gathering", { p_room_id: roomId, p_body: draft });
      if (result.error) throw result.error;
      setDraft(""); setCursor(null); setRetry(value => value + 1); setNotice("Your reply was added.");
    } catch (cause) { setNotice(memberErrorMessage(cause, "add your reply")); }
    finally { setBusy(false); }
  }
  async function remove(reply: Reply) {
    if (!await ask({ title: "Remove your reply?", description: "It will no longer appear in the conversation.", confirmLabel: "Remove reply", tone: "danger" })) return;
    setBusy(true);
    const result = await supabase.rpc("delete_community_comment", { p_comment_id: reply.comment_id });
    setBusy(false);
    if (result.error) setNotice(memberErrorMessage(result.error, "remove your reply"));
    else { setItem(current => current ? { ...current, comments: current.comments.filter(row => row.comment_id !== reply.comment_id) } : null); setNotice("Reply removed."); }
  }
  async function report(reply: Reply) {
    const answer = await ask({ title: "Report this reply privately", description: "Tell the Her Africa Table safety team what worries you.", confirmLabel: "Send report", fields: [
      { name: "category", label: "Reason", type: "select", initialValue: "safety", options: [{ value: "safety", label: "Safety" }, { value: "harassment", label: "Harassment" }, { value: "privacy", label: "Privacy" }, { value: "spam", label: "Spam" }, { value: "other", label: "Other" }] },
      { name: "details", label: "What happened?", type: "textarea", required: true, minLength: 10, maxLength: 2000 },
    ] });
    if (!answer) return;
    setBusy(true);
    const result = await supabase.rpc("report_community_post", { p_post_id: reply.comment_id, p_category: String(answer.category), p_details: String(answer.details) });
    setBusy(false); setNotice(result.error ? memberErrorMessage(result.error, "send your report") : "Your report was sent privately to the safety team.");
  }
  if (!item && !error) return loading ? <p role="status">Opening conversation…</p> : null;
  return <section className="gathering-discussion" id="gathering-discussion" aria-labelledby="gathering-discussion-title">
    {dialog}<header><h2 id="gathering-discussion-title">Keep the conversation going</h2><p>Watch at your own pace. Questions and replies stay with this gathering.</p></header>
    {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>
      : item?.unavailable ? <p>This conversation is no longer available.</p> : item ? <>
        <div className="gathering-discussion-pages">{cursor ? <button type="button" onClick={() => setCursor(null)}>Latest replies</button> : null}
          {item.has_more && item.comments.length ? <button type="button" onClick={() => setCursor(item.comments[0].comment_id)}>Earlier replies</button> : null}</div>
        {item.comments.length ? <div className="gathering-discussion-replies">{item.comments.map(reply => <article key={reply.comment_id}>
          <header><strong>{reply.author_name || "Community member"}</strong><time dateTime={reply.created_at}>{new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(new Date(reply.created_at))}</time></header>
          <p>{reply.body}</p><button type="button" disabled={busy} onClick={() => void (reply.author_id === currentUserId ? remove(reply) : report(reply))}>{reply.author_id === currentUserId ? "Remove" : "Report privately"}</button>
        </article>)}</div> : <p>No replies yet. Share the first question or thought.</p>}
        {item.read_only ? <p>This Community is read-only. You can still read earlier replies.</p> : <form onSubmit={send}>
          <label htmlFor="gathering-discussion-reply">Your reply</label><textarea id="gathering-discussion-reply" rows={3} minLength={2} maxLength={1500} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Ask a question or share your thoughts…" required disabled={busy} />
          <button className="button button-primary" type="submit" disabled={busy || draft.trim().length < 2}>{busy ? "Please wait…" : "Add reply"}</button>
        </form>}
      </> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
}
