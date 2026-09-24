import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { EventIntroTarget } from "@/components/events/event-intro-target";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EventIntroScanPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  if (!/^[0-9a-fA-F]{16}$/.test(code)) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/meet/${code}`)}`);
  const { data: event } = await supabase.from("events").select("id,title")
    .eq("slug", slug).in("status", ["published", "completed"]).maybeSingle();
  if (!event) notFound();
  const [resolved, requests] = await Promise.all([
    supabase.rpc("resolve_event_intro_card", { p_event_id: event.id, p_code: code }),
    supabase.rpc("list_my_event_intros", { p_event_id: event.id }),
  ]);
  const person = ((resolved.data as { user_id: string; display_name: string; introduction: string }[] | null) ?? [])[0];
  return <main className="event-intro-page"><header className="legal-header"><Link className="brand" href="/">Her Africa Table</Link><Link href={`/events/${slug}/meet`}>My introductions</Link></header><section className="event-intro-scan">
    <p className="eyebrow">{event.title}</p>
    {resolved.error || requests.error ? <><h1>Introductions are for confirmed guests.</h1><p>Your event place must be confirmed before you can open another guest’s card.</p></> : person ? <><h1>Meet {person.display_name}</h1><p>{person.introduction}</p><EventIntroTarget code={code.toUpperCase()} eventId={event.id} alreadyRequested={((requests.data as { other_user_id: string }[] | null) ?? []).some((request) => request.other_user_id === person.user_id)} /></> : <><h1>This introduction is unavailable.</h1><p>The code may have changed, the guest may have hidden her card, or this introduction may not be available to your account.</p></>}
    <Link className="button button-outline" href={`/events/${slug}/meet`}>Back to my introductions</Link>
  </section></main>;
}
