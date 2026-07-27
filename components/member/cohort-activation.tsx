"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";

export type CohortRoom = {
  cohort_status: "active" | "draft" | "read_only";
  community_id: string;
  event_id: string | null;
  event_slug: string | null;
  event_title: string | null;
  follow_up_until: string | null;
  introduction_prompt: string;
  welcome_message: string;
};

export type CohortIntroduction = {
  building: string;
  can_offer: string;
  company: string | null;
  display_name: string;
  identity: string;
  introduction_id: string;
  job_title: string | null;
  seeking: string;
  updated_at: string;
  user_id: string;
};

export function CohortActivation({
  currentUserId,
  introductions,
  room,
}: {
  currentUserId: string;
  introductions: CohortIntroduction[];
  room: CohortRoom;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const own = introductions.find((item) => item.user_id === currentUserId);

  async function saveIntroduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_community_introduction", {
      p_building: form.get("building"),
      p_can_offer: form.get("can_offer"),
      p_community_id: room.community_id,
      p_identity: form.get("identity"),
      p_seeking: form.get("seeking"),
    });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "save your introduction")
        : "Your introduction is now visible inside this private room.",
    );
    if (!error) router.refresh();
  }

  return (
    <section
      className="cohort-activation"
      aria-labelledby="cohort-welcome-title"
    >
      <header className="cohort-welcome">
        <div>
          <p className="eyebrow">Hosted founding room</p>
          <h2 id="cohort-welcome-title">Welcome to the table.</h2>
          <p>{room.welcome_message}</p>
        </div>
        <aside>
          <span>
            {room.cohort_status === "read_only" ? "Room archived" : "Room open"}
          </span>
          {room.event_slug ? (
            <Link href={`/events/${room.event_slug}`}>
              {room.event_title ?? "View event"} →
            </Link>
          ) : null}
          {room.follow_up_until ? (
            <small>
              Follow-up through{" "}
              {new Intl.DateTimeFormat("en-KE", {
                dateStyle: "medium",
              }).format(new Date(room.follow_up_until))}
            </small>
          ) : null}
        </aside>
      </header>

      {room.cohort_status === "active" ? (
        <div className="cohort-introduction-layout">
          <form onSubmit={(event) => void saveIntroduction(event)}>
            <div>
              <p className="eyebrow">
                {own ? "Your introduction" : "Begin here"}
              </p>
              <h3>
                {own ? "Refine your introduction." : "Introduce yourself."}
              </h3>
              <p>{room.introduction_prompt}</p>
            </div>
            <label>
              Who are you?
              <textarea
                name="identity"
                required
                minLength={2}
                maxLength={600}
                defaultValue={own?.identity ?? ""}
                placeholder="Share the professional context you would like this room to know."
              />
            </label>
            <label>
              What are you building?
              <textarea
                name="building"
                required
                minLength={2}
                maxLength={600}
                defaultValue={own?.building ?? ""}
                placeholder="A business, career move, initiative or idea."
              />
            </label>
            <label>
              What can you offer?
              <textarea
                name="can_offer"
                required
                minLength={2}
                maxLength={600}
                defaultValue={own?.can_offer ?? ""}
                placeholder="Expertise, perspective, introductions or support."
              />
            </label>
            <label>
              What are you seeking?
              <textarea
                name="seeking"
                required
                minLength={2}
                maxLength={600}
                defaultValue={own?.seeking ?? ""}
                placeholder="One focused ask that another member can understand."
              />
            </label>
            <div className="cohort-form-actions">
              <small>
                Only accepted members of this room can see this introduction.
              </small>
              <button className="button button-primary" disabled={busy}>
                {busy
                  ? "Saving…"
                  : own
                    ? "Update introduction"
                    : "Share introduction"}
              </button>
            </div>
            {message ? <p role="status">{message}</p> : null}
          </form>

          <section
            className="cohort-introductions"
            aria-labelledby="cohort-introductions-title"
          >
            <header>
              <div>
                <p className="eyebrow">Around this table</p>
                <h3 id="cohort-introductions-title">
                  {introductions.length} thoughtful introduction
                  {introductions.length === 1 ? "" : "s"}
                </h3>
              </div>
              <Link href="/network">Discover members →</Link>
            </header>
            <div>
              {introductions.length ? (
                introductions.map((introduction) => (
                  <article key={introduction.introduction_id}>
                    <header>
                      <strong>{introduction.display_name}</strong>
                      <small>
                        {[introduction.job_title, introduction.company]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </header>
                    <p>{introduction.identity}</p>
                    <dl>
                      <div>
                        <dt>Building</dt>
                        <dd>{introduction.building}</dd>
                      </div>
                      <div>
                        <dt>Can offer</dt>
                        <dd>{introduction.can_offer}</dd>
                      </div>
                      <div>
                        <dt>Seeking</dt>
                        <dd>{introduction.seeking}</dd>
                      </div>
                    </dl>
                    {introduction.user_id !== currentUserId ? (
                      <Link href="/network">
                        View in the member directory →
                      </Link>
                    ) : (
                      <span>Your introduction</span>
                    )}
                  </article>
                ))
              ) : (
                <div className="admin-empty">
                  <strong>Set the tone for the room</strong>
                  <p>
                    Share the first guided introduction. Other accepted members
                    will see it when they enter.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : (
        <div className="cohort-read-only">
          <strong>This cohort room is now read-only.</strong>
          <p>
            Introductions and useful exchanges remain available as a private
            record for accepted members.
          </p>
        </div>
      )}
    </section>
  );
}
