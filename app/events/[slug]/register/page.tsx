import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventRegistrationForm } from "@/components/events/event-registration-form";
import { loadEventBookingAvailability } from "@/lib/events/server-booking-availability";

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
      .select("id,title,audience,registration_mode,capacity,ends_at")
      .eq("slug", slug).eq("status", "published").maybeSingle(),
    supabase.from("profiles")
      .select("access_status")
      .eq("id", user.id).maybeSingle(),
  ]);
  if (!event) notFound();
  if (new Date(event.ends_at).getTime() <= Date.now()) {
    redirect(`/events/${slug}`);
  }

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
        .select("id,name,description,price_minor,currency,inventory_quantity,sales_start_at,sales_end_at")
        .eq("event_id", event.id).eq("status", "on_sale").order("sort_order"),
      supabase.from("registration_requests")
        .select("status").eq("event_id", event.id)
        .eq("user_id", user.id).maybeSingle(),
      supabase.from("event_memberships")
        .select("status").eq("event_id", event.id)
        .eq("user_id", user.id).maybeSingle(),
    ]);
  const availability = ["waitlist", "closed"].includes(event.registration_mode)
    ? { checkFailed: false, eventFull: false, tickets: [] }
    : await loadEventBookingAvailability(event.id, event.capacity, tickets ?? []);
  const { data: automaticCheckoutOpen } = event.registration_mode === "automatic"
    ? await supabase.rpc("event_automatic_checkout_open")
    : { data: false };

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
        tickets={availability.tickets}
        availabilityReady={!availability.checkFailed}
        automaticCheckoutOpen={event.registration_mode !== "automatic" || automaticCheckoutOpen === true}
        allowNewRequest={event.registration_mode !== "closed"}
        eventFull={availability.eventFull}
        existingStatus={registration?.status ?? membership?.status ?? null}
        passReady={["confirmed", "attended"].includes(membership?.status ?? "")}
      />
    </main>
  );
}
