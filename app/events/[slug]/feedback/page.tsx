import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  PostEventFeedbackForm,
  type ExistingEventFeedback,
} from "@/components/events/post-event-feedback-form";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

  const { data: events, error } = await supabase.rpc("list_my_past_events");
  const event = (
    events as { event_id: string; slug: string; title: string }[] | null
  )?.find((item) => item.slug === slug);

  if (error) {
    return (
      <main className="event-feedback-page">
        <MemberHeader active="events" label="Private event feedback" />
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
      <MemberHeader active="events" label="Private event feedback" />
      <PostEventFeedbackForm
        eventId={event.event_id}
        eventTitle={event.title}
        existing={(existing as ExistingEventFeedback | null) ?? null}
      />
    </main>
  );
}
