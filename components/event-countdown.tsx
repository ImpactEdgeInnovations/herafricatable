"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { upcomingCountdown, type CountdownEvent } from "@/lib/upcoming-countdown";

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

export function EventCountdown({
  initialEvent,
}: {
  initialEvent: CountdownEvent | null;
}) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() =>
    initialEvent ? calculateTimeLeft(initialEvent.starts_at) : null,
  );

  useEffect(() => {
    if (!initialEvent) return;
    const timer = window.setInterval(() => {
      setTimeLeft(calculateTimeLeft(initialEvent.starts_at));
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [initialEvent]);

  const activeEvent = timeLeft ? upcomingCountdown(initialEvent) : null;

  return (
    <section className="countdown-section" aria-label="Next Her Africa Table event">
      <div className="countdown-intro">
        <span>Next gathering</span>
        <strong>{activeEvent?.event_name ?? "A new gathering is being prepared"}</strong>
        <small>{activeEvent?.city ?? "Nairobi · Date to be shared"}</small>
      </div>

      {activeEvent && timeLeft ? (
        <div className="countdown-clock" role="timer" aria-live="off">
          <span><b suppressHydrationWarning>{twoDigits(timeLeft.days)}</b><small>Days</small></span>
          <span><b suppressHydrationWarning>{twoDigits(timeLeft.hours)}</b><small>Hours</small></span>
          <span><b suppressHydrationWarning>{twoDigits(timeLeft.minutes)}</b><small>Minutes</small></span>
          <span><b suppressHydrationWarning>{twoDigits(timeLeft.seconds)}</b><small>Seconds</small></span>
        </div>
      ) : (
        <p className="countdown-pending">We’ll share the date when it is confirmed.</p>
      )}

      <Link href={activeEvent?.slug ? `/events/${activeEvent.slug}` : "/events"}>{activeEvent ? "View gathering" : "Explore gatherings"} <span aria-hidden="true">→</span></Link>
    </section>
  );
}
