import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  EventAttendeeDirectory,
  type EventAttendee,
  type EventAttendeePreference,
} from "@/components/events/event-attendee-directory";
import { EventCommunityFollowUp } from "@/components/events/event-community-follow-up";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

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
  const activeMember = profile?.access_status === "active";
  if (!activeMember && profile?.access_status !== "pending") notFound();

  const { data: pastEvents, error: pastError } =
    await supabase.rpc("list_my_past_events");
  const event = ((pastEvents as MemberPastEvent[] | null) ?? []).find(
    (item) => item.slug === slug,
  );
  if (pastError || !event) notFound();
  const { data: guestFollowUpAccess } = !activeMember
    ? await supabase.rpc("can_leave_event_feedback", { p_event_id: event.event_id })
    : { data: false };
  if (!activeMember && !guestFollowUpAccess) notFound();

  const [
    recapResult,
    preferenceResult,
    attendeeResult,
    communityFlagResult,
    linkedCommunityResult,
    followUpResult,
    introResult,
  ] =
    await Promise.all([
      supabase
        .from("event_recaps")
        .select("title,summary,highlights")
        .eq("event_id", event.event_id)
        .eq("status", "published")
        .maybeSingle(),
      activeMember
        ? supabase
            .from("event_attendee_preferences")
            .select("discoverable,show_company,introduction")
            .eq("event_id", event.event_id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      activeMember
        ? supabase.rpc("list_event_attendee_directory", {
            p_event_id: event.event_id,
            p_limit: 30,
            p_offset: 0,
          })
        : Promise.resolve({ data: [] }),
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
      supabase.rpc("get_my_event_follow_up_interest", { p_event_id: event.event_id }),
      !activeMember
        ? supabase.rpc("get_my_event_intro_card", { p_event_id: event.event_id })
        : Promise.resolve({ data: null, error: null }),
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
  const followUp = ((followUpResult.data as { available: boolean; interested: boolean }[] | null) ?? [])[0] ?? null;
  const introAvailable = !activeMember && !introResult.error;

  return (
    <main className="event-follow-up-page">
      {activeMember ? <MemberHeader active="events" label="After the table" /> : (
        <header className="legal-header">
          <Link className="brand" href="/">Her Africa Table</Link>
          <Link href={`/events/${slug}`}>Back to event</Link>
        </header>
      )}
      <section className="follow-up-hero">
        <div>
          <p className="eyebrow">Your private event follow-up</p>
          <h1>{event.title}</h1>
          <p>
            {activeMember
              ? "Return to the ideas and people from the room, then choose the follow-up that feels useful to you."
              : "Revisit the event and choose what you would like to do next. Your event place does not make you a network member."}
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
        {activeMember ? <Link href="/network">
          <span>02</span>
          <strong>Find someone from the room</strong>
          <small>Connection requests still require mutual consent</small>
        </Link> : introAvailable ? <Link href={`/events/${slug}/meet`}>
          <span>02</span>
          <strong>See your event introductions</strong>
          <small>Only people who both agreed can connect here</small>
        </Link> : null}
        {activeMember ? <Link href="/opportunities">
          <span>03</span>
          <strong>Share an ask or offer</strong>
          <small>Turn a useful conversation into a clear next step</small>
        </Link> : <a href="#recap">
          <span>03</span>
          <strong>Read the event reflection</strong>
          <small>The Host’s reviewed recap appears below when ready</small>
        </a>}
        {activeMember ? <Link
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
        </Link> : <Link href={communityReady ? `/communities/${linkedCommunity!.slug}/about` : "/apply"}>
          <span>04</span>
          <strong>{communityReady ? `Discover ${linkedCommunity!.name}` : "Explore membership"}</strong>
          <small>Joining a Community requires a separate membership decision</small>
        </Link>}
      </nav>

      {recap ? (
        <section className="follow-up-recap" id="recap">
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
        <section className="follow-up-recap is-pending" id="recap">
          <div>
            <p className="eyebrow">Event reflection</p>
            <h2>The recap is being prepared.</h2>
          </div>
          <p>
            {activeMember
              ? "You can still reconnect with opted-in attendees or share private feedback while the team prepares the event reflection."
              : "You can still share private feedback while the team prepares the event reflection."}
          </p>
        </section>
      )}

      {followUp?.available ? <EventCommunityFollowUp eventId={event.event_id} initialInterested={followUp.interested} /> : null}
      {activeMember ? <EventAttendeeDirectory
        attendees={(attendeeResult.data as EventAttendee[] | null) ?? []}
        eventId={event.event_id}
        initialPreference={
          (preferenceResult.data as EventAttendeePreference | null) ?? null
        }
        mode="after"
      /> : null}
    </main>
  );
}
