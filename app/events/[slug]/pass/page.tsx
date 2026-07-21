import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventPass = {
  checked_in_at: string | null; city: string | null; ends_at: string; event_id: string;
  event_slug: string; event_title: string; manual_code: string; membership_status: string;
  qr_payload: string; starts_at: string; timezone: string; venue_name: string | null;
};

export default async function EventPassPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/pass`)}`);
  const { data: event } = await supabase.from("events").select("id").eq("slug", slug).maybeSingle();
  if (!event) notFound();
  const { data, error } = await supabase.rpc("get_my_event_pass", { p_event_id: event.id });
  const pass = (data?.[0] as EventPass | undefined) ?? null;
  if (error || !pass) return <main className="event-pass-page"><header className="legal-header"><Link className="brand" href="/"><span className="brand-mark">H</span><span>Her Africa Table<small>Event pass</small></span></Link><Link href={`/events/${slug}`}>Back to event</Link></header><section className="event-pass-unavailable"><p className="eyebrow">Event access</p><h1>Your pass is not ready yet.</h1><p>A pass is issued after your registration and payment review are confirmed. If you believe this is an error, contact support with your order reference.</p><div><Link className="button button-primary" href="/home">View registrations</Link><Link className="button button-outline" href="/support">Contact support</Link></div></section></main>;

  const qrDataUrl = await QRCode.toDataURL(pass.qr_payload, { errorCorrectionLevel: "M", margin: 2, scale: 8, color: { dark: "#241913", light: "#fffdf9" } });
  const date = new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "long", year: "numeric", timeZone: pass.timezone }).format(new Date(pass.starts_at));
  const time = new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: pass.timezone }).format(new Date(pass.starts_at));
  return <main className="event-pass-page"><header className="legal-header"><Link className="brand" href="/"><span className="brand-mark">H</span><span>Her Africa Table<small>Event pass</small></span></Link><Link href={`/events/${slug}`}>Event details</Link></header><section className="event-pass-shell"><div className="event-pass-intro"><p className="eyebrow">Confirmed access</p><h1>{pass.event_title}</h1><p>Present this pass at the welcome desk. Keep the code private—it grants entry to your registration.</p><dl><div><dt>Date</dt><dd>{date} · {time}</dd></div><div><dt>Venue</dt><dd>{[pass.venue_name, pass.city].filter(Boolean).join(", ") || "Online"}</dd></div><div><dt>Status</dt><dd>{pass.checked_in_at ? `Checked in at ${new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: pass.timezone }).format(new Date(pass.checked_in_at))}` : "Ready for check-in"}</dd></div></dl></div><article className={`event-pass-card${pass.checked_in_at ? " is-used" : ""}`}><div className="event-pass-card-head"><span>Her Africa Table</span><small>{pass.checked_in_at ? "Attendance confirmed" : "Member entry"}</small></div><img src={qrDataUrl} alt={`QR entry pass for ${pass.event_title}`} width="264" height="264" /><div className="event-pass-code"><span>Manual code</span><strong>{pass.manual_code}</strong></div><p>{pass.checked_in_at ? "You are checked in. Welcome to the table." : "Use this code if the camera is unavailable."}</p></article></section></main>;
}
