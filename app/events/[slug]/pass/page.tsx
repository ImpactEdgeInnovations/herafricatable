import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddToCalendarButton } from "@/components/events/add-to-calendar-button";
import { StandaloneEventReminder } from "@/components/events/standalone-event-reminder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

type EventPass = {
  checked_in_at: string | null; city: string | null; ends_at: string; event_id: string;
  event_slug: string; event_title: string; manual_code: string; membership_status: string;
  qr_payload: string; starts_at: string; timezone: string; venue_name: string | null;
};

type ArrivalDetails = {
  format: string;
  status: string;
  venues: { address_line: string | null; city: string; map_url: string | null; name: string } | null;
  event_private_details: { check_in_instructions: string | null; online_url: string | null } | null;
};

function safeHttpsUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function EventPassPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/pass`)}`);
  const { data: event } = await supabase.from("events").select("id").eq("slug", slug).maybeSingle();
  if (!event) notFound();
  const { data, error } = await supabase.rpc("get_my_event_pass", { p_event_id: event.id });
  const pass = (data?.[0] as EventPass | undefined) ?? null;
  if (error || !pass) return <main className="event-pass-page"><header className="legal-header"><Link className="brand" href="/home"><span className="brand-mark">H</span><span>Her Africa Table<small>Event pass</small></span></Link><Link href={`/events/${slug}`}>Back to event</Link></header><section className="event-pass-unavailable"><p className="eyebrow">Event access</p><h1>Your pass is not ready yet.</h1><p>A pass is issued after your registration and payment review are confirmed. If you believe this is an error, contact support with your order reference.</p><div><Link className="button button-primary" href={`/events/${slug}`}>View my event</Link><a className="button button-outline" href="mailto:support@herafricatable.com">Contact support</a></div></section></main>;

  // The pass RPC establishes the current member's confirmed, non-revoked access.
  // Read private arrival details only after that check and render them only here.
  const service = createAdminClient();
  const { data: arrivalData, error: arrivalError } = await service
    .from("events")
    .select("format,status,venues(name,city,address_line,map_url),event_private_details(online_url,check_in_instructions)")
    .eq("id", pass.event_id)
    .maybeSingle();
  const arrival = arrivalError ? null : arrivalData as unknown as ArrivalDetails | null;
  const [{ data: communityLink, error: communityLinkError }, { data: reminder, error: reminderError }, { data: notificationPreference }] = await Promise.all([
    service.from("community_event_links").select("community_id").eq("event_id", pass.event_id).limit(1).maybeSingle(),
    supabase.from("standalone_event_reminders").select("status").eq("event_id", pass.event_id).eq("user_id", user.id).maybeSingle(),
    supabase.from("notification_preferences").select("email_events").eq("user_id", user.id).maybeSingle(),
  ]);
  const reminderActive = reminder?.status === "scheduled" || reminder?.status === "queued";
  const canSetReminder = arrival?.status === "published" && new Date(pass.starts_at).getTime() - Date.now() > 86_400_000;
  const showReminder = !communityLinkError && !communityLink && !reminderError
    && new Date(pass.ends_at).getTime() > Date.now() && (canSetReminder || reminderActive);
  const { data: order } = await supabase.from("orders")
    .select("reference")
    .eq("event_id", pass.event_id)
    .eq("user_id", user.id)
    .eq("order_type", "event")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const venue = arrival?.venues;
  const eventPaused = arrival?.status === "suspended" || arrival?.status === "cancelled";
  const mapUrl = eventPaused ? null : safeHttpsUrl(venue?.map_url);
  const joinUrl = arrival?.status === "published"
    ? safeHttpsUrl(arrival.event_private_details?.online_url)
    : null;
  const instructions = eventPaused ? null : arrival?.event_private_details?.check_in_instructions?.trim();

  const qrDataUrl = await QRCode.toDataURL(pass.qr_payload, { errorCorrectionLevel: "M", margin: 2, scale: 8, color: { dark: "#241913", light: "#fffdf9" } });
  const date = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "long", year: "numeric", timeZone: pass.timezone }).format(new Date(pass.starts_at));
  const time = new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: pass.timezone }).format(new Date(pass.starts_at));
  return (
    <main className="event-pass-page">
      <header className="legal-header">
        <Link className="brand" href="/home"><span className="brand-mark">H</span><span>Her Africa Table<small>Event pass</small></span></Link>
        <Link href={`/events/${slug}`}>Event details</Link>
      </header>
      <section className="event-pass-shell">
        <div className="event-pass-intro">
          <p className="eyebrow">Your place is confirmed</p>
          <h1>{pass.event_title}</h1>
          <p>Present this private pass at the welcome desk. Keep the code to yourself.</p>
          <dl>
            <div><dt>Date</dt><dd>{date} · {time}</dd></div>
            <div><dt>Venue</dt><dd>{[pass.venue_name, pass.city].filter(Boolean).join(", ") || "Online"}</dd></div>
            <div><dt>Status</dt><dd>{pass.checked_in_at ? `Checked in at ${new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: pass.timezone }).format(new Date(pass.checked_in_at))}` : "Ready for check-in"}</dd></div>
          </dl>
          <div className="event-pass-actions">
            <AddToCalendarButton
              endsAt={pass.ends_at}
              eventId={pass.event_id}
              location={[venue?.name ?? pass.venue_name, venue?.address_line, venue?.city ?? pass.city].filter(Boolean).join(", ")}
              slug={pass.event_slug}
              startsAt={pass.starts_at}
              summary={null}
              title={pass.event_title}
            />
            {order?.reference ? <Link className="button button-outline" href={`/orders/${encodeURIComponent(order.reference)}`}>Manage my place</Link> : null}
            <Link className="button button-outline" href={`/events/${slug}`}>View event details</Link>
          </div>
        </div>
        <article className={`event-pass-card${pass.checked_in_at ? " is-used" : ""}`}>
          <div className="event-pass-card-head"><span>Her Africa Table</span><small>{pass.checked_in_at ? "Attendance confirmed" : "Event entry"}</small></div>
          <img src={qrDataUrl} alt={`QR entry pass for ${pass.event_title}`} width="264" height="264" />
          <div className="event-pass-code"><span>Manual code</span><strong>{pass.manual_code}</strong></div>
          <p>{pass.checked_in_at ? "You are checked in. Welcome to the table." : "Use this code if the camera is unavailable."}</p>
        </article>
      </section>
      {showReminder ? <StandaloneEventReminder
        canSet={canSetReminder}
        emailAllowed={notificationPreference?.email_events !== false}
        eventId={pass.event_id}
        initialStatus={reminder?.status ?? null}
      /> : null}
      <section className="event-pass-arrival" aria-labelledby="event-pass-arrival-heading" id="arrival">
        <div>
          <p className="eyebrow">Before you go</p>
          <h2 id="event-pass-arrival-heading">How to join</h2>
          {arrivalError ? <p role="alert">We could not load the latest arrival details. Please check again before the event or contact the event team.</p> : null}
          {eventPaused ? <p role="status">This event is paused. Please wait for an update from the event team before travelling or joining online.</p> : null}
          {venue && !eventPaused ? <p><strong>{venue.name}</strong>{venue.address_line ? ` · ${venue.address_line}` : ""}{venue.city ? `, ${venue.city}` : ""}</p> : null}
          {instructions ? <p>{instructions}</p> : null}
          {!venue && !joinUrl && !arrivalError && !eventPaused ? <p>The event team will share joining details before the gathering.</p> : null}
        </div>
        <div className="event-pass-arrival-actions">
          {mapUrl ? <a className="button button-outline" href={mapUrl} rel="noreferrer" target="_blank">Open directions</a> : null}
          {joinUrl && new Date(pass.ends_at).getTime() > Date.now()
            ? <a className="button button-primary" href={joinUrl} rel="noreferrer" target="_blank">Join online</a>
            : null}
        </div>
      </section>
    </main>
  );
}
