import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventRegistrationForm } from "@/components/events/event-registration-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}#registration`)}`);
  }

  const [{ data: event }, { data: profile }] = await Promise.all([
    supabase.from("events")
      .select("id,title,audience,registration_mode")
      .eq("slug", slug).eq("status", "published").maybeSingle(),
    supabase.from("profiles")
      .select("access_status")
      .eq("id", user.id).maybeSingle(),
  ]);
  if (!event) notFound();

  if (profile?.access_status !== "active") {
    const { data: guestFlag } = await supabase.from("feature_flags")
      .select("enabled").eq("key", "event_guest_access").maybeSingle();
    if (profile?.access_status !== "pending" ||
        event.audience !== "public" || !guestFlag?.enabled) {
      redirect(`/events/${slug}`);
    }
  }

  const [{ data: tickets }, { data: registration }, { data: membership }] =
    await Promise.all([
      supabase.from("ticket_types")
        .select("id,name,description,price_minor,currency,inventory_quantity")
        .eq("event_id", event.id).eq("status", "on_sale").order("sort_order"),
      supabase.from("registration_requests")
        .select("status").eq("event_id", event.id)
        .eq("user_id", user.id).maybeSingle(),
      supabase.from("event_memberships")
        .select("status").eq("event_id", event.id)
        .eq("user_id", user.id).maybeSingle(),
    ]);

  return (
    <main className="event-registration-page">
      <header className="legal-header">
        <Link className="brand" href="/">
          <span className="brand-mark">H</span>
          <span>Her Africa Table<small>Registration</small></span>
        </Link>
        <Link href={`/events/${slug}`}>Back to event</Link>
      </header>
      <EventRegistrationForm
        eventId={event.id}
        eventSlug={slug}
        eventTitle={event.title}
        mode={event.registration_mode}
        tickets={tickets ?? []}
        existingStatus={registration?.status ?? membership?.status ?? null}
        passReady={["confirmed", "attended"].includes(membership?.status ?? "")}
      />
    </main>
  );
}
