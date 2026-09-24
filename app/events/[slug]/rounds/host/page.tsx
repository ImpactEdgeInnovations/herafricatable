import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EventRoundHost, type EventRoundPlan, type EventRoundVolunteer } from "@/components/events/event-round-host";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EventRoundHostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/rounds/host`)}`);
  const { data: workspace, error } = await supabase.rpc("get_my_event_host_workspace", { p_slug: slug });
  const host = ((workspace as { event_id: string; event_title: string; event_status: string; starts_at: string; ends_at: string; timezone: string }[] | null) ?? [])[0];
  if (error || !host) notFound();
  if (host.event_status !== "published") return <main className="event-intro-page"><header className="legal-header"><Link href={`/events/${slug}/host`}>Back to your event</Link></header><section className="event-pass-unavailable"><h1>Table planning opens after publication.</h1><p>You can prepare your event programme now. Table rounds require a published future event and opt-in guests.</p></section></main>;
  const [plan, volunteers] = await Promise.all([
    supabase.rpc("get_event_round_plan", { p_event_id: host.event_id }),
    supabase.rpc("list_event_round_volunteers", { p_event_id: host.event_id }),
  ]);
  return <EventRoundHost eventId={host.event_id} eventSlug={slug} eventTitle={host.event_title}
    eventStartsAt={host.starts_at} eventEndsAt={host.ends_at} timeZone={host.timezone}
    initialPlan={(plan.data as EventRoundPlan[] | null) ?? []}
    initialVolunteers={(volunteers.data as EventRoundVolunteer[] | null) ?? []}
    initialError={plan.error || volunteers.error ? "Table planning is unavailable until the database update is applied." : ""} />;
}
