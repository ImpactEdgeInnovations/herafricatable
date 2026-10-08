"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { youtubeVideoId } from "@/lib/youtube";
import { communityDraftKey } from "@/lib/community-drafts";
import { useCommunityDraft } from "@/lib/use-community-draft";

export type GatheringVideo = {
  video_id: string | null;
  is_visible: boolean;
  keep_replay: boolean;
  admin_paused: boolean;
  viewing_mode?: "watch_together" | "watch_anytime";
  content_kind?: "scheduled" | "prerecorded";
};

export function CommunityGatheringVideo({ roomId, canManage, endsAt, title, initialVideo, initialLink = "", ready, onSaved, currentUserId }: {
  roomId: string; canManage: boolean; endsAt: string; title: string;
  initialVideo: GatheringVideo | null; ready: boolean;
  initialLink?: string;
  onSaved?(): void;
  currentUserId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [video, setVideo] = useState(initialVideo);
  const [settings, setSettings, clearSettings] = useCommunityDraft(communityDraftKey(currentUserId, "gathering-video", roomId), {
    link: initialVideo?.video_id ? `https://www.youtube.com/watch?v=${initialVideo.video_id}` : initialLink,
    visible: initialVideo?.is_visible ?? true, keepReplay: initialVideo?.keep_replay ?? true,
    viewingMode: initialVideo?.viewing_mode ?? "watch_together",
  });
  const { link, visible, keepReplay, viewingMode } = settings;
  const setLink = (value: string) => setSettings(current => ({ ...current, link: value }));
  const setVisible = (value: boolean) => setSettings(current => ({ ...current, visible: value }));
  const setKeepReplay = (value: boolean) => setSettings(current => ({ ...current, keepReplay: value }));
  const setViewingMode = (value: "watch_together" | "watch_anytime") => setSettings(current => ({ ...current, viewingMode: value }));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [playing, setPlaying] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const finished = Date.now() > new Date(endsAt).getTime();

  // Re-check access and Host/Admin changes while a member watches. No anonymous link endpoint.
  useEffect(() => {
    let current = true;
    async function refresh() {
      if (!ready) return;
      const { data, error } = await supabase.rpc("get_community_gathering_video", { p_room_id: roomId });
      if (!current) return;
      if (error) { setAllowed(false); setPlaying(false); setVideo(null); }
      else { setAllowed(true); setVideo(data as GatheringVideo | null); }
    }
    const timer = window.setInterval(() => void refresh(), 30000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { current = false; window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [ready, roomId, supabase]);

  async function save(event: { preventDefault(): void }, remove = false) {
    event.preventDefault();
    const id = remove || !link.trim() ? null : youtubeVideoId(link);
    if (!remove && link.trim() && !id) return setNotice("Paste a YouTube video or livestream link, not a channel link.");
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.rpc("save_community_gathering_video_experience", {
        p_room_id: roomId, p_video_id: id, p_is_visible: visible, p_keep_replay: keepReplay,
        p_viewing_mode: viewingMode,
      });
      if (error) throw error;
      setVideo(data as GatheringVideo | null); setPlaying(false);
      onSaved?.();
      clearSettings({ link: id ? `https://www.youtube.com/watch?v=${id}` : "", visible, keepReplay, viewingMode });
      setNotice(id ? "Video saved. Your gathering conversation stays in the same place." : "Video removed. The conversation is still here.");
    } catch (error) { setNotice(memberErrorMessage(error, "save this video")); }
    finally { setBusy(false); }
  }

  const watchable = allowed && video?.video_id && video.is_visible && !video.admin_paused && (!finished || video.keep_replay);
  if (!canManage && !watchable && allowed) return null;
  return (
    <section className="gathering-video" id="gathering-video" aria-labelledby="gathering-video-title">
      <header hidden={!watchable && canManage}><h2 id="gathering-video-title">{video?.viewing_mode === "watch_anytime" ? "Watch anytime" : finished ? "Watch the replay" : "Watch & discuss"}</h2>
        <p>{video?.viewing_mode === "watch_anytime" ? <>Watch at your own pace, then <a href="#gathering-discussion">join the discussion</a>.</> : "Watch here and use this gathering’s conversation to share your thoughts."}</p></header>
      {!allowed ? <p role="status">Video access has changed. Return to your Community to check your membership.</p> : null}
      {watchable ? <>
        <div className="gathering-video-player">
          {playing ? <iframe key={video.video_id} title={`${title} — YouTube video`}
            src={`https://www.youtube-nocookie.com/embed/${video.video_id}?autoplay=0&playsinline=1`}
            allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin" />
            : <button className="gathering-video-load" type="button" onClick={() => setPlaying(true)}>
              <span aria-hidden="true">▶</span><strong>{finished ? "Load replay" : "Load video"}</strong>
              <small>Video is provided by YouTube. It won’t play automatically.</small>
            </button>}
        </div>
        <p className="gathering-video-note">For Community members. A YouTube link can still be shared and watched outside this platform.</p>
        {playing ? <details><summary>Video not playing?</summary><p>The Host may not have started yet, or YouTube may have disabled playback here.</p>
          <a href={`https://www.youtube.com/watch?v=${video.video_id}`} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a></details> : null}
      </> : canManage && video?.video_id ? <p className="gathering-video-note">{video?.admin_paused ? "Admin has paused this video. Only Admin can resume it." : "This video is hidden from members."}</p> : null}
      {canManage ? <details className="gathering-video-settings"><summary>{video?.video_id ? "Manage video" : "Add an optional video"}</summary>
        {!ready ? <p role="status">Video settings are not available yet. Ask Admin to complete the livestream setup.</p> : <>
          <form onSubmit={(event) => void save(event)}>
            {video?.content_kind === "prerecorded" ? <p>Members can watch and reply at their own pace.</p> : <><label htmlFor="gathering-viewing-mode">How will members watch?</label>
            <select id="gathering-viewing-mode" value={viewingMode} onChange={event => setViewingMode(event.target.value as "watch_together" | "watch_anytime")} disabled={busy}>
              <option value="watch_together">Watch together — scheduled live chat</option>
              <option value="watch_anytime">Watch anytime — lasting conversation</option>
            </select></>}
            <label htmlFor="gathering-youtube-link">YouTube video or livestream link</label>
            <input id="gathering-youtube-link" type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" maxLength={500} disabled={busy} />
            <label><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} disabled={busy} /> Show video to Community members</label>
            {video?.content_kind !== "prerecorded" ? <label><input type="checkbox" checked={keepReplay} onChange={(event) => setKeepReplay(event.target.checked)} disabled={busy} /> Keep the replay after the gathering</label> : null}
            <div className="gathering-video-actions"><button className="button button-primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save video"}</button>
              {video?.video_id ? <button disabled={busy} type="button" onClick={(event) => void save(event, true)}>Remove video</button> : null}</div>
          </form>
          <details><summary>How to add a YouTube livestream</summary><ol>
            <li>Use your own channel. In YouTube Studio, select Create → Go live and schedule your broadcast. YouTube may require channel verification and activation first.</li>
            <li>Choose Unlisted if you do not want it listed publicly. Anyone with its link can still watch.</li>
            <li>Allow embedding in the broadcast’s settings.</li>
            <li>Copy the individual video’s Share link and paste it above—not your channel address.</li>
            <li>Start the broadcast in YouTube when ready. Turn off “Keep the replay” if you do not want it shown here afterwards.</li>
          </ol><p>Get permission from people appearing in your broadcast. Do not share confidential information in an unlisted stream.</p></details>
        </>}
      </details> : null}
      {notice ? <p className="form-message" role="status">{notice}</p> : null}
    </section>
  );
}
