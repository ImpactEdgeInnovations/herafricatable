"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export function PilotCommunityOpenControl({ communityId }: { communityId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function open() {
    setBusy(true);
    const { error } = await createClient().rpc("open_my_pilot_community", { p_community_id: communityId });
    setBusy(false);
    setMessage(error ? memberErrorMessage(error, "open your Community") : "Your Community is open. You can now welcome and invite members.");
    if (!error) router.refresh();
  }
  return <section className="event-free-booking-control"><div><p className="eyebrow">Founding member pilot</p><h2>Ready to welcome people?</h2><p>Open your first free Community using your saved idea and joining choice. You can refine its public description afterwards.</p></div><button className="button button-primary" type="button" disabled={busy} onClick={() => void open()}>{busy ? "Opening…" : "Open my Community"}</button>{message ? <p role="status">{message}</p> : null}</section>;
}
