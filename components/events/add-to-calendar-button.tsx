"use client";

import { useState } from "react";
import { eventCalendarFile } from "@/lib/events/calendar-file";

export function AddToCalendarButton({
  endsAt,
  eventId,
  location,
  slug,
  startsAt,
  summary,
  title,
}: {
  endsAt: string;
  eventId: string;
  location: string;
  slug: string;
  startsAt: string;
  summary: string | null;
  title: string;
}) {
  const [message, setMessage] = useState("");

  function download() {
    const content = eventCalendarFile({
      endsAt, eventId, location, slug, startsAt, summary, title,
    }, window.location.origin);
    const objectUrl = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `${slug}.ics`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    setMessage("Calendar file downloaded.");
  }

  return <>
    <button className="button button-outline" onClick={download} type="button">Add to calendar</button>
    {message ? <span className="event-calendar-message" role="status">{message}</span> : null}
  </>;
}
