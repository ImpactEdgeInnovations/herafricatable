"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { CommunityGatheringInline } from "./community-gathering-inline";
import { CommunityVideoLibrary } from "./community-video-library";

export type CommunityGatheringCard = {
  room_id: string;
  event_id: string;
  event_slug: string;
  title: string;
  summary: string | null;
  format: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  venue_name: string | null;
  city: string | null;
  country: string | null;
  gathering_kind: string;
  chat_phase: "before" | "open" | "archived" | "closed";
  my_rsvp: "going" | "not_going" | null;
  going_count: number;
  question_count: number;
  recap_published: boolean;
};

function gatheringLabel(value: string) {
  const labels: Record<string, string> = {
    accountability_session: "Accountability session",
    community_catch_up: "Community catch-up",
    guest_conversation: "Guest conversation",
    networking_circle: "Networking circle",
    social_wellbeing: "Social & wellbeing",
    webinar: "Online gathering",
    workshop: "Workshop",
  };
  return labels[value] ?? "Community gathering";
}

function timingLabel(card: CommunityGatheringCard) {
  if (new Date(card.ends_at).getTime() < Date.now()) return card.recap_published ? "Recap ready" : "Past gathering";
  if (card.chat_phase === "open") return "Conversation open";
  if (card.chat_phase === "archived") return card.recap_published ? "Recap ready" : "Past gathering";
  if (card.chat_phase === "closed") return "Conversation closed";
  return "Coming up";
}

