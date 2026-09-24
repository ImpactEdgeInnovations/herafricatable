import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { EventIntroWorkspace, type EventIntroCard, type EventIntroRequest } from "@/components/events/event-intro-workspace";
import { absoluteUrl } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EventMeetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/meet`)}`);
  const { data: event } = await supabase.from("events").select("id,title")
    .eq("slug", slug).in("status", ["published", "completed"]).maybeSingle();
  if (!event) notFound();
  const [cardResult, requestsResult] = await Promise.all([
    supabase.rpc("get_my_event_intro_card", { p_event_id: event.id }),
    supabase.rpc("list_my_event_intros", { p_event_id: event.id }),
  ]);
  if (cardResult.error || requestsResult.error) return <main className="event-intro-page"><header className="legal-header"><Link className="brand" href="/">Her Africa Table</Link><Link href={`/events/${slug}`}>Back to event</Link></header><section className="event-pass-unavailable"><p className="eyebrow">Event introductions</p><h1>Introductions are not available yet.</h1><p>They are for confirmed guests when the event team has opened this feature. Your event pass is unchanged.</p><Link className="button button-primary" href={`/events/${slug}`}>View event</Link></section></main>;
  const card = ((cardResult.data as EventIntroCard[] | null) ?? [])[0] ?? null;
  const qrImage = card?.enabled
    ? await QRCode.toDataURL(absoluteUrl(`/events/${encodeURIComponent(slug)}/meet/${card.code}`), {
        errorCorrectionLevel: "M", margin: 2, scale: 6,
        color: { dark: "#251d1a", light: "#fffdf9" },
      })
    : null;
  return <EventIntroWorkspace card={card} eventId={event.id} eventSlug={slug} eventTitle={event.title} qrImage={qrImage} requests={(requestsResult.data as EventIntroRequest[] | null) ?? []} />;
}
