import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EventRoundAttendee, type EventRoundSchedule } from "@/components/events/event-round-attendee";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EventRoundsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/rounds`)}`);
  const { data: event } = await supabase.from("events")
    .select("id,title,timezone,ends_at").eq("slug", slug)
    .in("status", ["published", "completed"]).maybeSingle();
  if (!event) notFound();
  const [statusResult, scheduleResult] = await Promise.all([
    supabase.rpc("get_my_event_round_status", { p_event_id: event.id }),
    supabase.rpc("list_my_event_round_schedule", { p_event_id: event.id }),
  ]);
  const status = ((statusResult.data as { enabled: boolean; opted_in: boolean; interest: string }[] | null) ?? [])[0];
  if (statusResult.error || !status?.enabled) return <main className="event-intro-page">
    <header className="legal-header"><Link className="brand" href="/">Her Africa Table</Link><Link href={`/events/${slug}`}>Back to event</Link></header>
    <section className="event-pass-unavailable"><p className="eyebrow">Table rounds</p><h1>Not open yet.</h1><p>The event team will let confirmed guests know if table rounds are part of this gathering. Your event pass is unchanged.</p><Link className="button button-primary" href={`/events/${slug}`}>View event</Link></section>
  </main>;
  return <EventRoundAttendee eventId={event.id} eventSlug={slug} eventTitle={event.title}
    timeZone={event.timezone} initialOptedIn={status.opted_in} initialInterest={status.interest}
    schedule={(scheduleResult.data as EventRoundSchedule[] | null) ?? []}
    scheduleError={Boolean(scheduleResult.error)} eventEnded={new Date(event.ends_at).getTime() <= Date.now()} />;
}
