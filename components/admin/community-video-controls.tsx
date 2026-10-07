"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CommunityVideoControl = {
  room_id: string; title: string; community_name: string; admin_paused: boolean; is_visible: boolean;
};
export function CommunityVideoControls({ initialItems }: { initialItems: CommunityVideoControl[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function toggle(item: CommunityVideoControl) {
    setBusy(item.room_id); setMessage("");
    try {
      const { error } = await supabase.rpc("pause_community_gathering_video", { p_room_id: item.room_id, p_paused: !item.admin_paused });
      if (error) throw error;
      setItems((current) => current.map((video) => video.room_id === item.room_id ? { ...video, admin_paused: !video.admin_paused } : video));
      setMessage(item.admin_paused ? "Video resumed. Host visibility settings still apply." : "Video paused on this platform. This does not stop the broadcast on YouTube.");
    } catch (error) { setMessage(memberErrorMessage(error, "change video access")); }
    finally { setBusy(null); }
  }
  return <details className="community-admin-videos"><summary>Community videos <span>{items.length}</span></summary>
    <p>Pause a video without suspending the whole Community. Hosts cannot undo this pause.</p>
    {items.length ? items.map((item) => <article key={item.room_id}>
      <div><strong>{item.title}</strong><p>{item.community_name} · {item.admin_paused ? "Paused by Admin" : item.is_visible ? "Host visibility on" : "Hidden by Host"}</p></div>
      <button type="button" disabled={busy !== null} onClick={() => void toggle(item)}>{busy === item.room_id ? "Saving…" : item.admin_paused ? "Resume video" : "Pause video"}</button>
    </article>) : <p>No gathering videos have been added yet.</p>}
    {message ? <p role="status">{message}</p> : null}
  </details>;
}