export function CommunityGatherings({
  cards,
  migrationReady,
  slug,
  communityId,
  currentUserId,
  initialSelection,
  initialArea,
  canManage = false,
}: {
  cards: CommunityGatheringCard[];
  migrationReady: boolean;
  slug: string;
  communityId: string;
  currentUserId: string;
  initialSelection?: string;
  initialArea?: string;
  canManage?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState(cards);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [area,setArea] = useState<"upcoming" | "past" | "videos">(() => {
    if (initialArea === "videos" || initialArea === "past") return initialArea;
    const initial = cards.find(card => card.event_slug === initialSelection);
    return initial && new Date(initial.ends_at).getTime() < Date.now() ? "past" : "upcoming";
  });
  const [selected,setSelected] = useState(initialSelection ?? "");
  useEffect(()=>setItems(cards),[cards]);
  useEffect(()=>{const update=()=>{
    const params = new URL(window.location.href).searchParams;
    setSelected(params.get("gathering") ?? "");
    const next = params.get("gatheringArea");
    setArea(next === "videos" || next === "past" ? next : "upcoming");
  }; window.addEventListener("popstate",update);return()=>window.removeEventListener("popstate",update);},[]);
  function select(slug: string) {
    setSelected(slug);
    const url = new URL(window.location.href); url.searchParams.set("view","gatherings");
    url.searchParams.set("gatheringArea",area);
    if(slug) url.searchParams.set("gathering",slug); else url.searchParams.delete("gathering");
    window.history.pushState(null,"",url.toString());
  }
  function changeArea(next: "upcoming" | "past" | "videos") {
    setArea(next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", "gatherings");
    url.searchParams.set("gatheringArea", next);
    url.searchParams.delete("gathering");
    window.history.pushState(null, "", url.toString());
  }
  const upcoming = items.filter((item) => new Date(item.ends_at).getTime() >= Date.now());
  const past = items.filter((item) => new Date(item.ends_at).getTime() < Date.now());

  async function rsvp(card: CommunityGatheringCard) {
    setBusyId(card.room_id);
    setMessage("");
    const next = card.my_rsvp === "going" ? "not_going" : "going";
    const { error } = await supabase.rpc("set_community_gathering_rsvp", {
      p_discoverable: false,
      p_room_id: card.room_id,
      p_status: next,
    });
    setBusyId(null);
    if (error) {
      setMessage(memberErrorMessage(error, "save your place"));
      return;
    }
    setItems((current) => current.map((item) => item.room_id === card.room_id ? {
      ...item,
      going_count: Math.max(0, Number(item.going_count) + (next === "going" ? 1 : -1)),
      my_rsvp: next,
    } : item));
    setMessage(next === "going" ? "Your place is saved." : "Your response was updated.");
  }

  function renderCard(card: CommunityGatheringCard) {
    const timezone = card.timezone || "Africa/Nairobi";
    const roomHref = `/communities/${slug}/gatherings/${card.event_slug}`;
    return (
      <article className={`gathering-card is-${card.chat_phase}`} key={card.room_id}>
        <div className="gathering-date" aria-hidden="true">
          <strong>{new Intl.DateTimeFormat("en-KE", { day: "2-digit", timeZone: timezone }).format(new Date(card.starts_at))}</strong>
          <span>{new Intl.DateTimeFormat("en-KE", { month: "short", timeZone: timezone }).format(new Date(card.starts_at))}</span>
        </div>
        <div className="gathering-card-copy">
          <div className="gathering-card-meta">
            <span>{timingLabel(card)}</span>
            <span>{gatheringLabel(card.gathering_kind)}</span>
          </div>
          <h3><Link href={`/communities/${slug}?view=gatherings&gathering=${encodeURIComponent(card.event_slug)}`} onClick={(event)=>{event.preventDefault();select(card.event_slug);}}>{card.title}</Link></h3>
          <p>{card.summary || "The Host will share more details soon."}</p>
          <small>
            {new Intl.DateTimeFormat("en-KE", {
              day: "numeric", hour: "numeric", minute: "2-digit", month: "long",
              timeZone: timezone, timeZoneName: "short", weekday: "short",
            }).format(new Date(card.starts_at))}
            {" · "}
            {card.city ? `${card.city}, ${card.country}` : card.format === "virtual" ? "Online" : card.format === "hybrid" ? "In person and online" : "In person"}
          </small>
          {new Date(card.ends_at).getTime() >= Date.now() ? <div className="gathering-card-signals">
            {canManage ? <span>{Number(card.going_count)} going · Host only</span> : null}
            {Number(card.question_count) ? <span>{Number(card.question_count)} questions</span> : null}
          </div> : null}
        </div>
        <div className="gathering-card-actions">
          <Link className="button button-primary" href={roomHref} onClick={(event)=>{event.preventDefault();select(card.event_slug);}}>
            {card.chat_phase === "open" ? "Open gathering" : card.chat_phase === "archived" ? "View recap" : "View details"}
          </Link>
          {new Date(card.ends_at).getTime() >= Date.now() ? (
            <button disabled={busyId === card.room_id} onClick={() => void rsvp(card)} type="button">
              {card.my_rsvp === "going" ? "I can’t make it" : "Save my place"}
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <section className="community-gatherings" aria-labelledby="community-gatherings-title">
      <header className="community-section-heading" hidden={Boolean(selected)}>
        <div>
          <p className="eyebrow">Gatherings</p>
          <h2 id="community-gatherings-title">{area === "videos" ? "Community videos" : area === "upcoming" ? "Upcoming gatherings" : "Past gatherings"}</h2>
        </div>
        <p>{area === "videos" ? "Each video stays with its gathering and conversation." : "Choose a gathering to see details, save your place or join the conversation."}</p>
      </header>
      {selected && items.find(item=>item.event_slug===selected) ? <CommunityGatheringInline card={items.find(item=>item.event_slug===selected)!} communityId={communityId} currentUserId={currentUserId} onClose={()=>select("")} backLabel={area === "videos" ? "Back to videos" : "Back to gatherings"} /> : selected ? <div role="status"><p>This gathering is no longer available in your Community.</p><button type="button" onClick={()=>select("")}>{area === "videos" ? "Back to videos" : "Back to gatherings"}</button></div> : null}
      <div hidden={Boolean(selected)}>
      <div className="community-gathering-toolbar"><div role="group" aria-label="Gathering dates">
        <button type="button" aria-pressed={area==="upcoming"} onClick={()=>changeArea("upcoming")}>Upcoming <span>{upcoming.length}</span></button>
        <button type="button" aria-pressed={area==="past"} onClick={()=>changeArea("past")}>Past <span>{past.length}</span></button>
        <button type="button" aria-pressed={area==="videos"} onClick={()=>changeArea("videos")}>Videos</button>
      </div>{canManage ? <div className="community-gathering-host-actions"><Link href={`/communities/${slug}/host#gathering-proposals`}>Create a gathering</Link><Link href={`/communities/${slug}/host#community-video`}>Add a video</Link><Link href={`/communities/${slug}/host#gatherings`}>Link an event</Link></div> : null}</div>
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {!migrationReady ? (
        <div className="community-program-empty">
          <strong>The new gathering rooms are being prepared.</strong>
          <p>Your existing Community events are safe. Please try again later.</p>
        </div>
      ) : area === "videos" ? <CommunityVideoLibrary cards={items} slug={slug} onOpen={select} /> : (area === "upcoming" ? upcoming : past).length ? (
        <div className="gathering-list">{(area === "upcoming" ? upcoming : past).map(renderCard)}</div>
      ) : (
        <div className="community-program-empty">
          <strong>{area === "past" ? "No past gatherings yet." : "No gathering is scheduled yet."}</strong>
          <p>When your Host schedules one, it will appear here. You can browse the main event calendar in the meantime.</p>
          <Link href="/events">Explore events</Link>
        </div>
      )}
      <footer className="gathering-boundary-note">
        <p>Each gathering has its own conversation. Look in Past gatherings for earlier discussions and recaps.</p>
      </footer>
      </div>
    </section>
  );
}
