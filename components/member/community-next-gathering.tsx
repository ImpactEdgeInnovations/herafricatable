"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { CommunityGatheringCard } from "./community-gatherings";

export function CommunityNextGathering({ cards, slug }: { cards: CommunityGatheringCard[]; slug: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(timer); }, []);
  if (now === null) return null;
  const next = [...cards].filter((card) => new Date(card.ends_at).getTime() > now)
    .sort((a,b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];
  if (!next) return null;
  const remaining = now === null ? null : Math.max(0, new Date(next.starts_at).getTime() - now);
  const minutes = remaining === null ? null : Math.ceil(remaining / 60000);
  const countdown = minutes === null ? "" : minutes === 0 ? "Happening now" : minutes >= 1440 ? `In ${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h` : minutes >= 60 ? `In ${Math.floor(minutes/60)}h ${minutes%60}m` : `In ${minutes}m`;
  return <aside className="community-next-gathering" aria-label="Next Community gathering">
    <div><small>Next gathering</small><strong>{next.title}</strong><span>{new Intl.DateTimeFormat("en-KE", {day:"numeric",month:"short",hour:"numeric",minute:"2-digit",timeZone:next.timezone || "Africa/Nairobi",timeZoneName:"short"}).format(new Date(next.starts_at))}</span></div>
    <span className="community-next-countdown">{countdown}</span>
    <Link href={`/communities/${slug}?view=gatherings&gathering=${encodeURIComponent(next.event_slug)}`}>View gathering →</Link>
  </aside>;
}
