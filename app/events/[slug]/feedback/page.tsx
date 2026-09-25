import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  PostEventFeedbackForm,
  type ExistingEventFeedback,
} from "@/components/events/post-event-feedback-form";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/events/${slug}/feedback`)}`,
    );
  }
  const { data: profile } = await supabase.from("profiles")
    .select("access_status").eq("id", user.id).maybeSingle();
  const activeMember = profile?.access_status === "active";

  const { data: events, error } = await supabase.rpc("list_my_past_events");
  const event = (
    events as { event_id: string; slug: string; title: string }[] | null
  )?.find((item) => item.slug === slug);

  if (error) {
    return (
      <main className="event-feedback-page">
        {activeMember ? <MemberHeader active="events" label="Private event feedback" /> : (
          <header className="legal-header">
            <Link className="brand" href="/">Her Africa Table</Link>
            <Link href="/events/past">Past events</Link>
          </header>
        )}
        <section className="admin-empty opportunity-error" role="alert">
          <strong>Feedback is temporarily unavailable</strong>
          <p>
            Your response has not been changed. Reload in a moment or contact
            support if you still cannot open this event.
          </p>
          <div className="portal-actions">
            <Link className="button button-primary" href={`/events/${slug}/feedback`}>
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if (!event) notFound();

  if (!activeMember) {
    if (profile?.access_status !== "pending") notFound();
    const { data: allowed } = await supabase.rpc("can_leave_event_feedback", {
      p_event_id: event.event_id,
    });
    if (!allowed) notFound();
  }

  const { data: existing } = await supabase
    .from("event_feedback")
    .select(
      "overall_rating,relevance_rating,connection_rating,would_recommend,highlight,improvement,testimonial_quote,testimonial_consent,testimonial_status",
    )
    .eq("event_id", event.event_id)
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="event-feedback-page">
      {activeMember ? <MemberHeader active="events" label="Private event feedback" /> : (
        <header className="legal-header">
          <Link className="brand" href="/">Her Africa Table</Link>
          <Link href={`/events/${slug}/follow-up`}>Back to event follow-up</Link>
        </header>
      )}
      <PostEventFeedbackForm
        eventId={event.event_id}
        eventTitle={event.title}
        existing={(existing as ExistingEventFeedback | null) ?? null}
      />
    </main>
  );
}
