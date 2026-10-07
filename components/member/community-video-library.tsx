"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CommunityGatheringCard } from "./community-gatherings";
import type { GatheringVideo } from "./community-gathering-video";

type Recording = { card: CommunityGatheringCard; video: GatheringVideo };

export function CommunityVideoLibrary({ cards, slug, onOpen }: {
  cards: CommunityGatheringCard[]; slug: string; onOpen(slug: string): void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let running = false;
    let firstLoad = true;
    async function load() {
      if (running) return;
      running = true;
      // Never retain a previously authorised video after a failed access check.
      if (firstLoad) { setLoading(true); setRecordings([]); }
      setError(false);
      try {
        const found: Recording[] = [];
        // Bound simultaneous requests; use the same permission-checked RPC as the player.
        for (let start = 0; start < cards.length; start += 6) {
          const batch = await Promise.all(cards.slice(start, start + 6).map(async card => {
            const result = await supabase.rpc("get_community_gathering_video", { p_room_id: card.room_id });
            if (result.error) throw result.error;
            return { card, video: result.data as GatheringVideo | null };
          }));
          if (!active) return;
          for (const item of batch) {
            if (item.video?.video_id && item.video.is_visible && !item.video.admin_paused
              && (Date.now() <= new Date(item.card.ends_at).getTime() || item.video.keep_replay)) {
              found.push({ card: item.card, video: item.video });
            }
          }
        }
        if (active) setRecordings(found.sort((a, b) => new Date(b.card.starts_at).getTime() - new Date(a.card.starts_at).getTime()));
      } catch { if (active) { setRecordings([]); setError(true); } }
      finally { running = false; firstLoad = false; if (active) setLoading(false); }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [cards, retry, supabase]);

  if (loading) return <p role="status">Finding Community videos…</p>;
  if (error) return <div className="community-program-empty" role="alert"><strong>We couldn’t load the videos.</strong>
    <p>Please try again. If your membership has changed, return to your Community home.</p>
    <button type="button" onClick={() => setRetry(value => value + 1)}>Try again</button></div>;
  if (!recordings.length) return <div className="community-program-empty"><strong>No videos to watch yet.</strong>
    <p>Videos added to this Community’s gatherings will appear here.</p></div>;

  return <div className="community-video-library">
    {recordings.map(({ card }) => {
      const past = new Date(card.ends_at).getTime() < Date.now();
      const href = `/communities/${slug}?view=gatherings&gatheringArea=videos&gathering=${encodeURIComponent(card.event_slug)}`;
      return <article className="community-video-library-card" key={card.room_id}>
        <div className="community-video-library-symbol" aria-hidden="true">▶</div>
        <div><small>{past ? "Replay" : "Gathering video"} · {new Intl.DateTimeFormat("en-KE", {
          day: "numeric", month: "short", year: "numeric", timeZone: card.timezone || "Africa/Nairobi",
        }).format(new Date(card.starts_at))}</small>
          <h3><Link href={href} onClick={event => { event.preventDefault(); onOpen(card.event_slug); }}>{card.title}</Link></h3>
          {card.summary ? <p>{card.summary}</p> : null}
        </div>
        <Link className="button button-primary" href={href} onClick={event => { event.preventDefault(); onOpen(card.event_slug); }}>Watch & discuss</Link>
      </article>;
    })}
  </div>;
}
