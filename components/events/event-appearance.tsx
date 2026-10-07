"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { brandAccent, brandThemes, type BrandAccent } from "@/lib/brand-themes";
import { memberErrorMessage } from "@/lib/member-error";

export function EventAppearance({ eventId, initialAccent, ready }: { eventId: string; initialAccent: unknown; ready: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [saved, setSaved] = useState(brandAccent(initialAccent));
  const [accent, setAccent] = useState<BrandAccent>(saved);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await supabase.rpc("set_event_appearance", { p_event_id: eventId, p_accent_key: accent });
      if (result.error) throw result.error;
      setSaved(accent); setMessage("Event colour saved."); router.refresh();
    } catch (cause) { setMessage(memberErrorMessage(cause, "save your event colour")); }
    finally { setBusy(false); }
  }
  return <details className="event-appearance" id="event-appearance"><summary>Event colour</summary>
    <p>Choose a colour for small details and buttons. Text and reading backgrounds stay clear and easy to read.</p>
    {!ready ? <p role="status">Colour settings are not available just now. Your event is unchanged.</p> : <form onSubmit={save}>
      <fieldset disabled={busy} className="safe-accent-picker"><legend>Colour</legend><div>{brandThemes.map(theme => <label key={theme.key}><input type="radio" name="event-accent" value={theme.key} checked={accent === theme.key} onChange={() => setAccent(theme.key)} /><span style={{ backgroundColor: theme.accent }} aria-hidden="true" />{theme.label}</label>)}</div></fieldset>
      <div className="safe-brand-preview" data-brand-accent={accent}><strong>Colour preview</strong><p>Dark text on a light background, in every colour.</p><span className="safe-brand-preview-action">Button colour</span></div>
      <div className="safe-brand-actions"><button className="button button-primary" type="submit" disabled={busy || accent === saved}>{busy ? "Saving…" : "Save colour"}</button>{accent !== saved ? <button className="button button-outline" type="button" disabled={busy} onClick={() => setAccent(saved)}>Discard change</button> : null}</div>
    </form>}{message ? <p role="status">{message}</p> : null}
  </details>;
}
