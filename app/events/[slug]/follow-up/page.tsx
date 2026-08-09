import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  EventAttendeeDirectory,
  type EventAttendee,
  type EventAttendeePreference,
} from "@/components/events/event-attendee-directory";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type MemberPastEvent = {
  ends_at: string;
  event_id: string;
  feedback_id: string | null;
  slug: string;
  starts_at: string;
  title: string;
};

type LinkedCommunity = {
  communities:
    | { name: string; slug: string }
    | { name: string; slug: string }[]
    | null;
};

export default async function EventFollowUpPage({
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
    redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/follow-up`)}`);
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.access_status !== "active") redirect("/home");

  const { data: pastEvents, error: pastError } =
    await supabase.rpc("list_my_past_events");
  const event = ((pastEvents as MemberPastEvent[] | null) ?? []).find(
    (item) => item.slug === slug,
  );
  if (pastError || !event) notFound();

  const [
    recapResult,
    preferenceResult,
    attendeeResult,
    communityFlagResult,
    linkedCommunityResult,
  ] =
    await Promise.all([
      supabase
        .from("event_recaps")
        .select("title,summary,highlights")
        .eq("event_id", event.event_id)
        .eq("status", "published")
        .maybeSingle(),
      supabase
        .from("event_attendee_preferences")
        .select("discoverable,show_company,introduction")
        .eq("event_id", event.event_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.rpc("list_event_attendee_directory", {
        p_event_id: event.event_id,
        p_limit: 30,
        p_offset: 0,
      }),
      supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", "communities")
        .maybeSingle(),
      supabase
        .from("community_event_links")
        .select("communities!inner(name,slug)")
        .eq("event_id", event.event_id)
        .limit(1)
        .maybeSingle(),
    ]);
  const recap = recapResult.data;
  const linkedRelation = (linkedCommunityResult.data as LinkedCommunity | null)
    ?.communities;
  const linkedCommunity = Array.isArray(linkedRelation)
    ? linkedRelation[0]
    : linkedRelation;
  const communityReady = Boolean(
    communityFlagResult.data?.enabled && linkedCommunity?.slug,
  );

  return (
    <main className="event-follow-up-page">
      <MemberHeader active="events" label="After the table" />
      <section className="follow-up-hero">
        <div>
          <p className="eyebrow">Your private event follow-up</p>
          <h1>{event.title}</h1>
          <p>
            Return to the ideas and people from the room, then choose the
            follow-up that feels useful to you.
          </p>
        </div>
        <time>
          {new Intl.DateTimeFormat("en-KE", {
            dateStyle: "long",
          }).format(new Date(event.starts_at))}
        </time>
      </section>

      <nav className="follow-up-actions" aria-label="Event follow-up actions">
        <Link href={`/events/${slug}/feedback`}>
          <span>01</span>
          <strong>
            {event.feedback_id ? "Update your feedback" : "Share feedback"}
          </strong>
          <small>Private unless you separately permit a testimonial</small>
        </Link>
        <Link href="/network">
          <span>02</span>
          <strong>Find someone from the room</strong>
          <small>Connection requests still require mutual consent</small>
        </Link>
        <Link href="/opportunities">
          <span>03</span>
          <strong>Share an ask or offer</strong>
          <small>Turn a useful conversation into a clear next step</small>
        </Link>
        <Link
          href={
            communityReady
              ? `/communities/${linkedCommunity!.slug}?view=conversations&moment=event-follow-up#create-conversation`
              : communityFlagResult.data?.enabled
                ? "/communities"
                : "/messages"
          }
        >
          <span>04</span>
          <strong>
            {communityReady
              ? `Continue in ${linkedCommunity!.name}`
              : communityFlagResult.data?.enabled
                ? "Continue in a community"
              : "Continue a conversation"}
          </strong>
          <small>
            {communityReady
              ? "Share a reflection, question or useful next step with the room"
              : "Use the private space that matches your relationship"}
          </small>
        </Link>
      </nav>

      {recap ? (
        <section className="follow-up-recap">
          <div>
            <p className="eyebrow">From the table</p>
            <h2>{recap.title}</h2>
          </div>
          <div>
            <p>{recap.summary}</p>
            {recap.highlights?.length ? (
              <ul>
                {recap.highlights.map((highlight: string) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="follow-up-recap is-pending">
          <div>
            <p className="eyebrow">Event reflection</p>
            <h2>The recap is being prepared.</h2>
          </div>
          <p>
            You can still reconnect with opted-in attendees or share private
            feedback while the team prepares the event reflection.
          </p>
        </section>
      )}

      <EventAttendeeDirectory
        attendees={(attendeeResult.data as EventAttendee[] | null) ?? []}
        eventId={event.event_id}
        initialPreference={
          (preferenceResult.data as EventAttendeePreference | null) ?? null
        }
        mode="after"
      />
    </main>
  );
}
