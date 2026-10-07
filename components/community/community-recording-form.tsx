"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { youtubeVideoId } from "@/lib/youtube";
import { memberErrorMessage } from "@/lib/member-error";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";

export function CommunityRecordingForm({ communityId, currentUserId }: { communityId: string; currentUserId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft, clearDraft, restored] = useCommunityDraft(communityDraftKey(currentUserId, "community-recording", communityId), {
    requestId: "", title: "", summary: "", link: "", permission: false,
  });
  const requestId = draft.requestId;
  useEffect(() => { if (restored) setExpanded(true); }, [restored]);
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
      form.reset(); clearDraft({ requestId: "", title: "", summary: "", link: "", permission: false }); setExpanded(false);
    } catch (cause) { setNotice(memberErrorMessage(cause, "open this video discussion")); }
    finally { setBusy(false); }
  }
  return <section className="community-recording-form" id="community-video" aria-labelledby="community-recording-title">
    <header><div><h3 id="community-recording-title">Add a video discussion</h3><p>For members to watch and reply at their own pace. No event date or ticket is needed.</p></div>
      {!expanded ? <button className="button button-outline" type="button" onClick={() => { if (!requestId) clearDraft({ ...draft, requestId: crypto.randomUUID() }); setExpanded(true); setNotice(""); setDestination(""); }}>{draft.title || draft.summary || draft.link ? "Continue video" : "Add a video"}</button> : null}</header>
    {expanded ? <form onSubmit={submit}>
      <label>Video discussion name<input name="title" minLength={4} maxLength={140} value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="For example: World Today" required disabled={busy} /></label>
      <label>What will members discuss?<textarea name="summary" minLength={20} maxLength={2000} rows={3} value={draft.summary} onChange={event => setDraft(current => ({ ...current, summary: event.target.value }))} placeholder="Tell members what the video is about and suggest a question." required disabled={busy} /></label>
      <label>YouTube video link<input name="video" type="url" maxLength={500} value={draft.link} onChange={event => setDraft(current => ({ ...current, link: event.target.value }))} placeholder="https://www.youtube.com/watch?v=…" required disabled={busy} /></label>
      <p className="community-recording-note">Use a video that allows embedding. It stays within your Community here, but anyone with its YouTube link may watch elsewhere.</p>
      <label className="community-recording-consent"><input name="permission" type="checkbox" checked={draft.permission} onChange={event => setDraft(current => ({ ...current, permission: event.target.checked }))} required disabled={busy} /> I have permission to share this video.</label>
      <div><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Opening…" : "Open for members"}</button><button className="button button-outline" type="button" disabled={busy} onClick={() => setExpanded(false)}>Close</button></div>
    </form> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {destination ? <Link className="button button-primary" href={destination}>Open video discussion</Link> : null}
  </section>;
}
