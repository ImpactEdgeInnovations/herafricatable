"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import { formatEventTimeInput, parseEventTimeInput } from "@/lib/events/zoned-datetime";
import { networkingCountdown, networkingPhase, networkingRemaining, type NetworkingState } from "@/lib/events/networking";
import styles from "./event-networking.module.css";

export function EventNetworking({ eventId, timeZone = "Africa/Nairobi", eventStartsAt, eventEndsAt,
  initial = null, initialError = false, manage = false }: {
  eventId: string; timeZone?: string; eventStartsAt?: string; eventEndsAt?: string;
  initial?: NetworkingState | null; initialError?: boolean; manage?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [state, setState] = useState(initial);
  const [error, setError] = useState(initialError ? "Networking could not load. Please try again." : "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState(false);
  const [now, setNow] = useState(0);
  const clock = useRef({ server: 0, sampled: 0 });
  const mounted = useRef(true);
  const actionLock = useRef(false);
  const request = useRef<Promise<void> | null>(null);
  const hydrated = useRef(Boolean(initial));
  const previousMatch = useRef(initial?.match ?? null);
  const [introduction, setIntroduction] = useState(initial?.introduction ?? "");
  const proposedStart = Math.max(Date.parse(eventStartsAt ?? new Date().toISOString()) + 15 * 60_000, Date.now());
  const proposedEnd = Math.min(proposedStart + 30 * 60_000, Date.parse(eventEndsAt ?? new Date(proposedStart + 30 * 60_000).toISOString()));
  const [start, setStart] = useState(formatEventTimeInput(initial?.session?.starts_at ?? new Date(proposedStart).toISOString(), timeZone));
  const [end, setEnd] = useState(formatEventTimeInput(initial?.session?.ends_at ?? new Date(proposedEnd).toISOString(), timeZone));
  const [minutes, setMinutes] = useState(initial?.session?.minutes ?? 5);
  const [changeover, setChangeover] = useState(initial?.session?.changeover ?? 60);
  const [points, setPoints] = useState(initial?.session?.points?.join("\n") ?? "Table 1\nTable 2\nTable 3\nTable 4\nTable 5");
  const [prompt, setPrompt] = useState(initial?.session?.prompt ?? "What would help your business most right now?");
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(() => {
    if (request.current) return request.current;
    request.current = (async () => {
      try {
        const result = await supabase.rpc("get_event_networking", { p_event_id: eventId });
        if (!mounted.current) return;
        if (result.error || !result.data?.server_now) throw result.error ?? new Error("Missing session response");
        const next = result.data as NetworkingState;
        if (previousMatch.current && previousMatch.current.id !== next.match?.id) {
          setMessage(Date.parse(previousMatch.current.ends_at) <= Date.parse(next.server_now)
            ? "The round has ended. Your next introduction will appear here."
            : "That introduction has ended. We will look for someone else while you are taking part.");
        }
        previousMatch.current = next.match ?? null;
        if (!hydrated.current) {
          hydrated.current = true;
          setIntroduction(next.introduction ?? "");
          if (next.session) {
            setStart(formatEventTimeInput(next.session.starts_at, timeZone)); setEnd(formatEventTimeInput(next.session.ends_at, timeZone));
            setMinutes(next.session.minutes); setChangeover(next.session.changeover); setPoints(next.session.points?.join("\n") ?? ""); setPrompt(next.session.prompt);
          }
        }
        clock.current = { server: Date.parse(next.server_now), sampled: performance.now() };
        setNow(clock.current.server); setState(next); setSynced(true); setError("");
      } catch {
        if (mounted.current) { setSynced(false); setError("We lost touch with the session. Reconnecting… Your next introduction will appear after we reconnect."); }
      } finally { request.current = null; }
    })();
    return request.current;
  }, [eventId, supabase, timeZone]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const poll = setInterval(() => { if (!document.hidden && !actionLock.current) void refresh(); }, 5000);
    const timer = setInterval(() => { if (clock.current.server) setNow(clock.current.server + performance.now() - clock.current.sampled); }, 500);
    const resume = () => { if (!document.hidden) { setSynced(false); if (!actionLock.current) void refresh(); } };
    document.addEventListener("visibilitychange", resume); window.addEventListener("online", resume); window.addEventListener("focus", resume);
    return () => { mounted.current = false; clearInterval(poll); clearInterval(timer); document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); window.removeEventListener("focus", resume); };
  }, [refresh]);

  async function run(name: string, args: Record<string, unknown>, success: string) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setMessage("");
    try {
      if (request.current) await request.current;
      const result = await supabase.rpc(name, { p_event_id: eventId, ...args });
      if (result.error) throw result.error;
      setMessage(success); await refresh();
    } catch (failure) {
      const domain = failure as { code?: string; message?: string };
      setMessage(domain?.code === "P0001" && /^(Networking is not available|Networking has not been scheduled|This networking session is full|Start during the scheduled networking time)$/.test(domain.message ?? "")
        ? domain.message! : memberErrorMessage(failure, "update networking"));
      await refresh();
    }
    finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  }
  async function control(action: string) {
    if (["finish", "disable"].includes(action) && !await ask({ title: action === "finish" ? "Finish networking?" : "Disable networking?",
      description: "Current introductions will stop. Event bookings and existing connections will not change.", confirmLabel: action === "finish" ? "Finish session" : "Disable networking", tone: "danger" })) return;
    await run("control_event_networking", { p_action: action }, "Session updated.");
  }
  async function help() {
    const answer = await ask({ title: "Ask the event team for help", description: "This goes to the Host’s networking panel. For urgent help, speak to the team at the venue; this is not an emergency service.", confirmLabel: "Send to Host", fields: [{ name: "note", label: "What help do you need?", type: "textarea", minLength: 5, maxLength: 500, required: true }] });
    if (answer) await run("event_networking_help", { p_note: String(answer.note) }, "Your request is in the Host’s networking panel.");
  }
  async function connect(match: { match_id: string; name: string }) {
    const answer = await ask({ title: `Stay connected with ${match.name}?`, description: "We will send a connection request. Private messages open only if she accepts. Both of you need active platform membership.", confirmLabel: "Send connection request", fields: [{ name: "note", label: "Add a note (optional)", type: "textarea", maxLength: 500, minLength: 10 }] });
    if (answer) await run("connect_event_networking", { p_match_id: match.match_id, p_note: String(answer.note ?? "") }, "Connection request sent. She can accept or decline privately.");
  }
  async function save() {
    let starts: string, ends: string;
    try { starts = parseEventTimeInput(start, timeZone); ends = parseEventTimeInput(end, timeZone); }
    catch { setMessage("Choose a valid start and finish time."); return; }
    await run("save_event_networking", { p_starts_at: starts, p_ends_at: ends, p_minutes: minutes, p_changeover: changeover,
      p_points: points.split("\n").map(x => x.trim()).filter(Boolean), p_prompt: prompt }, "Networking scheduled. Guests choose whether to take part.");
  }
  const session = state?.session;
  const phase = state ? networkingPhase(state, now) : "not_scheduled";
  const manager = manage && state?.can_manage;
  const locked = busy || !synced;
  const match = synced && ["offered", "talking"].includes(phase) ? state?.match : null;
  const time = (value: string) => new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
  if (!manage && !session && !error) return null;
  return <section className={styles.panel} id="event-networking" aria-labelledby={`networking-title-${manage ? "host" : "guest"}`}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>{manage ? "Host tools · In person" : "Optional · In person"}</p><h2 id={`networking-title-${manage ? "host" : "guest"}`}>{manage ? "Networking rounds" : "Meet someone new"}</h2>
      {session ? <p>{time(session.starts_at)}–{time(session.ends_at)} · {session.minutes} minutes together · {session.changeover} seconds to change places</p> : <p>Short introductions for checked-in guests. No contact details are shared.</p>}</div>
      {session ? <span className={styles.badge}>{session.disabled ? "Disabled by Admin" : session.status === "running" ? `Round ${session.round_no || 1}` : session.status === "scheduled" ? "Starts with the Host" : session.status === "paused" ? "Paused" : "Finished"}</span> : null}
    </header>
    {error ? <div className={styles.notice} role="alert"><p>{error}</p><button type="button" className="button button-outline" onClick={() => void refresh()} disabled={busy}>Try again</button></div> : null}
    {manager ? <>
      {!session || session.status === "scheduled" ? <>
        <button className="button button-outline" type="button" aria-expanded={formOpen} onClick={() => setFormOpen(!formOpen)}>{session ? "Edit schedule" : "Schedule networking"}</button>
        {formOpen ? <form className={styles.form} onSubmit={e => { e.preventDefault(); void save(); }}>
          <p>Pairs only. Add one meeting point per pair you can accommodate. Times use {timeZone}. The session must fit inside your published in-person event.</p>
          <div className={styles.fields}><label>Starts<input required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label><label>Finishes<input required type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
          <label>Minutes per conversation<select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[2,3,4,5,6,7,8,10,12,15].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Time to change places<select value={changeover} onChange={e => setChangeover(Number(e.target.value))}><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={180}>3 minutes</option></select></label></div>
          <label>Meeting points · One per line<textarea required rows={4} value={points} onChange={e => setPoints(e.target.value)} maxLength={1830} /></label>
          <label>Conversation starter (optional)<textarea rows={2} value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={280} /></label>
          <button className="button button-primary" disabled={locked}>Save schedule</button>
        </form> : null}
      </> : null}
      {session ? <div className={styles.actions}>
        {session.status === "scheduled" && !session.disabled ? <button className="button button-primary" disabled={locked || now < Date.parse(session.starts_at) || now >= Date.parse(session.ends_at)} onClick={() => void control("start")}>Start networking</button> : null}
        {session.status === "running" ? <button className="button button-outline" disabled={locked} onClick={() => void control("pause")}>Pause</button> : null}
        {session.status === "paused" && !session.disabled ? <button className="button button-primary" disabled={locked || now >= Date.parse(session.ends_at)} onClick={() => void control("resume")}>Resume</button> : null}
        {session.status !== "finished" ? <button className="button button-outline" disabled={locked} onClick={() => void control("finish")}>Finish session</button> : null}
        {state.is_admin ? <button className="button button-outline" disabled={locked} onClick={() => void control(session.disabled ? "enable" : "disable")}>{session.disabled ? "Enable networking" : "Disable networking"}</button> : null}
      </div> : null}
      {!synced ? <p>Live attendance is unavailable until we reconnect.</p> : state.people?.length ? <div className={styles.roster}><h3>People taking part</h3><ul>{state.people.map((p, i) => <li key={i}><span>{p.name}</span><small>{!p.ready ? "Away / left" : p.paired ? "With an introduction" : "Ready for a new person"}</small></li>)}</ul></div> : <p>No guests have joined networking yet.</p>}
      {state.help?.length ? <div className={styles.notice}><h3>Guests asking for help</h3>{state.help.map(h => <article key={h.id}><strong>{h.name}</strong><p>{h.note}</p><button className="button button-outline" disabled={locked} onClick={() => void run("resolve_event_networking_help", { p_help_id: h.id }, "Marked as handled.")}>Mark handled</button></article>)}</div> : null}
      <p className={styles.help}>Guests keep this panel open while taking part. A short break is normal when numbers are uneven. No per-pair Admin approval is needed.</p>
    </> : state && session ? <>
      {phase === "finished" ? <p>Networking has finished. You can choose to stay connected with the people you met below.</p>
        : phase === "disabled" || phase === "paused" ? <p>The event team has paused networking. You do not need to do anything.</p>
        : !state.eligible ? <p>Have your event pass checked at the door first. Then return here to join networking.</p>
        : !state.joined ? <form className={styles.form} onSubmit={e => { e.preventDefault(); void run("join_event_networking", { p_join: true, p_introduction: introduction }, "You joined networking. Keep this panel open while taking part."); }}>
          <p>Meet other guests, one conversation at a time. Joining is your choice; you can leave whenever you like.</p>
          <label>A short introduction<textarea required minLength={5} maxLength={280} rows={2} value={introduction} onChange={e => setIntroduction(e.target.value)} placeholder="I run a food business and would enjoy meeting other founders." /></label><small>Only your first name, profile photo and introduction appear to your match. Please leave out contact details.</small>
          <button className="button button-primary" disabled={locked}>Join networking</button>
        </form> : <>
          {match ? <article className={styles.match}>
            <div className={styles.person}>{match.person.avatar_url ? <img src={match.person.avatar_url} width={72} height={72} alt="" onError={e => { e.currentTarget.hidden = true; }} /> : <span className={styles.initial} aria-hidden="true">{match.person.name.slice(0,1)}</span>}<div><p className={styles.eyebrow}>{phase === "talking" ? "Your conversation" : "Your next introduction"}</p><h3>Meet {match.person.name}</h3><p>{match.person.introduction}</p></div></div>
            <div className={styles.meeting}><strong>Meet at {match.point}</strong><span className={styles.timer} aria-label={phase === "talking" ? "Conversation time remaining" : "Time to accept"}>{networkingCountdown(networkingRemaining(phase === "talking" ? match.ends_at : match.accept_by, now))}</span></div>
            {phase === "talking" ? <><p>{session.prompt || "What would you enjoy sharing with each other?"}</p><small>The timer is a friendly cue to move to the next introduction.</small></> : <p>{match.accepted ? "Waiting for the other person to accept. We will tell you when you are both ready." : "Would you like to meet? Both of you choose before the conversation starts."}</p>}
            <div className={styles.actions}>{phase === "offered" && !match.accepted ? <button className="button button-primary" disabled={locked} onClick={() => void run("answer_event_networking", { p_match_id: match.id, p_accept: true }, "Accepted. Waiting for both of you to be ready.")}>Accept introduction</button> : null}
              <button className="button button-outline" disabled={locked} onClick={() => void run("answer_event_networking", { p_match_id: match.id, p_accept: false }, "Introduction ended. You will not be paired with this person again at this event.")}>{phase === "talking" ? "Leave this round" : "Skip"}</button></div>
          </article> : <div className={styles.waiting} role="status"><h3>{phase === "scheduled" ? "You are ready" : phase === "changeover" ? "Time to change places" : "Ready for someone new"}</h3><p>{phase === "scheduled" ? "The Host will start the session. Keep this panel open." : "You may have a short break if no new partner is available. We never repeat an introduction at this event."}</p>{phase === "changeover" && session.next_at ? <span className={styles.timer}>{networkingCountdown(networkingRemaining(session.next_at, now))}</span> : null}</div>}
          <div className={styles.actions}><button className="button button-outline" disabled={busy} onClick={() => void run("join_event_networking", { p_join: false }, "You left networking. Your event place is unchanged.")}>Leave networking</button><button className="button button-quiet" disabled={busy} onClick={() => void help()}>Get help</button></div>
        </>}
      {state.met?.length ? <details className={styles.roster}><summary>People you met · {state.met.length}</summary><ul>{state.met.map(p => <li key={p.match_id}><span>{p.name}</span><button className="button button-outline" disabled={locked} onClick={() => void connect(p)}>Stay connected</button></li>)}</ul><p>Connections are optional. Nothing is sent until you confirm.</p></details> : null}
      {state.joined && ["paused", "disabled", "finished"].includes(phase) ? <div className={styles.actions}><button className="button button-outline" disabled={busy} onClick={() => void run("join_event_networking", { p_join: false }, "You left networking. Your event place is unchanged.")}>Leave networking</button></div> : null}
    </> : null}
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
    {dialog}
  </section>;
}
