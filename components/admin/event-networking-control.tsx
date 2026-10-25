"use client";
import { useState } from "react";
import { EventNetworking } from "@/components/events/event-networking";

export function EventNetworkingControl({ eventId, timeZone, startsAt, endsAt }: { eventId: string; timeZone: string; startsAt: string; endsAt: string }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={e => { if (e.target === e.currentTarget) setOpen(e.currentTarget.open); }}>
    <summary>Live networking · Host session and safety controls</summary>
    {open ? <EventNetworking key={eventId} eventId={eventId} timeZone={timeZone} eventStartsAt={startsAt} eventEndsAt={endsAt} manage /> : null}
  </details>;
}
