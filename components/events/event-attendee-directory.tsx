"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";

export type EventAttendee = {
  avatar_url: string | null;
  city: string | null;
  company: string | null;
  connection_status: string | null;
  country: string | null;
  display_name: string;
  introduction: string;
  job_title: string | null;
  user_id: string;
};

export type EventAttendeePreference = {
  discoverable: boolean;
  introduction: string | null;
  show_company: boolean;
};

export function EventAttendeeDirectory({
  attendees,
  eventId,
  initialPreference,
}: {
  attendees: EventAttendee[];
  eventId: string;
  initialPreference: EventAttendeePreference | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [discoverable, setDiscoverable] = useState(
    initialPreference?.discoverable ?? false,
  );
  const [showCompany, setShowCompany] = useState(
    initialPreference?.show_company ?? true,
  );
  const [busy, setBusy] = useState(false);
  const [connectingId, setConnectingId] = useState("");
  const [message, setMessage] = useState("");

  async function savePreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("save_event_attendee_visibility", {
      p_discoverable: discoverable,
      p_event_id: eventId,
      p_introduction: form.get("introduction"),
      p_show_company: showCompany,
    });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "save your attendee visibility")
        : discoverable
          ? "You are now visible to confirmed guests at this event."
          : "You are no longer visible in this event’s attendee discovery.",
    );
    if (!error) router.refresh();
  }

  async function connect(memberId: string) {
    setConnectingId(memberId);
    setMessage("");
    const { error } = await supabase.rpc("request_connection", {
      p_connection_code: null,
      p_member_id: memberId,
    });
    setConnectingId("");
    setMessage(
      error
        ? memberErrorMessage(error, "send this connection request")
        : "Connection request sent. Contact details unlock only after acceptance.",
    );
    if (!error) router.refresh();
  }

  return (
    <section
      className="event-attendee-section"
      aria-labelledby="event-attendee-title"
    >
      <header>
        <div>
          <p className="eyebrow">For confirmed guests</p>
          <h2 id="event-attendee-title">Meet before the table.</h2>
          <p>
            Choose whether to introduce yourself to other confirmed guests.
            Joining is optional, and private contact details are never shown here.
          </p>
        </div>
        <span>{attendees.length} opted in</span>
      </header>

      <div className="event-attendee-layout">
        <form onSubmit={(event) => void savePreference(event)}>
          <h3>Your event introduction</h3>
          <label className="attendee-discovery-toggle">
            <input
              checked={discoverable}
              onChange={(event) => setDiscoverable(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Let confirmed guests discover me</strong>
              <small>You can leave this space at any time.</small>
            </span>
          </label>
          <label>
            A short hello
            <textarea
              defaultValue={initialPreference?.introduction ?? ""}
              maxLength={500}
              minLength={2}
              name="introduction"
              placeholder="What would you enjoy discussing or building at this table?"
              required={discoverable}
              rows={5}
            />
          </label>
          <label className="attendee-discovery-toggle">
            <input
              checked={showCompany}
              onChange={(event) => setShowCompany(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Show my company or organisation</strong>
              <small>Your role, city and country remain part of your profile.</small>
            </span>
          </label>
          <button className="button button-primary" disabled={busy}>
            {busy ? "Saving…" : "Save event visibility"}
          </button>
          {message ? <p role="status">{message}</p> : null}
        </form>

        <div className="event-attendee-list">
          {attendees.length ? (
            attendees.map((attendee) => (
              <article key={attendee.user_id}>
                <header>
                  {attendee.avatar_url ? (
                    <img src={attendee.avatar_url} alt="" />
                  ) : (
                    <span>{attendee.display_name.slice(0, 1)}</span>
                  )}
                  <div>
                    <h3>{attendee.display_name}</h3>
                    <p>
                      {[attendee.job_title, attendee.company]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </header>
                <p>{attendee.introduction}</p>
                <footer>
                  <small>
                    {[attendee.city, attendee.country]
                      .filter(Boolean)
                      .join(", ")}
                  </small>
                  <button
                    disabled={
                      connectingId === attendee.user_id ||
                      ["pending", "accepted"].includes(
                        attendee.connection_status ?? "",
                      )
                    }
                    onClick={() => void connect(attendee.user_id)}
                    type="button"
                  >
                    {attendee.connection_status === "accepted"
                      ? "Connected"
                      : attendee.connection_status === "pending"
                        ? "Request pending"
                        : connectingId === attendee.user_id
                          ? "Sending…"
                          : "Connect →"}
                  </button>
                </footer>
              </article>
            ))
          ) : (
            <div className="events-empty">
              <strong>Introductions will appear here.</strong>
              <p>
                Confirmed guests choose for themselves whether to be discoverable.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
