"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type CountdownEvent = {
  city: string;
  event_name: string;
  starts_at: string;
};

type TimeLeft = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function calculateTimeLeft(startsAt: string): TimeLeft | null {
  const distance = new Date(startsAt).getTime() - Date.now();
  if (distance <= 0) return null;

  return {
    days: Math.floor(distance / 86_400_000),
    hours: Math.floor((distance / 3_600_000) % 24),
    minutes: Math.floor((distance / 60_000) % 60),
    seconds: Math.floor((distance / 1_000) % 60),
  };
}

const twoDigits = (value: number) => String(value).padStart(2, "0");

export function EventCountdown() {
  const [event, setEvent] = useState<CountdownEvent | null>(null);
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    const supabase = createClient();

    void supabase
      .from("site_event_countdown")
      .select("event_name, city, starts_at")
      .eq("id", true)
      .eq("is_published", true)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const configuredEvent = data as CountdownEvent;
        setEvent(configuredEvent);
        setTimeLeft(calculateTimeLeft(configuredEvent.starts_at));
      });
  }, []);

  useEffect(() => {
    if (!event) return;
    const timer = window.setInterval(() => {
      setTimeLeft(calculateTimeLeft(event.starts_at));
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [event]);

  return (
    <section className="countdown-section" aria-label="Next Her Africa Table event">
      <div className="countdown-intro">
        <span>Next table</span>
        <strong>{event?.event_name ?? "Nairobi founding gathering"}</strong>
        <small>{event?.city ?? "Details shared with approved members"}</small>
      </div>

      {event && timeLeft ? (
        <div className="countdown-clock" role="timer" aria-live="off">
          <span><b>{twoDigits(timeLeft.days)}</b><small>Days</small></span>
          <span><b>{twoDigits(timeLeft.hours)}</b><small>Hours</small></span>
          <span><b>{twoDigits(timeLeft.minutes)}</b><small>Minutes</small></span>
          <span><b>{twoDigits(timeLeft.seconds)}</b><small>Seconds</small></span>
        </div>
      ) : (
        <div className="countdown-clock countdown-clock-pending" aria-label="Event date awaiting publication">
          <span><b>—</b><small>Days</small></span>
          <span><b>—</b><small>Hours</small></span>
          <span><b>—</b><small>Minutes</small></span>
          <span><b>—</b><small>Seconds</small></span>
        </div>
      )}

      <Link href="/sign-in">Request a seat <span aria-hidden="true">→</span></Link>
    </section>
  );
}
