"use client";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { youtubeVideoId } from "@/lib/youtube";
import { memberErrorMessage } from "@/lib/member-error";

export function CommunityRecordingForm({ communityId }: { communityId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [expanded, setExpanded] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [destination, setDestination] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const videoId = youtubeVideoId(String(values.get("video") ?? ""));
    if (!videoId) { setNotice("Paste an individual YouTube video link, not a channel address."); return; }
    setBusy(true); setNotice("");
    try {
      const result = await supabase.rpc("create_community_video_discussion", {
        p_community_id: communityId, p_request_id: requestId,
        p_title: String(values.get("title") ?? ""), p_summary: String(values.get("summary") ?? ""),
        p_video_id: videoId, p_permission_confirmed: values.get("permission") === "on",
      });
      if (result.error) throw result.error;
      const saved = result.data as { event_slug: string; community_slug: string };
      setDestination(`/communities/${encodeURIComponent(saved.community_slug)}?view=gatherings&gatheringArea=videos&gathering=${encodeURIComponent(saved.event_slug)}`);
      setNotice("Your video discussion is open to Community members.");
      form.reset(); setExpanded(false);
    } catch (cause) { setNotice(memberErrorMessage(cause, "open this video discussion")); }
    finally { setBusy(false); }
  }
  return <section className="community-recording-form" id="community-video" aria-labelledby="community-recording-title">
    <header><div><h3 id="community-recording-title">Add a video discussion</h3><p>For members to watch and reply at their own pace. No event date or ticket is needed.</p></div>
      {!expanded ? <button className="button button-outline" type="button" onClick={() => { setRequestId(crypto.randomUUID()); setExpanded(true); setNotice(""); setDestination(""); }}>Add a video</button> : null}</header>
    {expanded ? <form onSubmit={submit}>
      <label>Video discussion name<input name="title" minLength={4} maxLength={140} placeholder="For example: World Today" required disabled={busy} /></label>
      <label>What will members discuss?<textarea name="summary" minLength={20} maxLength={2000} rows={3} placeholder="Tell members what the video is about and suggest a question." required disabled={busy} /></label>
      <label>YouTube video link<input name="video" type="url" maxLength={500} placeholder="https://www.youtube.com/watch?v=…" required disabled={busy} /></label>
      <p className="community-recording-note">Use a video that allows embedding. It stays within your Community here, but anyone with its YouTube link may watch elsewhere.</p>
      <label className="community-recording-consent"><input name="permission" type="checkbox" required disabled={busy} /> I have permission to share this video.</label>
      <div><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Opening…" : "Open for members"}</button><button className="button button-outline" type="button" disabled={busy} onClick={() => setExpanded(false)}>Close</button></div>
    </form> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {destination ? <Link className="button button-primary" href={destination}>Open video discussion</Link> : null}
  </section>;
}
