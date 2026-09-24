"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type EventIntroCard = {
  code: string;
  enabled: boolean;
  introduction: string;
  paused_at: string | null;
  pause_reason: string | null;
};

export type EventIntroRequest = {
  request_id: string;
  other_user_id: string;
  other_name: string;
  direction: "received" | "sent";
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

export function EventIntroWorkspace({ card, eventId, eventSlug, eventTitle, qrImage, requests }: {
  card: EventIntroCard | null;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  qrImage: string | null;
  requests: EventIntroRequest[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [enabled, setEnabled] = useState(card?.enabled ?? false);
  const [introduction, setIntroduction] = useState(card?.introduction ?? "");
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const shareUrl = card?.enabled ? `${typeof window !== "undefined" ? window.location.origin : ""}/events/${eventSlug}/meet/${card.code}` : null;

  async function save(rotate = false) {
    setBusy(rotate ? "rotate" : "save");
    setMessage("");
    const { error } = await supabase.rpc("save_event_intro_card", {
      p_event_id: eventId,
      p_enabled: enabled,
      p_introduction: introduction.trim(),
      p_rotate: rotate,
    });
    setBusy("");
    setMessage(error
      ? memberErrorMessage(error, "save your event introduction")
      : rotate ? "Your old code no longer works. Share this new one only with people you choose."
        : enabled ? "Your introduction is ready to share." : "Your introduction is hidden.");
    if (!error) router.refresh();
  }

  function openManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = manualCode.toUpperCase().replace(/[\s-]/g, "");
    if (!/^[0-9A-F]{16}$/.test(code)) {
      setMessage("Enter the 16 letters and numbers from her introduction card.");
      return;
    }
    router.push(`/events/${eventSlug}/meet/${code}`);
  }

  async function decide(requestId: string, action: "accept" | "decline") {
    setBusy(requestId);
    setMessage("");
    const { error } = await supabase.rpc("review_event_intro", {
      p_request_id: requestId, p_action: action,
    });
    setBusy("");
    setMessage(error
      ? memberErrorMessage(error, "answer this introduction")
      : action === "accept" ? "You both agreed to meet at this event." : "You declined the introduction.");
    if (!error) router.refresh();
  }

  return <main className="event-intro-page">
    <header className="legal-header"><Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Event introductions</small></span></Link><Link href={`/events/${eventSlug}`}>Back to event</Link></header>
    <div className="event-intro-shell">
      <div className="event-intro-heading"><p className="eyebrow">For confirmed guests</p><h1>Meet at {eventTitle}</h1><p>Share a short hello with someone in the room. Your entry pass is separate. This card never shows your email, phone number or member-network profile.</p></div>
      <div className="event-intro-grid">
        <section className="event-intro-panel">
          <h2>Your introduction card</h2>
          {card?.paused_at ? <p role="alert">The event team has paused this card. {card.pause_reason || "Please contact support if you need help."}</p> : null}
          <label className="event-intro-toggle"><input checked={enabled} disabled={Boolean(card?.paused_at) || Boolean(busy)} onChange={(event) => setEnabled(event.target.checked)} type="checkbox" /><span>Let me share my introduction</span></label>
          <label htmlFor="event-intro-text">What would you enjoy talking about?</label>
          <textarea id="event-intro-text" maxLength={280} rows={4} value={introduction} disabled={Boolean(card?.paused_at) || Boolean(busy)} onChange={(event) => setIntroduction(event.target.value)} placeholder="I’m building a small business and would love to meet others working in regional trade." />
          <p className="event-intro-help">10–280 characters. Please keep links and contact details out of this card.</p>
          <div className="portal-actions"><button className="button button-primary" disabled={Boolean(card?.paused_at) || Boolean(busy)} onClick={() => void save()} type="button">{busy === "save" ? "Saving…" : "Save my choice"}</button></div>
          {card?.enabled && qrImage ? <div className="event-intro-share">
            <img src={qrImage} alt={`Introduction QR for ${eventTitle}`} width={208} height={208} />
            <p>Show this code to another confirmed guest. It is not your entry pass.</p>
            <strong aria-label="Manual introduction code">{card.code.match(/.{1,4}/g)?.join(" ")}</strong>
            <div className="portal-actions">{shareUrl ? <button className="button button-outline" type="button" onClick={() => void navigator.clipboard.writeText(shareUrl).then(() => setMessage("Introduction link copied.")).catch(() => setMessage("Copy is unavailable. Show the QR or manual code instead."))}>Copy link</button> : null}<button className="button button-quiet" disabled={Boolean(busy)} type="button" onClick={() => void save(true)}>Change my code</button></div>
          </div> : null}
        </section>
        <section className="event-intro-panel">
          <h2>Meet someone here</h2>
          <p>Scan the QR on her introduction card with your phone camera. If the camera is unavailable, enter her manual code.</p>
          <form onSubmit={openManualCode}><label htmlFor="event-intro-manual">Manual code</label><input id="event-intro-manual" value={manualCode} maxLength={23} autoCapitalize="characters" autoComplete="off" onChange={(event) => setManualCode(event.target.value)} placeholder="ABCD EFGH 1234 5678" /><button className="button button-outline" type="submit">Open introduction</button></form>
          <h3>Your introductions</h3>
          {requests.length ? <ul className="event-intro-requests">{requests.map((request) => <li key={request.request_id}><div><strong>{request.other_name}</strong><span>{request.direction === "received" ? "Asked to meet you" : "You asked to meet"} · {request.status === "accepted" ? "Accepted" : request.status === "declined" ? "Not accepted" : "Waiting for a reply"}</span></div>{request.direction === "received" && request.status === "pending" ? <div className="portal-actions"><button className="button button-primary" disabled={Boolean(busy)} type="button" onClick={() => void decide(request.request_id, "accept")}>Accept</button><button className="button button-outline" disabled={Boolean(busy)} type="button" onClick={() => void decide(request.request_id, "decline")}>Decline</button></div> : null}</li>)}</ul> : <p>No introductions yet. It is always your choice whether to share or accept.</p>}
        </section>
      </div>
      {message ? <p className="manager-message" role="status">{message}</p> : null}
    </div>
  </main>;
}
