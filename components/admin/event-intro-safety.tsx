"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { useActionDialog } from "@/components/ui/action-dialog";

type IntroCard = {
  user_id: string;
  display_name: string;
  enabled: boolean;
  introduction: string;
  paused_at: string | null;
  pause_reason: string | null;
};

export function EventIntroSafety({ eventId }: { eventId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<IntroCard[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { setCards([]); setEnabled(null); setError(""); setMessage(""); setOpen(false); }, [eventId]);

  async function load() {
    setLoading(true);
    setError("");
    const [result, setting] = await Promise.all([
      supabase.rpc("list_admin_event_intro_cards", { p_event_id: eventId }),
      supabase.rpc("get_event_intro_enabled", { p_event_id: eventId }),
    ]);
    setLoading(false);
    if (result.error || setting.error) setError(adminErrorMessage(result.error ?? setting.error, "load event introductions"));
    else { setCards((result.data as IntroCard[] | null) ?? []); setEnabled(Boolean(setting.data)); }
  }

  async function changeAvailability() {
    const opening = !enabled;
    const response = await ask({
      title: opening ? "Open introductions for this event?" : "Pause all introductions?",
      description: opening
        ? "Only confirmed guests can share a card, and each person must opt in. Complete the separate-account and blocked-pair rehearsal before opening this pilot feature."
        : "Codes will stop opening cards immediately. Entry passes and existing introduction records stay unchanged.",
      confirmLabel: opening ? "Open introductions" : "Pause introductions",
      tone: opening ? "default" : "danger",
    });
    if (!response) return;
    setBusy("setting");
    setMessage("");
    const result = await supabase.rpc("set_event_intro_enabled", { p_event_id: eventId, p_enabled: opening });
    setBusy("");
    setMessage(result.error ? adminErrorMessage(result.error, "change introductions") : opening ? "Introductions are open for confirmed guests." : "Introductions are paused for this event.");
    if (!result.error) { await load(); router.refresh(); }
  }

  async function change(card: IntroCard) {
    const restoring = Boolean(card.paused_at);
    const response = await ask({
      title: restoring ? `Restore ${card.display_name}'s introduction card?` : `Pause ${card.display_name}'s introduction card?`,
      description: restoring
        ? "The guest may choose to share her card again. This does not accept pending introduction requests."
        : "The QR and manual code stop opening this card immediately. The guest receives a notice; records stay available for safety review.",
      confirmLabel: restoring ? "Restore card" : "Pause card",
      tone: restoring ? "default" : "danger",
      fields: restoring ? [] : [{ name: "reason", label: "Private reason for the event team", type: "textarea", required: true, minLength: 10, maxLength: 500 }],
    });
    if (!response) return;
    setBusy(card.user_id);
    setMessage("");
    const result = restoring
      ? await supabase.rpc("restore_event_intro_card", { p_event_id: eventId, p_user_id: card.user_id })
      : await supabase.rpc("close_event_intro_card", { p_event_id: eventId, p_user_id: card.user_id, p_reason: String(response.reason ?? "") });
    setBusy("");
    setMessage(result.error ? adminErrorMessage(result.error, "change this introduction card") : restoring ? "Card restored. The guest can decide whether to share it again." : "Card paused. Its code no longer opens it.");
    if (!result.error) { await load(); router.refresh(); }
  }

  return <div className="event-intro-admin-safety">
    <details open={open} onToggle={(event) => {
      const next = event.currentTarget.open;
      setOpen(next);
      if (next && !loading && cards.length === 0 && !error) void load();
    }}>
      <summary>Introduction card safety</summary>
      <p>Off by default. Open this only after the event introduction rehearsal. Guests opt in individually; their entry passes are unaffected.</p>
      {enabled !== null && !error ? <div className="event-intro-setting"><strong>{enabled ? "Open to confirmed guests" : "Not open yet"}</strong><button className="button button-outline" disabled={Boolean(busy)} onClick={() => void changeAvailability()} type="button">{enabled ? "Pause introductions" : "Open introductions"}</button></div> : null}
      {loading ? <p role="status">Loading introductions…</p> : error ? <p role="alert">{error}</p> : cards.length ? <ul>{cards.map((card) => <li key={card.user_id}><div><strong>{card.display_name}</strong><small>{card.paused_at ? "Paused by event team" : card.enabled ? "Sharing" : "Hidden by guest"}</small><p>{card.introduction}</p>{card.paused_at && card.pause_reason ? <small>Private reason: {card.pause_reason}</small> : null}</div><button className="button button-outline" type="button" disabled={Boolean(busy)} onClick={() => void change(card)}>{card.paused_at ? "Restore" : "Pause"}</button></li>)}</ul> : <p>No introduction cards for this event yet.</p>}
      {message ? <p role="status">{message}</p> : null}
    </details>
    {dialog}
  </div>;
}
