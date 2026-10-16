"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import type { EventImageStyle } from "@/lib/events/image-fit";

export function EventImageDisplayOptions({ eventId, imageUrl }: { eventId: string; imageUrl?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const saving = useRef(false);
  const [choice, setChoice] = useState<EventImageStyle>("automatic");
  const [saved, setSaved] = useState<EventImageStyle>("automatic");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let live = true;
    setReady(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("list_event_card_image_styles", { p_event_ids: [eventId] });
        if (error || !data?.length) throw error ?? new Error("Image display could not be loaded.");
        if (!live) return;
        const value = data[0].image_style === "complete" ? "complete" : "automatic";
        setChoice(value); setSaved(value); setReady(true); setMessage("");
      } catch (error) { if (live) setMessage(memberErrorMessage(error, "load the image display choice")); }
    })();
    return () => { live = false; };
  }, [eventId, supabase, attempt]);

  useEffect(() => {
    setWidth(0);
    if (!imageUrl) return;
    let live = true;
    const image = new Image();
    image.onload = () => { if (live) setWidth(image.naturalWidth); };
    image.src = imageUrl;
    return () => { live = false; image.onload = null; };
  }, [imageUrl]);

  async function save() {
    if (!ready || saving.current || choice === saved) return;
    saving.current = true; setBusy(true); setMessage("");
    let persisted = false;
    try {
      const { data, error } = await supabase.rpc("save_event_card_image_style", { p_event_id: eventId, p_style: choice });
      if (error) throw error;
      if (data !== choice) throw new Error("Refresh to check the saved image display before trying again.");
      persisted = true; setSaved(choice);
      setMessage("Image display saved. The original image has not changed.");
      router.refresh();
    } catch (error) {
      setMessage(persisted ? "Image display saved, but this page could not refresh. Reload to see the result." : `${memberErrorMessage(error, "save the image display")} Your choice is kept here. Reload to check the saved setting before trying again.`);
    } finally { saving.current = false; setBusy(false); }
  }

  return <section className="event-image-display-options" aria-label="Image display">
    <label>How should this image appear in event cards?
      <select disabled={!ready || busy} value={choice} onChange={(event) => setChoice(event.target.value as EventImageStyle)}>
        <option value="automatic">Photo — fill the frame automatically</option>
        <option value="complete">Poster — show the whole image</option>
      </select>
    </label>
    <p>Use Photo for pictures. Use Poster when every name, date or word needs to stay visible. Small images are fitted gently instead of being stretched to fill the card.</p>
    {width > 0 && width < 1200 ? <p className="event-image-quality-note" role="status">This image is {width} pixels wide. For a sharper result on larger screens, choose a photo at least 1200 pixels wide. You can keep this image; we will avoid heavy stretching.</p> : null}
    <button className="button button-small button-outline" disabled={!ready || busy || choice === saved} onClick={() => void save()} type="button">{busy ? "Saving…" : "Save image display"}</button>
    {!ready ? <button className="button button-small button-outline" onClick={() => setAttempt(value => value + 1)} type="button">Reload display options</button> : null}
    {message ? <p className="manager-message" role="status">{message}</p> : null}
  </section>;
}
