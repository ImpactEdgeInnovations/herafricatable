import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import { EventDoorConsole } from "@/components/events/event-door-console";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type DoorEvent = {
  event_id: string; event_slug: string; event_title: string;
  starts_at: string; ends_at: string; venue_name: string | null;
};

export default async function EventDoorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/door`)}`);
  const { data, error } = await supabase.rpc("get_my_event_door", { p_slug: slug });
  const event = ((data as DoorEvent[] | null) ?? [])[0];
  if (error || !event) notFound();
  return <main className="admin-command-center event-command-page">
    <MemberHeader active="events" label="Guest arrival" />
    <EventDoorConsole eventId={event.event_id} title={event.event_title} startsAt={event.starts_at} venue={event.venue_name} />
  </main>;
}
