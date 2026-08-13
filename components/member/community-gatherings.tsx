"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

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
  if (card.chat_phase === "open") return "Conversation open";
  if (card.chat_phase === "archived") return card.recap_published ? "Recap ready" : "Past gathering";
  if (card.chat_phase === "closed") return "Conversation closed";
  return "Coming up";
}

export function CommunityGatherings({
  cards,
  migrationReady,
  slug,
}: {
  cards: CommunityGatheringCard[];
  migrationReady: boolean;
  slug: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState(cards);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
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
          <h3><Link href={roomHref}>{card.title}</Link></h3>
          <p>{card.summary || "The Host will share more details soon."}</p>
          <small>
            {new Intl.DateTimeFormat("en-KE", {
              day: "numeric", hour: "numeric", minute: "2-digit", month: "long",
              timeZone: timezone, timeZoneName: "short", weekday: "short",
            }).format(new Date(card.starts_at))}
            {" · "}
            {card.city ? `${card.city}, ${card.country}` : card.format.replaceAll("_", " ")}
          </small>
          <div className="gathering-card-signals">
            <span>{Number(card.going_count)} going</span>
            {Number(card.question_count) ? <span>{Number(card.question_count)} questions</span> : null}
          </div>
        </div>
        <div className="gathering-card-actions">
          <Link className="button button-primary" href={roomHref}>
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
      <header className="community-section-heading">
        <div>
          <p className="eyebrow">Gatherings</p>
          <h2 id="community-gatherings-title">Spend time together, with purpose.</h2>
        </div>
        <p>Save your place, share a question and join the live conversation here. Meeting links remain private until it is time to join.</p>
      </header>
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {!migrationReady ? (
        <div className="community-program-empty">
          <strong>The new gathering rooms are being prepared.</strong>
          <p>Your existing Community events are safe. Please try again later.</p>
        </div>
      ) : upcoming.length ? (
        <div className="gathering-list">{upcoming.map(renderCard)}</div>
      ) : (
        <div className="community-program-empty">
          <strong>No gathering is scheduled yet.</strong>
          <p>When your Host schedules one, it will appear here. You can browse the main event calendar in the meantime.</p>
          <Link href="/events">Explore events</Link>
        </div>
      )}
      {past.length ? (
        <details className="gathering-archive">
          <summary>Past gatherings <span>{past.length}</span></summary>
          <div className="gathering-list">{past.map(renderCard)}</div>
        </details>
      ) : null}
      <footer className="gathering-boundary-note">
        <strong>One Community, two useful spaces.</strong>
        <p>Gathering chat is for the moment. Lasting ideas return to Conversations through a Host-reviewed recap.</p>
      </footer>
    </section>
  );
}
