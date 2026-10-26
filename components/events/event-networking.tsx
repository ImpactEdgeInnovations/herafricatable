"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { useActionDialog } from "@/components/ui/action-dialog";
import { formatEventTimeInput, parseEventTimeInput } from "@/lib/events/zoned-datetime";
import { networkingCountdown, networkingStartCountdown, networkingPhase, networkingRemaining, type NetworkingState } from "@/lib/events/networking";
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
  const [pointCount, setPointCount] = useState(String(initial?.session?.points?.length ?? 5));
  const [prompt, setPrompt] = useState(initial?.session?.prompt ?? "What would help your business most right now?");
  const [formOpen, setFormOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [invitationDismissed, setInvitationDismissed] = useState(false);
  const [animationPaused, setAnimationPaused] = useState(false);

  const refresh = useCallback(() => {
    if (request.current) return request.current;
    request.current = (async () => {
      try {
        const result = await supabase.rpc("get_event_networking", { p_event_id: eventId });
        if (!mounted.current) return;
        if (result.error || !result.data?.server_now) throw result.error ?? new Error("Missing session response");
        const next = result.data as NetworkingState;
        if (previousMatch.current && previousMatch.current.id !== next.match?.id && !next.end_notice) {
          setMessage(Date.parse(previousMatch.current.ends_at) <= Date.parse(next.server_now)
            ? "The round has ended. Your next introduction will appear here."
            : "That introduction has ended. Your networking status is shown below.");
        }
        previousMatch.current = next.match ?? null;
        if (!hydrated.current) {
          hydrated.current = true;
          setIntroduction(next.introduction ?? "");
          if (next.session) {
            setStart(formatEventTimeInput(next.session.starts_at, timeZone)); setEnd(formatEventTimeInput(next.session.ends_at, timeZone));
            setMinutes(next.session.minutes); setChangeover(next.session.changeover); setPoints(next.session.points?.join("\n") ?? ""); setPointCount(String(next.session.points?.length ?? 5)); setPrompt(next.session.prompt);
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
    if (actionLock.current) return false;
    actionLock.current = true; setBusy(true); setMessage("");
    try {
      if (request.current) await request.current;
      const result = await supabase.rpc(name, { p_event_id: eventId, ...args });
      if (result.error) throw result.error;
      await refresh(); setMessage(success);
      return true;
    } catch (failure) {
      const domain = failure as { code?: string; message?: string };
      const feedback = domain?.code === "P0001" && /^(Networking is not available|Networking has not been scheduled|This networking session is full|Start during the scheduled networking time|This introduction has ended|Refresh networking and choose whether to continue)$/.test(domain.message ?? "")
        ? domain.message! : memberErrorMessage(failure, "update networking");
      await refresh();
      setMessage(feedback);
      return false;
    }
    finally { actionLock.current = false; if (mounted.current) setBusy(false); }
  }
  function deferNetworking() {
    setEntryOpen(false); setInvitationDismissed(true);
  }
  async function leaveNetworking() {
    if (await run("join_event_networking", { p_join: false }, "You left networking. Your event place is unchanged.")) deferNetworking();
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
  async function endIntroduction(matchId: string, talking: boolean) {
    if (talking && !await ask({ title: "End this conversation?", description: "The other person will see that the conversation has ended, without a reason. You can then meet someone else or leave networking.", confirmLabel: "End conversation" })) return;
    await run("answer_event_networking", { p_match_id: matchId, p_accept: false }, "");
  }
  async function connect(match: { match_id: string; name: string }) {
    const answer = await ask({ title: `Stay connected with ${match.name}?`, description: "We will send a connection request. Private messages open only if she accepts. Both of you need active platform membership.", confirmLabel: "Send connection request", fields: [{ name: "note", label: "Add a note (optional)", type: "textarea", maxLength: 500, minLength: 10 }] });
    if (answer) await run("connect_event_networking", { p_match_id: match.match_id, p_note: String(answer.note ?? "") }, "Connection request sent. She can accept or decline privately.");
  }
  async function save() {
    if (!pointCount || Number(pointCount)<1 || Number(pointCount)>30) { setMessage("Choose between one and thirty meeting points."); return; }
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
  const startRemaining = networkingRemaining(session?.starts_at, now);
  const roundRemaining = networkingRemaining(session?.round_ends_at, now);
  const roundProgress = session ? Math.min(1, roundRemaining / (session.minutes * 60)) : 0;
  const invitationLive = !manage && synced && state?.eligible && !state.joined && !state.end_notice && session?.status === "running" && !session.disabled && phase !== "finished";
  const invitationTitle = invitationLive && !entryOpen && !invitationDismissed
    ? session.round_no <= 1 ? "Networking is starting" : "Networking is live"
    : "Meet someone new";
  return <section className={`${styles.panel}${!manage ? ` ${styles.guest}` : ""}${!manage && !state?.joined ? ` ${styles.strip}` : ""}`} id="event-networking" aria-labelledby={`networking-title-${manage ? "host" : "guest"}`}>
    <header className={styles.heading}><div><p className={styles.eyebrow}>{manage ? "Host tools · In person" : "At this event · Networking"}</p><h2 id={`networking-title-${manage ? "host" : "guest"}`}>{manage ? "Networking rounds" : invitationTitle}</h2>
      {session ? <p>{time(session.starts_at)}–{time(session.ends_at)} <span aria-hidden="true">·</span> {session.minutes} min per conversation{manage ? ` · ${session.changeover}s between rounds` : ""}</p> : <p>Short introductions for checked-in guests. No contact details are shared.</p>}</div>
      {session ? <span className={styles.badge}>{!manage && !synced ? "Checking…" : session.disabled ? "Paused by Admin" : phase === "finished" ? "Finished" : session.status === "running" ? manage ? `Round ${session.round_no || 1}` : "Live now" : session.status === "scheduled" ? "Coming up" : session.status === "paused" ? "Paused" : "Finished"}</span> : null}
    </header>
    {!manage && session && phase === "scheduled" ? <div className={styles.startStrip} aria-label="Networking start time"><span className={styles.liveDot} aria-hidden="true" /><strong>{!synced ? "Checking the start time…" : startRemaining > 0 ? "Networking starts in" : "Waiting for the Host to begin"}</strong>{synced && startRemaining > 0 ? <span className={styles.startTimer}>{networkingStartCountdown(startRemaining)}</span> : null}</div> : null}
    {error ? <div className={styles.notice} role="alert"><p>{error}</p><button type="button" className="button button-outline" onClick={() => void refresh()} disabled={busy}>Try again</button></div> : null}
    {manager ? <>
      {!session || session.status === "scheduled" ? <>
        <button className="button button-outline" type="button" aria-expanded={formOpen} onClick={() => setFormOpen(!formOpen)}>{session ? "Edit schedule" : "Set up networking"}</button>
        {formOpen ? <form className={styles.form} onSubmit={e => { e.preventDefault(); void save(); }}>
          <p>Guests meet in pairs. Choose a time within your event. Times are shown in {timeZone.split("/").at(-1)?.replaceAll("_", " ")} time.</p>
          <div className={styles.fields}><label>Starts<input required type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label><label>Finishes<input required type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
          <label>Minutes per conversation<select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[2,3,4,5,6,7,8,10,12,15].map(x => <option key={x}>{x}</option>)}</select></label>
          <label>Time to change places<select value={changeover} onChange={e => setChangeover(Number(e.target.value))}><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={180}>3 minutes</option></select></label></div>
          <label>How many meeting points?<input type="number" min={1} max={30} required value={pointCount} onChange={e => { setPointCount(e.target.value); const count=Number(e.target.value); if(Number.isInteger(count) && count>=1 && count<=30) setPoints(Array.from({length:count},(_,i)=>`Table ${i+1}`).join("\n")); }} /></label><small>One point for each pair. Ten meeting points can accommodate twenty guests at once.</small>
          <details className={styles.waitingHelp}><summary>Name your meeting points (optional)</summary><label>One name per line<textarea required rows={3} value={points} onChange={e => {setPoints(e.target.value);setPointCount(String(e.target.value.split("\n").filter(x=>x.trim()).length));}} maxLength={1830}/></label></details>
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
      {!synced ? <p>Live attendance is unavailable until we reconnect.</p> : state.people?.length ? <div className={styles.roster}><h3>People taking part</h3><ul>{state.people.map((p, i) => <li key={i}><span>{p.name}</span><small>{p.choosing ? "Taking a moment" : !p.ready ? "Away / left" : p.paired ? "With an introduction" : "Ready for a new person"}</small></li>)}</ul></div> : <p>No guests have joined networking yet.</p>}
      {state.help?.length ? <div className={styles.notice}><h3>Guests asking for help</h3>{state.help.map(h => <article key={h.id}><strong>{h.name}</strong><p>{h.note}</p><button className="button button-outline" disabled={locked} onClick={() => void run("resolve_event_networking_help", { p_help_id: h.id }, "Marked as handled.")}>Mark handled</button></article>)}</div> : null}
      <p className={styles.help}>Guests choose whether to join. A short break is normal when numbers are uneven. Keep this panel open to see who needs help.</p>
    </> : state && session ? <>
      {phase === "finished" ? <p>Networking has finished. You can choose to stay connected with the people you met below.</p>
        : phase === "disabled" || phase === "paused" ? <p>The event team has paused networking. You do not need to do anything.</p>
        : !state.eligible ? <p>Have your event pass checked at the door first. Then return here to join networking.</p>
        : state.end_notice ? <div className={styles.ended} key={state.end_notice.id}>
          <div role="status" aria-live="polite"><p className={styles.eyebrow}>Take a moment</p><h3>{state.end_notice.conversation ? "This conversation has ended" : "This introduction has ended"}</h3>
          <p>You are not being matched right now. When you’re ready, we’ll find someone new. You won’t be paired with this person again at this event.</p></div>
          <div className={styles.actions}><button className="button button-primary" disabled={locked || phase === "scheduled"} onClick={() => void run("continue_event_networking", { p_notice_id: state.end_notice!.id }, "You’re ready for another introduction.")}>Find someone else</button>
          <button className="button button-outline" disabled={locked} onClick={() => void leaveNetworking()}>Leave networking</button>
          <button className="button button-quiet" disabled={locked} onClick={() => void help()}>Get help</button></div>
        </div>
        : !state.joined && !entryOpen ? invitationLive && !invitationDismissed ? <div className={styles.invitation} aria-label="Networking invitation">
          <div className={styles.invitationCopy}><p role="status">Meet other guests, one conversation at a time.</p><small><span className={styles.checkMark} aria-hidden="true">✓</span> You’re checked in <span aria-hidden="true">·</span> Joining is optional</small></div>
          <div className={styles.invitationClock}><small>Session ends in</small><strong aria-label="Networking session time remaining">{networkingCountdown(networkingRemaining(session.ends_at, now))}</strong></div>
          <div className={styles.invitationActions}><button type="button" className="button button-primary" disabled={locked} onClick={() => setEntryOpen(true)}>Join networking</button><button type="button" className={`button button-quiet ${styles.notNow}`} onClick={deferNetworking}>Not now</button></div>
        </div> : <div className={styles.joinStrip}><p>{invitationDismissed ? "Join whenever you’re ready." : "Short conversations with other guests."}<small>{invitationDismissed ? `Networking finishes at ${time(session.ends_at)}. Your event place is unchanged.` : "Optional, for checked-in guests."}</small></p><button className={`button ${invitationDismissed ? "button-outline" : "button-primary"}`} disabled={locked} onClick={() => setEntryOpen(true)}>Join networking</button></div>
        : !state.joined ? <form className={styles.form} onSubmit={e => { e.preventDefault(); void run("join_event_networking", { p_join: true, p_introduction: introduction }, "You joined networking. Keep this panel open while taking part."); }}>
          <div className={styles.entryHeading}><h3>What would you like her to know?</h3><p>One sentence is enough. You can leave networking whenever you like.</p></div>
          <label>A short introduction<textarea required minLength={5} maxLength={280} rows={2} value={introduction} onChange={e => setIntroduction(e.target.value)} placeholder="I run a food business and would enjoy meeting other founders." /></label><small>Only your first name, profile photo and introduction appear to your match. Please leave out contact details.</small>
          <div className={styles.invitationActions}><button className="button button-primary" disabled={locked}>Join networking</button><button className={`button button-quiet ${styles.notNow}`} type="button" disabled={busy} onClick={deferNetworking}>Not now</button></div>
        </form> : <>
          {match ? <article className={styles.match} key={match.id}>
            <div className={styles.person}><div className={`${styles.matchOrbit}${phase === "offered" ? ` ${styles.newMatch}` : ""}`}>{match.person.avatar_url ? <img src={match.person.avatar_url} width={112} height={112} alt="" onError={e => { e.currentTarget.hidden = true; }} /> : null}<span className={styles.initial} aria-hidden="true">{match.person.name.slice(0,1)}</span></div><div><p className={styles.eyebrow}>{phase === "talking" ? "You’re both ready" : "Your next introduction"}</p><h3>Meet {match.person.name}</h3><p>{match.person.introduction}</p></div></div>
            <div className={styles.meeting}><div><small>Meeting point</small><strong>{match.point}</strong></div><div className={styles.meetingClock}><small>{phase === "talking" ? "Time together" : "Time to accept"}</small><span className={styles.timer} aria-label={phase === "talking" ? "Conversation time remaining" : "Time to accept"}>{networkingCountdown(networkingRemaining(phase === "talking" ? match.ends_at : match.accept_by, now))}</span></div></div>
            {phase === "talking" ? <div className={styles.prompt}><small>A conversation starter</small><p>{session.prompt || "What would you enjoy sharing with each other?"}</p></div> : <p className={styles.acceptance}>{match.accepted ? "You said yes. Waiting for her reply." : "Would you like to meet? You both choose."}</p>}
            <div className={styles.actions}>{phase === "offered" && !match.accepted ? <button className="button button-primary" disabled={locked} onClick={() => void run("answer_event_networking", { p_match_id: match.id, p_accept: true }, "Accepted. Waiting for both of you to be ready.")}>Accept introduction</button> : null}
              <button className="button button-outline" disabled={locked} onClick={() => void endIntroduction(match.id, phase === "talking")}>{phase === "talking" ? "End conversation" : "Skip"}</button></div>
          </article> : <div className={`${styles.waiting}${phase === "waiting" && synced ? ` ${styles.searching}` : ""}`}>
            {phase === "waiting" && synced ? <div className={styles.dialGroup}><div className={styles.dial} style={{"--network-progress":roundProgress} as CSSProperties}><div className={`${styles.radar}${animationPaused ? ` ${styles.radarPaused}` : ""}`} aria-hidden="true"><i /><i /></div><div className={styles.dialText}><small>Round {session.round_no}</small><span className={styles.timer} aria-label="Round time remaining">{networkingCountdown(roundRemaining)}</span><small>remaining</small></div></div><button className={styles.motionToggle} type="button" aria-pressed={animationPaused} onClick={() => setAnimationPaused(!animationPaused)}>{animationPaused ? "Resume animation" : "Pause animation"}</button></div> : null}
            <div className={styles.waitingCopy}><h3 role="status">{!synced ? "Reconnecting to networking" : phase === "scheduled" ? "You are ready" : phase === "changeover" ? "A moment to move" : "Finding your next introduction"}</h3><p>{phase === "scheduled" ? "The Host will begin shortly. Keep this page open." : phase === "changeover" ? "Your next introduction will appear here." : "Stay here. We’ll introduce you to someone new."}</p>
            {synced && phase === "waiting" ? <details className={styles.waitingHelp}><summary>Why might I wait?</summary><p>We match checked-in guests who chose to join. If everyone is paired, you may have a short break. Introductions never repeat.</p></details> : null}
            {phase === "changeover" && session.next_at ? <p className={styles.roundTime}>Next round <span className={styles.timer}>{networkingCountdown(networkingRemaining(session.next_at, now))}</span></p> : null}</div></div>}
          <div className={styles.actions}><button className="button button-outline" disabled={busy} onClick={() => void leaveNetworking()}>Leave networking</button><button className="button button-quiet" disabled={busy} onClick={() => void help()}>Get help</button></div>
        </>}
      {state.met?.length ? <details className={styles.roster} open={phase === "finished"}><summary>People you met · {state.met.length}</summary><ul>{state.met.map(p => <li key={p.match_id}><span>{p.name}</span><button className="button button-outline" disabled={locked} onClick={() => void connect(p)}>Stay connected</button></li>)}</ul><p>Connections are optional. Nothing is sent until you confirm.</p>{phase === "finished" ? <p>This event history is available for 14 days. Accepted connections stay in <a href="/network?view=connections">Your connections</a>.</p> : null}</details> : null}
      {state.joined && ["paused", "disabled", "finished"].includes(phase) ? <div className={styles.actions}><button className="button button-outline" disabled={busy} onClick={() => void leaveNetworking()}>Leave networking</button></div> : null}
    </> : null}
    {message ? <p className={styles.notice} role="status">{message}</p> : null}
    {dialog}
  </section>;
}
