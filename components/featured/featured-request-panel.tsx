"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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
  const [filter, setFilter] = useState("pending");
  const [readError, setReadError] = useState(false);
  const generation = useRef(0);
  const saving = useRef(false);
  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    setLoading(true);
    setReadError(false);
    try {
      let query = createClient().from("featured_spot_requests").select("*").order("created_at", { ascending: false }).order("id").range(page * 20, page * 20 + 19);
      query = targetId ? query.eq(`${kind}_id`, targetId) : query.not(`${kind}_id`, "is", null);
      if (admin && filter !== "all") query = query.eq("status", filter);
      const { data, error } = await query;
      if (error) throw error;
      if (requestGeneration !== generation.current) return;
      setRows(data ?? []);
    } catch { if (requestGeneration === generation.current) setReadError(true); }
    finally { if (requestGeneration === generation.current) setLoading(false); }
  }, [kind, targetId, page, admin, filter]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>, row?: Request) {
    event.preventDefault();
    if (saving.current || loading || readError) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const decision = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? "approved";
    saving.current = true; setBusy(true); setMessage("");
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
    finally { saving.current = false; setBusy(false); }
  }
  return <details className="featured-request-panel"><summary>{admin ? `Featured requests${rows.filter(row=>row.status==="pending").length ? ` · ${rows.filter(row=>row.status==="pending").length} awaiting a decision on this page` : ""}` : "Request a featured spot"}</summary>
    <p>A featured spot helps more members discover this {kind === "event" ? "event" : "Community"}. Admin chooses up to 30 days. All times below are Nairobi time.</p>
    {!admin ? <p>{kind === "event" ? "Your event must be published and public." : "Your Community must be published with its public preview switched on."} Requests and decisions appear here; no email is sent.</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {readError ? <p role="alert">Requests could not load. Refresh requests before sending or deciding.</p> : null}
    {loading ? <p>Loading requests…</p> : null}
    {admin ? <label className="featured-request-filter">Show<select value={filter} disabled={busy} onChange={event=>{setFilter(event.target.value);setPage(0);setRows([]);}}><option value="pending">Awaiting a decision</option><option value="approved">Approved spots</option><option value="declined">Not approved</option><option value="removed">Removed</option><option value="all">All requests</option></select></label> : null}
    <button type="button" className="button button-outline" onClick={() => void load()} disabled={loading || busy}>Refresh requests</button>
    {!admin && !rows.some(row => row.status === "pending" || (row.status === "approved" && new Date(row.requested_end) > new Date())) ? <form onSubmit={event => void submit(event)}>
      <label>Why would you like a featured spot?<textarea name="reason" required minLength={10} maxLength={600}/></label>
      <label>From<input name="start" type="datetime-local" required/></label><label>Until<input name="end" type="datetime-local" required/></label>
      <button className="button button-primary" disabled={busy || loading || readError}>Send request</button>
    </form> : null}
    {rows.map(row => <article key={row.id}>
      <strong>{row.status === "approved" && new Date(row.requested_end) <= new Date() ? "Finished" : row.status === "approved" && new Date(row.requested_start) > new Date() ? "Scheduled" : row.status === "approved" ? "Featured" : row.status === "pending" ? "Awaiting a decision" : row.status === "declined" ? "Not approved" : "Removed"}</strong>
      <p>{row.reason}</p><p>{dateText(row.requested_start)} – {dateText(row.requested_end)}</p>
      {row.review_note ? <p>Admin’s note: {row.review_note}</p> : null}
      {admin ? <FeaturedTarget kind={kind} id={(row.event_id ?? row.community_id)!}/> : null}
      {admin && (row.status === "pending" || row.status === "approved") ? <form onSubmit={event => void submit(event, row)}>
        {row.status === "pending" ? <>
        <label>From<input name="start" type="datetime-local" defaultValue={new Date(new Date(row.requested_start).getTime() + 10800000).toISOString().slice(0,16)}/></label>
        <label>Until<input name="end" type="datetime-local" defaultValue={new Date(new Date(row.requested_end).getTime() + 10800000).toISOString().slice(0,16)}/></label>
        </> : null}
        <label>Note to Host<textarea name="note" maxLength={600}/><small>Add a short reason if declining or removing a spot.</small></label>
        {row.status === "pending" ? <button className="button button-primary" value="approved" disabled={busy || loading || readError}>Approve dates</button> : null}
        <button className="button button-outline" value={row.status === "pending" ? "declined" : "removed"} disabled={busy || loading || readError}>{row.status === "pending" ? "Decline" : "Remove featured spot"}</button>
      </form> : null}
    </article>)}
    {!loading && !readError && !rows.length ? <p>{admin ? "No requests in this view." : "You have no featured requests yet."}</p> : null}
    {admin ? <nav aria-label="Featured request pages"><button disabled={!page || loading || busy} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button disabled={rows.length < 20 || loading || busy || readError} onClick={() => setPage(page + 1)}>Next</button></nav> : null}
  </details>;
}

function FeaturedTarget({ kind, id }: { kind: "event" | "community"; id: string }) {
  const [target, setTarget] = useState<{ slug: string; title?: string; name?: string } | null>(null);
  useEffect(() => { let active=true;setTarget(null);void Promise.resolve(createClient().from(kind === "event" ? "events" : "communities").select(kind === "event" ? "slug,title" : "slug,name").eq("id", id).maybeSingle()).then(({ data }) => {if(active)setTarget(data as typeof target);}).catch(()=>{if(active)setTarget(null);});return()=>{active=false;}; }, [kind, id]);
  return target ? <a href={`/${kind === "event" ? "events" : "communities"}/${target.slug}`}>{target.title ?? target.name} →</a> : <p>Details unavailable</p>;
}
