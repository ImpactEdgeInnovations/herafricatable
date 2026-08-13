"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminEvent } from "@/components/admin/event-manager";
import type { AdminRefund, AdminRegistration } from "@/components/admin/registration-manager";

const eventStatus: Record<string, string> = {
  cancelled: "Cancelled",
  completed: "Completed",
  draft: "Private draft",
  published: "Published",
};

const registrationMode: Record<string, string> = {
  automatic: "Online payment",
  closed: "Registration closed",
  manual_review: "Admin reviews requests",
  waitlist: "Waitlist",
};

export function EventCommandCentre({
  events,
  proposalCount,
  refunds,
  registrations,
}: {
  events: AdminEvent[];
  proposalCount: number;
  refunds: AdminRefund[];
  registrations: AdminRegistration[];
}) {
  const ordered = [...events].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const nextEvent = ordered.find((event) => event.status === "published" && new Date(event.ends_at) >= new Date());
  const [selected, setSelected] = useState(nextEvent?.id ?? ordered[0]?.id ?? "");
  const event = events.find((item) => item.id === selected) ?? ordered[0];
  const pendingRegistrations = registrations.filter((registration) => registration.status === "pending_review").length;
  const pendingRefunds = refunds.filter((refund) => refund.status === "requested").length;
  const published = events.filter((item) => item.status === "published").length;
  const eventRegistrations = event ? registrations.filter((item) => item.event_id === event.id) : [];
  const confirmed = eventRegistrations.filter((item) => ["confirmed", "completed", "attended"].includes(item.status)).reduce((total, item) => total + item.quantity, 0);

  return (
    <>
      <section className="oversight-hero event-oversight-hero">
        <div><p className="eyebrow">Event oversight</p><h1>Plan clearly. Welcome people well.</h1><p>Start with proposals and guest decisions. Open a focused tool only when you need to change event details, registrations or arrival.</p></div>
        <div className="oversight-metrics"><article className={proposalCount ? "has-work" : ""}><strong>{proposalCount}</strong><span>proposals waiting</span></article><article><strong>{published}</strong><span>published events</span></article><article className={pendingRegistrations ? "has-work" : ""}><strong>{pendingRegistrations}</strong><span>registrations waiting</span></article><article className={pendingRefunds ? "has-concern" : ""}><strong>{pendingRefunds}</strong><span>refunds waiting</span></article></div>
      </section>

      <section className="event-action-row" aria-label="Event actions">
        {proposalCount ? <Link className="has-work" href="/admin/events?view=proposals"><strong>{proposalCount} event proposal{proposalCount === 1 ? "" : "s"}</strong><span>Review the member, purpose, venue and safety plan →</span></Link> : null}
        {pendingRegistrations ? <Link className="has-work" href="/admin/events?view=registrations"><strong>{pendingRegistrations} registration{pendingRegistrations === 1 ? "" : "s"} waiting</strong><span>Verify and decide →</span></Link> : null}
        {!proposalCount && !pendingRegistrations && !pendingRefunds ? <div className="all-clear"><strong>No event decision is waiting.</strong><span>Your operational queues are clear.</span></div> : null}
      </section>

      <section className="event-oversight-desk">
        <header className="oversight-heading"><div><p className="eyebrow">All events</p><h2>Event picture</h2><p>Choose an event to see readiness and guest movement without opening every operational form.</p></div><Link className="button button-primary" href="/admin/events?view=edit">Create or edit an event</Link></header>
        {events.length && event ? <div className="event-oversight-layout"><nav aria-label="Choose an event">{ordered.map((item) => <button aria-pressed={event.id === item.id} key={item.id} onClick={() => setSelected(item.id)} type="button"><span className={`event-state-dot is-${item.status}`} aria-hidden="true"/><span><strong>{item.title}</strong><small>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.starts_at))}</small></span><em>{eventStatus[item.status]}</em></button>)}</nav><article className="event-oversight-card"><header><div><span>{eventStatus[event.status]}</span><h3>{event.title}</h3><p>{event.summary || "No public summary has been added yet."}</p></div>{event.is_featured ? <strong className="featured-event-label">Landing page event</strong> : null}</header><dl><div><dt>When</dt><dd>{new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.starts_at))}</dd></div><div><dt>Place</dt><dd>{event.format === "virtual" ? "Online" : event.venues ? `${event.venues.name}, ${event.venues.city}` : "Venue not completed"}</dd></div><div><dt>Joining</dt><dd>{registrationMode[event.registration_mode] || event.registration_mode}</dd></div><div><dt>Capacity</dt><dd>{event.capacity ?? "Not limited"}</dd></div></dl><div className="event-health-strip"><article><strong>{eventRegistrations.length}</strong><span>registration records</span></article><article><strong>{confirmed}</strong><span>confirmed places</span></article><article><strong>{eventRegistrations.filter((item) => item.status === "pending_review").length}</strong><span>waiting for review</span></article><article><strong>{refunds.filter((item) => eventRegistrations.some((registration) => registration.order_id === item.order_id) && item.status === "requested").length}</strong><span>refunds waiting</span></article></div><aside><strong>Clear responsibility</strong><p>Event Hosts shape the experience and answer attendee questions. Admin controls public publication, registration decisions, payments, refunds and safety intervention.</p></aside><footer><Link className="button button-outline" href={`/events/${event.slug}`}>View event page</Link><Link className="button button-outline" href="/admin/events?view=registrations">Registrations</Link><Link className="button button-outline" href="/admin/events?view=arrival">Guest arrival</Link><Link className="button button-outline" href="/admin/events?view=edit">Edit details</Link><Link className="button button-quiet" href="/admin/operations?area=event-work#event-work">Programme and content</Link></footer></article></div> : <div className="oversight-clear"><strong>No event has been created yet.</strong><p>Create the first event as a private draft.</p><Link className="button button-primary" href="/admin/events?view=edit">Create an event</Link></div>}
      </section>
    </>
  );
}
