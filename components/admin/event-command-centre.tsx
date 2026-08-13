"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminErrorMessage } from "@/lib/admin-error";
import { createClient } from "@/lib/supabase/client";
import { useActionDialog } from "@/components/ui/action-dialog";
import type { AdminEvent } from "@/components/admin/event-manager";
import type { AdminRefund, AdminRegistration } from "@/components/admin/registration-manager";

const eventStatus: Record<string, string> = {
  cancelled: "Cancelled",
  completed: "Completed",
  draft: "Private draft",
  published: "Published",
  suspended: "Temporarily suspended",
};

const registrationMode: Record<string, string> = {
  automatic: "Online payment",
  closed: "Registration closed",
  manual_review: "Admin reviews requests",
  waitlist: "Waitlist",
};

export type EventLifecycleState = {
  acted_at: string;
  acted_by_name: string | null;
  active_action: "registrations_paused" | "suspended";
  event_id: string;
  member_message: string | null;
  prior_registration_mode: AdminEvent["registration_mode"];
  prior_status: "draft" | "published";
  reason: string;
};

export function EventCommandCentre({
  events,
  canControlLifecycle,
  lifecycleReady,
  lifecycleStates,
  proposalCount,
  refunds,
  registrations,
}: {
  events: AdminEvent[];
  canControlLifecycle: boolean;
  lifecycleReady: boolean;
  lifecycleStates: EventLifecycleState[];
  proposalCount: number;
  refunds: AdminRefund[];
  registrations: AdminRegistration[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { ask, dialog } = useActionDialog();
  const ordered = [...events].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const nextEvent = ordered.find((event) => event.status === "published" && new Date(event.ends_at) >= new Date());
  const [selected, setSelected] = useState(nextEvent?.id ?? ordered[0]?.id ?? "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const event = events.find((item) => item.id === selected) ?? ordered[0];
  const pendingRegistrations = registrations.filter((registration) => registration.status === "pending_review").length;
  const pendingRefunds = refunds.filter((refund) => refund.status === "requested").length;
  const published = events.filter((item) => item.status === "published").length;
  const eventRegistrations = event ? registrations.filter((item) => item.event_id === event.id) : [];
  const confirmed = eventRegistrations.filter((item) => ["confirmed", "completed", "attended"].includes(item.status)).reduce((total, item) => total + item.quantity, 0);
  const lifecycle = event
    ? lifecycleStates.find((item) => item.event_id === event.id)
    : undefined;

  async function manageLifecycle(
    action: "cancel" | "pause_registrations" | "reopen" | "resume_registrations" | "suspend",
  ) {
    if (!event || !lifecycleReady) return;
    const copy = {
      cancel: {
        confirm: "Cancel event",
        description: "The event closes permanently. Registrations are cancelled, paid orders enter refund review and every affected guest receives your message.",
        title: `Cancel ${event.title}?`,
      },
      pause_registrations: {
        confirm: "Pause registrations",
        description: "The event remains visible to guests who already know about it, but no new registration can begin.",
        title: `Pause registration for ${event.title}?`,
      },
      reopen: {
        confirm: "Reopen event",
        description: "The event returns to public discovery and its previous registration setting is restored.",
        title: `Reopen ${event.title}?`,
      },
      resume_registrations: {
        confirm: "Reopen registrations",
        description: "The previous registration setting is restored. Existing guest records are unchanged.",
        title: `Reopen registration for ${event.title}?`,
      },
      suspend: {
        confirm: "Suspend and preserve",
        description: "The event leaves public discovery, registration closes and all records are preserved while the concern is resolved.",
        title: `Suspend ${event.title}?`,
      },
    }[action];
    const needsMemberMessage = ["cancel", "reopen", "suspend"].includes(action);
    const result = await ask({
      confirmLabel: copy.confirm,
      description: copy.description,
      fields: [
        {
          help: "This stays in the private Admin audit record.",
          label: "Internal reason",
          maxLength: 1000,
          minLength: 10,
          name: "reason",
          required: true,
          type: "textarea",
        },
        ...(needsMemberMessage
          ? [{
              help: "Use calm, useful language. The Host and affected guests receive this message.",
              label: "Message for the Host and guests",
              maxLength: 800,
              minLength: 20,
              name: "memberMessage",
              required: true,
              type: "textarea" as const,
            }]
          : []),
      ],
      title: copy.title,
      tone: ["cancel", "suspend"].includes(action) ? "danger" : "default",
    });
    if (!result) return;
    setBusy(event.id);
    setMessage("");
    const { error } = await supabase.rpc("manage_event_lifecycle", {
      p_action: action,
      p_event_id: event.id,
      p_member_message: needsMemberMessage
        ? String(result.memberMessage ?? "")
        : null,
      p_reason: String(result.reason ?? ""),
    });
    setBusy("");
    setMessage(
      error
        ? adminErrorMessage(error, "change this event")
        : action === "cancel"
          ? "Event cancelled. Paid places are in refund review and guests were informed."
          : action === "suspend"
            ? "Event suspended. Registration stopped and records were preserved."
            : action === "reopen"
              ? "Event reopened and guests were informed."
              : action === "pause_registrations"
                ? "New registrations are paused."
                : "Registrations reopened using the previous setting.",
    );
    if (!error) router.refresh();
  }

  return (
    <>
      <section className="oversight-hero event-oversight-hero">
        <div>
          <p className="eyebrow">Event oversight</p>
          <h1>Plan clearly. Welcome people well.</h1>
          <p>Start with proposals and guest decisions. Open a focused tool only when you need to change event details, registrations or arrival.</p>
        </div>
        <div className="oversight-metrics">
          <article className={proposalCount ? "has-work" : ""}><strong>{proposalCount}</strong><span>proposals waiting</span></article>
          <article><strong>{published}</strong><span>published events</span></article>
          <article className={pendingRegistrations ? "has-work" : ""}><strong>{pendingRegistrations}</strong><span>registrations waiting</span></article>
          <article className={pendingRefunds ? "has-concern" : ""}><strong>{pendingRefunds}</strong><span>refunds waiting</span></article>
        </div>
      </section>

      {message ? <p className="oversight-message" role="status">{message}</p> : null}

      <section className="event-action-row" aria-label="Event actions">
        {proposalCount ? <Link className="has-work" href="/admin/events?view=proposals"><strong>{proposalCount} event proposal{proposalCount === 1 ? "" : "s"}</strong><span>Review the member, purpose, venue and safety plan →</span></Link> : null}
        {pendingRegistrations ? <Link className="has-work" href="/admin/events?view=registrations"><strong>{pendingRegistrations} registration{pendingRegistrations === 1 ? "" : "s"} waiting</strong><span>Verify and decide →</span></Link> : null}
        {pendingRefunds ? <Link className="has-work" href="/admin/events?view=registrations"><strong>{pendingRefunds} refund{pendingRefunds === 1 ? "" : "s"} waiting</strong><span>Review the request and payment route →</span></Link> : null}
        {!proposalCount && !pendingRegistrations && !pendingRefunds ? <div className="all-clear"><strong>No event decision is waiting.</strong><span>Your operational queues are clear.</span></div> : null}
      </section>

      <section className="event-oversight-desk">
        <header className="oversight-heading">
          <div><p className="eyebrow">All events</p><h2>Event picture</h2><p>Choose an event to see readiness and guest movement without opening every operational form.</p></div>
          <Link className="button button-primary" href="/admin/events?view=edit">Create or edit an event</Link>
        </header>
        {events.length && event ? (
          <div className="event-oversight-layout">
            <nav aria-label="Choose an event">
              {ordered.map((item) => (
                <button aria-pressed={event.id === item.id} key={item.id} onClick={() => { setSelected(item.id); setMessage(""); }} type="button">
                  <span className={`event-state-dot is-${item.status}`} aria-hidden="true"/>
                  <span><strong>{item.title}</strong><small>{new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(item.starts_at))}</small></span>
                  <em>{eventStatus[item.status]}</em>
                </button>
              ))}
            </nav>
            <article className="event-oversight-card">
              <header>
                <div><span>{eventStatus[event.status]}</span><h3>{event.title}</h3><p>{event.summary || "No public summary has been added yet."}</p></div>
                {event.is_featured ? <strong className="featured-event-label">Landing page event</strong> : null}
              </header>
              {lifecycle ? (
                <div className={`event-lifecycle-notice is-${lifecycle.active_action}`}>
                  <strong>{lifecycle.active_action === "suspended" ? "Event suspended" : "Registrations paused by Admin"}</strong>
                  <p>{lifecycle.reason}</p>
                  <small>{lifecycle.acted_by_name || "Admin"} · {new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lifecycle.acted_at))}</small>
                </div>
              ) : null}
              <dl>
                <div><dt>When</dt><dd>{new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeStyle: "short", timeZone: event.timezone }).format(new Date(event.starts_at))}</dd></div>
                <div><dt>Place</dt><dd>{event.format === "virtual" ? "Online" : event.venues ? `${event.venues.name}, ${event.venues.city}` : "Venue not completed"}</dd></div>
                <div><dt>Joining</dt><dd>{registrationMode[event.registration_mode] || event.registration_mode}</dd></div>
                <div><dt>Capacity</dt><dd>{event.capacity ?? "Not limited"}</dd></div>
              </dl>
              <div className="event-health-strip">
                <article><strong>{eventRegistrations.length}</strong><span>registration records</span></article>
                <article><strong>{confirmed}</strong><span>confirmed places</span></article>
                <article><strong>{eventRegistrations.filter((item) => item.status === "pending_review").length}</strong><span>waiting for review</span></article>
                <article><strong>{refunds.filter((item) => eventRegistrations.some((registration) => registration.order_id === item.order_id) && item.status === "requested").length}</strong><span>refunds waiting</span></article>
              </div>
              <aside><strong>Clear responsibility</strong><p>Event Hosts shape the experience and answer attendee questions. Admin controls public publication, registration decisions, payments, refunds and safety intervention.</p></aside>
              <footer>
                {event.status === "published" ? <Link className="button button-outline" href={`/events/${event.slug}`}>View event page</Link> : null}
                <Link className="button button-outline" href="/admin/events?view=registrations">Registrations</Link>
                <Link className="button button-outline" href="/admin/events?view=arrival">Guest arrival</Link>
                <Link className="button button-outline" href="/admin/events?view=stories">Stories & media</Link>
                <Link className="button button-outline" href="/admin/events?view=edit">Edit details</Link>
                {event.status === "published" && lifecycle?.active_action === "registrations_paused" ? <button className="button button-outline" disabled={busy === event.id || !lifecycleReady} onClick={() => void manageLifecycle("resume_registrations")} type="button">Reopen registrations</button> : null}
                {event.status === "published" && event.registration_mode !== "closed" ? <button className="button button-quiet" disabled={busy === event.id || !lifecycleReady} onClick={() => void manageLifecycle("pause_registrations")} type="button">Pause registrations</button> : null}
                {canControlLifecycle && event.status === "published" ? <button className="button button-quiet" disabled={busy === event.id || !lifecycleReady} onClick={() => void manageLifecycle("suspend")} type="button">Suspend event</button> : null}
                {canControlLifecycle && event.status === "suspended" ? <button className="button button-primary" disabled={busy === event.id || !lifecycleReady} onClick={() => void manageLifecycle("reopen")} type="button">Reopen event</button> : null}
                {canControlLifecycle && ["published", "suspended", "draft"].includes(event.status) ? <button className="button button-quiet danger-action" disabled={busy === event.id || !lifecycleReady} onClick={() => void manageLifecycle("cancel")} type="button">Cancel event</button> : null}
                <Link className="button button-quiet" href="/admin/operations?area=event-work#event-work">Programme and content</Link>
              </footer>
              {!lifecycleReady ? <p className="event-lifecycle-unavailable">Run the latest database migration before using pause, suspend or cancellation controls.</p> : null}
            </article>
          </div>
        ) : <div className="oversight-clear"><strong>No event has been created yet.</strong><p>Create the first event as a private draft.</p><Link className="button button-primary" href="/admin/events?view=edit">Create an event</Link></div>}
      </section>
      {dialog}
    </>
  );
}
