"use client";

import { useEffect, useMemo, useState } from "react";
import { calendarDay, calendarMonthDays, calendarEventsByDay, shiftCalendarMonth } from "@/lib/events/community-calendar";
import type { CommunityGatheringCard } from "./community-gatherings";

const dateLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-KE", { ...options, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

export function CommunityCalendar({ cards, onOpen }: { cards: CommunityGatheringCard[]; onOpen: (slug: string) => void }) {
  const [timeZone, setTimeZone] = useState("Africa/Nairobi");
  const [localZone, setLocalZone] = useState("");
  const today = calendarDay(new Date().toISOString(), timeZone);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = useState(today);
  useEffect(() => { setLocalZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  const days = useMemo(() => calendarMonthDays(month), [month]);
  const byDay = useMemo(() => calendarEventsByDay(cards, days, timeZone), [cards, days, timeZone]);
  const selectedEvents = byDay.get(selectedDay) ?? [];
  function moveMonth(offset: number) {
    const next = shiftCalendarMonth(month, offset);
    setMonth(next);
    setSelectedDay(next === today.slice(0, 7) ? today : `${next}-01`);
  }
  return <section className="community-calendar" aria-label="Community calendar">
    <header className="community-calendar-header">
      <div className="community-calendar-month-controls">
        <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button>
        <h3 aria-live="polite">{dateLabel(`${month}-01`, { month: "long", year: "numeric" })}</h3>
        <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">›</button>
        <button type="button" onClick={() => { setMonth(today.slice(0, 7)); setSelectedDay(today); }}>Today</button>
      </div>
      <label>Times shown in<select aria-label="Calendar time zone" value={timeZone} onChange={event => {
        const zone = event.target.value;
        const day = calendarDay(new Date().toISOString(), zone);
        setTimeZone(zone); setSelectedDay(day); setMonth(day.slice(0, 7));
      }}><option value="Africa/Nairobi">Nairobi (EAT)</option>{localZone && localZone !== "Africa/Nairobi" ? <option value={localZone}>Your time — {localZone.replaceAll("_", " ")}</option> : null}</select></label>
    </header>
    <div className="community-calendar-weekdays" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day}>{day}</span>)}</div>
    <div className="community-calendar-grid" role="group" aria-label="Choose a date">
      {days.map(day => {
        const events = byDay.get(day) ?? [];
        return <button key={day} type="button" className={`${day.startsWith(month) ? "" : "is-outside"} ${events.length ? "has-gatherings" : ""}`} aria-current={day === today ? "date" : undefined} aria-pressed={day === selectedDay}
          aria-label={`${dateLabel(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${events.length} ${events.length === 1 ? "meetup" : "meetups"}`}
          onClick={() => { setSelectedDay(day); if (!day.startsWith(month)) setMonth(day.slice(0, 7)); }}>
          <span className="community-calendar-day-number">{Number(day.slice(-2))}</span>
          <span className="community-calendar-cell-events" aria-hidden="true">{events.slice(0, 2).map(event => <span key={event.room_id}>{event.title}</span>)}{events.length > 2 ? <small>+{events.length - 2} more</small> : null}</span>
          {events.length ? <span className="community-calendar-dot" aria-hidden="true" /> : null}
        </button>;
      })}
    </div>
    <div className="community-calendar-agenda" aria-live="polite" aria-atomic="true">
      <h4>{dateLabel(selectedDay, { weekday: "long", day: "numeric", month: "long" })}</h4>
      {selectedEvents.length ? <ul>{selectedEvents.map(card => <li key={card.room_id}>
        <button type="button" onClick={() => onOpen(card.event_slug)}>
          <span><strong>{card.title}</strong><small>{new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(card.starts_at))} · {card.format === "virtual" ? "Online" : card.city || "In person"}{card.my_rsvp === "going" ? " · Your place is saved" : ""}</small></span><span aria-hidden="true">›</span>
        </button>
      </li>)}</ul> : <p>No meetups on this day. Dates with a dot have something planned.</p>}
    </div>
    {!cards.length ? <p className="community-calendar-empty">Nothing scheduled yet. Your Community’s meetups and linked events will appear here.</p> : null}
  </section>;
}
