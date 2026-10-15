"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

type Request = { id: string; reason: string; status: string; requested_start: string; requested_end: string; review_note: string | null; event_id: string | null; community_id: string | null; created_at: string };
const dateText = (value: string) => new Date(value).toLocaleString("en-KE", { timeZone: "Africa/Nairobi", dateStyle: "medium", timeStyle: "short" });

export function FeaturedRequestPanel({ kind, targetId, admin = false }: { kind: "event" | "community"; targetId?: string; admin?: boolean }) {
  const [rows, setRows] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  async function load() {
    setLoading(true);
    try {
      let query = createClient().from("featured_spot_requests").select("*").order("created_at", { ascending: false }).range(page * 20, page * 20 + 19);
      query = targetId ? query.eq(`${kind}_id`, targetId) : query.not(`${kind}_id`, "is", null);
      const { data, error } = await query;
      if (error) throw error;
      setRows(data ?? []);
    } catch { setMessage("Featured requests could not load. Please try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [kind, targetId, page]); // eslint-disable-line react-hooks/exhaustive-deps
  async function submit(event: FormEvent<HTMLFormElement>, row?: Request) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "approved";
    setBusy(true); setMessage("");
    try {
      const start = String(fields.get("start") ?? "");
      const end = String(fields.get("end") ?? "");
      const { error } = row
        ? await createClient().rpc("review_featured_spot", { p_id: row.id, p_decision: decision, p_start: start ? new Date(start + "+03:00").toISOString() : null, p_end: end ? new Date(end + "+03:00").toISOString() : null, p_note: String(fields.get("note") ?? "") })
        : await createClient().rpc("request_featured_spot", { p_kind: kind, p_target: targetId, p_reason: String(fields.get("reason") ?? ""), p_start: new Date(start + "+03:00").toISOString(), p_end: new Date(end + "+03:00").toISOString() });
      if (error) throw error;
      setMessage(row ? "Decision saved." : "Request sent. You can check the decision here.");
      if (!row) form.reset();
      await load();
    } catch (error) { setMessage(memberErrorMessage(error, "save this featured request")); }
    finally { setBusy(false); }
  }
  return <details className="featured-request-panel"><summary>{admin ? `Featured requests${rows.filter(row=>row.status==="pending").length ? ` · ${rows.filter(row=>row.status==="pending").length} awaiting a decision on this page` : ""}` : "Request a featured spot"}</summary>
    <p>A featured spot helps more members discover this {kind === "event" ? "event" : "Community"}. Admin chooses up to 30 days. All times below are Nairobi time.</p>
    {!admin ? <p>{kind === "event" ? "Your event must be published and public." : "Your Community must be published with its public preview switched on."} Requests and decisions appear here; no email is sent.</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {loading ? <p>Loading requests…</p> : null}
    <button type="button" className="button button-outline" onClick={() => void load()} disabled={loading || busy}>Refresh requests</button>
    {!admin && !rows.some(row => row.status === "pending" || (row.status === "approved" && new Date(row.requested_end) > new Date())) ? <form onSubmit={event => void submit(event)}>
      <label>Why would you like a featured spot?<textarea name="reason" required minLength={10} maxLength={600}/></label>
      <label>From<input name="start" type="datetime-local" required/></label><label>Until<input name="end" type="datetime-local" required/></label>
      <button className="button button-primary" disabled={busy || loading}>Send request</button>
    </form> : null}
    {rows.map(row => <article key={row.id}>
      <strong>{row.status === "approved" && new Date(row.requested_end) <= new Date() ? "Finished" : row.status === "approved" && new Date(row.requested_start) > new Date() ? "Scheduled" : row.status === "approved" ? "Featured" : row.status === "pending" ? "Awaiting a decision" : row.status === "declined" ? "Not approved" : "Removed"}</strong>
      <p>{row.reason}</p><p>{dateText(row.requested_start)} – {dateText(row.requested_end)}</p>
      {row.review_note ? <p>Admin’s note: {row.review_note}</p> : null}
      {admin ? <FeaturedTarget kind={kind} id={(row.event_id ?? row.community_id)!}/> : null}
      {admin && (row.status === "pending" || row.status === "approved") ? <form onSubmit={event => void submit(event, row)}>
        <label>From<input name="start" type="datetime-local" defaultValue={new Date(new Date(row.requested_start).getTime() + 10800000).toISOString().slice(0,16)}/></label>
        <label>Until<input name="end" type="datetime-local" defaultValue={new Date(new Date(row.requested_end).getTime() + 10800000).toISOString().slice(0,16)}/></label>
        <label>Note to Host<textarea name="note" maxLength={600}/></label>
        <button className="button button-primary" value="approved" disabled={busy}>Approve dates</button>
        <button className="button button-outline" value={row.status === "pending" ? "declined" : "removed"} disabled={busy}>{row.status === "pending" ? "Decline" : "Remove featured spot"}</button>
      </form> : null}
    </article>)}
    {admin ? <nav aria-label="Featured request pages"><button disabled={!page || loading} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={rows.length < 20 || loading} onClick={() => setPage(page + 1)}>Next</button></nav> : null}
  </details>;
}

function FeaturedTarget({ kind, id }: { kind: "event" | "community"; id: string }) {
  const [target, setTarget] = useState<{ slug: string; title?: string; name?: string } | null>(null);
  useEffect(() => { void createClient().from(kind === "event" ? "events" : "communities").select(kind === "event" ? "slug,title" : "slug,name").eq("id", id).maybeSingle().then(({ data }) => setTarget(data as typeof target)); }, [kind, id]);
  return target ? <a href={`/${kind === "event" ? "events" : "communities"}/${target.slug}`}>{target.title ?? target.name} →</a> : <p>Details unavailable</p>;
}
