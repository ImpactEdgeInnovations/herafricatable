"use client";
import { useRouter } from "next/navigation";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { adminErrorMessage } from "@/lib/admin-error";
import { formatEventTimeInput, parseEventTimeInput } from "@/lib/events/zoned-datetime";

export type AdminEvent = {
  capacity: number | null;
  ends_at: string;
  format: "in_person" | "virtual" | "hybrid";
  id: string;
  is_featured: boolean;
  registration_mode: "automatic" | "manual_review" | "closed" | "waitlist";
  slug: string;
  starts_at: string;
  status: "draft" | "published" | "suspended" | "cancelled" | "completed";
  summary: string | null;
  timezone: string;
  title: string;
  venues: {
    address_line: string | null;
    city: string;
    country: string;
    map_url: string | null;
    name: string;
  } | null;
};

type PrivateEvent = { event_id: string; online_url: string | null };
type SafetyContact = { event_id: string; contact_name: string; contact_phone: string };

type EventForm = {
  addressLine: string;
  capacity: string;
  city: string;
  country: string;
  endsAt: string;
  format: AdminEvent["format"];
  id: string | null;
  isFeatured: boolean;
  mapUrl: string;
  onlineUrl: string;
  registrationMode: AdminEvent["registration_mode"];
  slug: string;
  startsAt: string;
  status: AdminEvent["status"];
  summary: string;
  timezone: string;
  title: string;
  venueName: string;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function blankForm(): EventForm {
  const date = formatEventTimeInput(
    new Date(Date.now() + 60 * 86_400_000).toISOString(), "Africa/Nairobi",
  ).slice(0, 10);
  return {
    addressLine: "",
    capacity: "",
    city: "Nairobi",
    country: "Kenya",
    endsAt: `${date}T20:00`,
    format: "in_person",
    id: null,
    isFeatured: false,
    mapUrl: "",
    onlineUrl: "",
    registrationMode: "manual_review",
    slug: "",
    startsAt: `${date}T18:00`,
    status: "draft",
    summary: "",
    timezone: "Africa/Nairobi",
    title: "",
    venueName: "",
  };
}

function formFromEvent(
  event: AdminEvent,
  privateEvents: PrivateEvent[],
): EventForm {
  const privateEvent = privateEvents.find((item) => item.event_id === event.id);
  return {
    addressLine: event.venues?.address_line ?? "",
    capacity: event.capacity?.toString() ?? "",
    city: event.venues?.city ?? "",
    country: event.venues?.country ?? "Kenya",
    endsAt: formatEventTimeInput(event.ends_at, event.timezone),
    format: event.format,
    id: event.id,
    isFeatured: event.is_featured,
    mapUrl: event.venues?.map_url ?? "",
    onlineUrl: privateEvent?.online_url ?? "",
    registrationMode: event.registration_mode,
    slug: event.slug,
    startsAt: formatEventTimeInput(event.starts_at, event.timezone),
    status: event.status,
    summary: event.summary ?? "",
    timezone: event.timezone,
    title: event.title,
    venueName: event.venues?.name ?? "",
  };
}

export function EventManager({
  initialEvents,
  privateEvents,
  hostedEventIds,
  initialSafetyContacts,
  canCreate,
  migrationReady,
  publicationGuardReady,
  automaticCheckoutOpen,
  automaticCheckoutReady,
}: {
  initialEvents: AdminEvent[];
  privateEvents: PrivateEvent[];
  hostedEventIds: string[];
  initialSafetyContacts: SafetyContact[];
  canCreate: boolean;
  migrationReady: boolean;
  publicationGuardReady: boolean;
  automaticCheckoutOpen: boolean;
  automaticCheckoutReady: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState(initialEvents);
  const [savedPrivateEvents, setSavedPrivateEvents] = useState(privateEvents);
  const [safetyContacts, setSafetyContacts] = useState(initialSafetyContacts);
  const [safetyDrafts, setSafetyDrafts] = useState<Record<string, { name: string; phone: string }>>({});
  const [form, setForm] = useState<EventForm>(() =>
    initialEvents[0]
      ? formFromEvent(initialEvents[0], privateEvents)
      : blankForm(),
  );
  const [saving, setSaving] = useState(false);
  const [savingSafety, setSavingSafety] = useState(false);
  const [message, setMessage] = useState("");
  const persistedStatus = events.find((item) => item.id === form.id)?.status;
  const hostOwnsPublication = Boolean(form.id && hostedEventIds.includes(form.id));
  const savedSafetyContact = safetyContacts.find((item) => item.event_id === form.id);
  const safetyContactReady = Boolean(savedSafetyContact);
  const safetyDraft = form.id
    ? safetyDrafts[form.id] ?? {
        name: savedSafetyContact?.contact_name ?? "",
        phone: savedSafetyContact?.contact_phone ?? "",
      }
    : { name: "", phone: "" };
  const arrivalDetailsReady = form.format === "virtual" || Boolean(
    form.venueName.trim() && form.city.trim() && form.country.trim()
    && (form.addressLine.trim() || form.mapUrl.trim()),
  );
  const canPublishHere = Boolean(form.id && arrivalDetailsReady && (persistedStatus === "published" ||
    (publicationGuardReady && !hostOwnsPublication && safetyContactReady)));

  function update<K extends keyof EventForm>(field: K, value: EventForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function chooseEvent(id: string) {
    const selected = events.find((event) => event.id === id);
    if (selected) {
      setForm(formFromEvent(selected, savedPrivateEvents));
      setMessage("");
    }
  }

  function updateSafetyDraft(field: "name" | "phone", value: string) {
    const eventId = form.id;
    if (!eventId) return;
    setSafetyDrafts((current) => ({
      ...current,
      [eventId]: { ...(current[eventId] ?? safetyDraft), [field]: value },
    }));
  }

  async function saveSafetyContact() {
    const eventId = form.id;
    if (!eventId || !canCreate) return;
    if (safetyDraft.name.trim().length < 2 || safetyDraft.phone.trim().length < 7) {
      setMessage("Add the contact's name and a reachable phone number.");
      return;
    }
    setSavingSafety(true);
    setMessage("");
    const { error } = await supabase.rpc("save_event_safety_contact", {
      p_event_id: eventId,
      p_name: safetyDraft.name.trim(),
      p_phone: safetyDraft.phone.trim(),
    });
    setSavingSafety(false);
    if (error) {
      setMessage(adminErrorMessage(error, "save the event safety contact"));
      return;
    }
    setSafetyContacts((current) => [
      { event_id: eventId, contact_name: safetyDraft.name.trim(), contact_phone: safetyDraft.phone.trim() },
      ...current.filter((item) => item.event_id !== eventId),
    ]);
    setMessage("On-the-day contact saved privately. Now review the other event details before publishing.");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.startsAt || !form.endsAt) return;
    if (!form.id && form.status !== "draft") {
      setMessage("Save this event privately first. Add its Host, safety contact and places before publishing.");
      return;
    }
    if (form.status === "published" && !canPublishHere) {
      setMessage(!arrivalDetailsReady
        ? "Add the exact venue address or map link before publishing. Guests need to know where to arrive."
        : !publicationGuardReady
        ? "New event publishing is paused until the database update is installed. You can still save a private draft."
        : hostOwnsPublication
          ? "Review and approve this event in Host drafts to publish it."
          : "Save an on-the-day safety contact before publishing this event.");
      return;
    }
    if (form.status === "published" && form.registrationMode === "automatic" && !automaticCheckoutOpen) {
      setMessage("Online event payment is paused. Choose manual review or complete the payment launch checks before publishing.");
      return;
    }
    let startsAt: string;
    let endsAt: string;
    try {
      startsAt = parseEventTimeInput(form.startsAt, form.timezone);
      endsAt = parseEventTimeInput(form.endsAt, form.timezone);
    } catch {
      setMessage("Check the date, time and event timezone. Use a valid timezone such as Africa/Nairobi.");
      return;
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setMessage("The event must end after it starts.");
      return;
    }
    setSaving(true);
    setMessage("");

    const { data, error } = await supabase.rpc("save_event", {
      p_event_id: form.id,
      p_title: form.title,
      p_slug: form.slug || slugify(form.title),
      p_summary: form.summary,
      p_format: form.format,
      p_status: form.status,
      p_starts_at: startsAt,
      p_ends_at: endsAt,
      p_timezone: form.timezone,
      p_venue_name: form.venueName,
      p_city: form.city,
      p_country: form.country,
      p_address_line: form.addressLine,
      p_map_url: form.mapUrl,
      p_online_url: form.onlineUrl,
      p_capacity: form.capacity ? Number(form.capacity) : null,
      p_registration_mode: form.registrationMode,
      p_is_featured: form.isFeatured,
    });

    if (error) {
      setMessage(adminErrorMessage(error, "save this event"));
      setSaving(false);
      return;
    }

    const savedId = form.id ?? data;
    if (!savedId) {
      setMessage("The event was saved, but this page could not load its record. Reload before editing it again.");
      setSaving(false);
      router.refresh();
      return;
    }
    const savedEvent: AdminEvent = {
      capacity: form.capacity ? Number(form.capacity) : null,
      ends_at: endsAt,
      format: form.format,
      id: savedId,
      is_featured: form.isFeatured,
      registration_mode: form.registrationMode,
      slug: slugify(form.slug || form.title),
      starts_at: startsAt,
      status: form.status,
      summary: form.summary || null,
      timezone: form.timezone,
      title: form.title,
      venues: form.format === "virtual" ? null : {
        address_line: form.addressLine || null,
        city: form.city,
        country: form.country,
        map_url: form.mapUrl || null,
        name: form.venueName,
      },
    };
    setEvents((current) => [
      savedEvent,
      ...current.filter((item) => item.id !== savedId).map((item) =>
        form.isFeatured ? { ...item, is_featured: false } : item),
    ]);
    setSavedPrivateEvents((current) => [
      { event_id: savedId, online_url: form.format === "in_person" ? null : form.onlineUrl || null },
      ...current.filter((item) => item.event_id !== savedId),
    ]);
    setForm((current) => ({ ...current, id: savedId }));
    setMessage(form.status === "published"
      ? "Event saved and published. The public event page is now available."
      : form.status === "draft"
        ? "Private draft saved. You can now set up its Host, safety contact and places."
        : "Event changes saved.");
    setSaving(false);
    router.refresh();
  }

  if (!migrationReady) {
    return (
      <section className="admin-section" id="events">
        <div className="admin-empty">
          <strong>Event controls are temporarily unavailable</strong>
          <p>
            No event has been changed. Reload this workspace in a moment or
            check platform health before publishing.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="admin-section event-manager"
      id="events"
      aria-labelledby="event-manager-title"
    >
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Events</p>
          <h2 id="event-manager-title">Plan and publish events</h2>
          <p>
            Start with a private draft, choose how people register and publish
            only when the date and venue are confirmed.
          </p>
        </div>
        {canCreate ? (
          <button
            className="button button-outline"
            type="button"
            onClick={() => {
              setForm(blankForm());
              setMessage("");
            }}
          >
            New event
          </button>
        ) : null}
      </div>

      <div className="event-admin-layout">
        <aside className="event-admin-list" aria-label="Managed events">
          {events.length ? (
            events.map((event) => (
              <button
                type="button"
                className={form.id === event.id ? "selected" : ""}
                key={event.id}
                onClick={() => chooseEvent(event.id)}
              >
                <span>{event.title}</span>
                <small>
                  {event.status} ·{" "}
                  {new Intl.DateTimeFormat("en-KE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(event.starts_at))}
                </small>
              </button>
            ))
          ) : (
            <div>
              <strong>No events yet</strong>
              <p>Create the first production event as a draft.</p>
            </div>
          )}
        </aside>

        <form
          className="event-admin-form"
          onSubmit={save}
          aria-describedby="event-form-guide"
        >
          <p className="admin-form-guide" id="event-form-guide">
            Save new events as drafts first. Publishing makes the public event
            details visible immediately; private access information remains
            protected.
          </p>
          <div className="form-grid">
            <label className="form-wide">
              Event title
              <input
                value={form.title}
                onChange={(event) => {
                  update("title", event.target.value);
                  if (!form.id) update("slug", slugify(event.target.value));
                }}
                required
              />
            </label>
            <label>
              URL slug
              <input
                value={form.slug}
                onChange={(event) =>
                  update("slug", slugify(event.target.value))
                }
                placeholder="nairobi-2026"
                required
              />
            </label>
            <label>
              Format
              <select
                value={form.format}
                onChange={(event) =>
                  update("format", event.target.value as EventForm["format"])
                }
              >
                <option value="in_person">In person</option>
                <option value="hybrid">Hybrid</option>
                <option value="virtual">Virtual</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={form.status}
                onChange={(event) =>
                  update("status", event.target.value as EventForm["status"])
                }
              >
                <option value="draft">Draft</option>
                <option value="published" disabled={!canPublishHere}>Published — after private setup</option>
                <option value="suspended" disabled>Suspended — use Event oversight</option>
                <option value="cancelled" disabled>Cancelled — use Event oversight</option>
                <option value="completed" disabled={!form.id}>Completed</option>
              </select>
              {form.id && form.status === "draft" && !canPublishHere ? <small>
                {!arrivalDetailsReady
                  ? "Add the exact venue address or map link before publishing."
                  : !publicationGuardReady
                  ? "Public release is paused until the event database update is installed. Private drafts can still be saved."
                  : hostOwnsPublication
                    ? "A Host is assigned. Review and publish their draft in Host drafts."
                    : "Save an on-the-day contact below before opening this event to guests."}
              </small> : null}
            </label>
            <label>
              Registration mode
              <select
                value={form.registrationMode}
                onChange={(event) =>
                  update(
                    "registrationMode",
                    event.target.value as EventForm["registrationMode"],
                  )
                }
              >
                <option value="manual_review">Manual review</option>
                <option value="automatic" disabled={!automaticCheckoutOpen}>Automatic payment — after approval</option>
                <option value="waitlist">Waitlist</option>
                <option value="closed">Closed</option>
              </select>
              {!automaticCheckoutOpen ? (
                <small>{automaticCheckoutReady
                  ? "Online event payment is paused until the payment launch checks pass. Free manual-review events can proceed."
                  : "Online event payment needs its database safety update. Keep this event on manual review."}</small>
              ) : null}
            </label>
            <label>
              Starts
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) => update("startsAt", event.target.value)}
                required
              />
            </label>
            <label>
              Ends
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) => update("endsAt", event.target.value)}
                required
              />
            </label>
            <label>
              Timezone
              <input
                value={form.timezone}
                onChange={(event) => update("timezone", event.target.value)}
                required
              />
              <small>Start and end times use this event timezone, even if your device is elsewhere.</small>
            </label>
            <label>
              Capacity
              <input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(event) => update("capacity", event.target.value)}
                placeholder="Leave blank if unset"
              />
            </label>
            <label className="form-wide">
              Public summary
              <textarea
                value={form.summary}
                onChange={(event) => update("summary", event.target.value)}
                rows={4}
                maxLength={1000}
              />
            </label>
          </div>

          {form.format !== "virtual" ? (
            <fieldset className="event-fieldset">
              <legend>Venue</legend>
              <div className="form-grid">
                <label>
                  Venue name
                  <input
                    value={form.venueName}
                    onChange={(event) =>
                      update("venueName", event.target.value)
                    }
                    required
                  />
                </label>
                <label>
                  City
                  <input
                    value={form.city}
                    onChange={(event) => update("city", event.target.value)}
                    required
                  />
                </label>
                <label>
                  Country
                  <input
                    value={form.country}
                    onChange={(event) => update("country", event.target.value)}
                    required
                  />
                </label>
                <label>
                  Address
                  <input
                    value={form.addressLine}
                    onChange={(event) =>
                      update("addressLine", event.target.value)
                    }
                  />
                </label>
                <label className="form-wide">
                  Map URL
                  <input
                    type="url"
                    value={form.mapUrl}
                    onChange={(event) => update("mapUrl", event.target.value)}
                    placeholder="https://maps.google.com/…"
                  />
                </label>
              </div>
            </fieldset>
          ) : null}

          {form.format !== "in_person" ? (
            <fieldset className="event-fieldset">
              <legend>Private online access</legend>
              <div className="form-grid">
                <label className="form-wide">
                  Meeting or livestream URL
                  <input
                    type="url"
                    value={form.onlineUrl}
                    onChange={(event) =>
                      update("onlineUrl", event.target.value)
                    }
                    required
                  />
                  <small>
                    Stored separately and never exposed by the public event API.
                  </small>
                </label>
              </div>
            </fieldset>
          ) : null}

          {canCreate && form.id ? <fieldset className="event-fieldset">
            <legend>On-the-day contact</legend>
            <p className="admin-form-guide">Private to the event team. Name someone guests or staff can reach if a problem arises.</p>
            <div className="form-grid">
              <label>Name<input autoComplete="name" maxLength={120} onChange={(event) => updateSafetyDraft("name", event.target.value)} value={safetyDraft.name} /></label>
              <label>Phone<input autoComplete="tel" maxLength={40} onChange={(event) => updateSafetyDraft("phone", event.target.value)} type="tel" value={safetyDraft.phone} /></label>
            </div>
            <button className="button button-outline" disabled={savingSafety || saving} onClick={() => void saveSafetyContact()} type="button">
              {savingSafety ? "Saving contact…" : safetyContactReady ? "Update contact" : "Save contact"}
            </button>
          </fieldset> : null}

          <label className="feature-event-control">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(event) => update("isFeatured", event.target.checked)}
            />
            <span>
              <strong>Feature on the landing page</strong>
              <small>
                Synchronizes the public countdown. Draft events remain hidden.
              </small>
            </span>
          </label>
          <div className="event-form-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={saving || form.status === "suspended"}
            >
              {saving
                ? "Saving event…"
                : form.status === "suspended"
                  ? "Reopen from Event oversight"
                : form.id
                  ? "Save event"
                  : "Create event"}
            </button>
            <span>
              {form.status === "suspended"
                ? "Suspended events are preserved and can only be reopened from Event oversight."
                : form.status === "published"
                ? "Publishing makes public fields immediately visible."
                : "Drafts are visible only to authorized event administrators."}
            </span>
          </div>
          {message ? (
            <p className="manager-message" role="status">
              {message}
            </p>
          ) : null}
        </form>
      </div>
    </section>
  );
}
