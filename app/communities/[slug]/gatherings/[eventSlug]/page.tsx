import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import { CommunityLocalNavigation } from "@/components/member/community-local-navigation";
import {
  CommunityGatheringRoom,
  type CommunityGatheringAttendee,
  type CommunityGatheringMessage,
  type CommunityGatheringQuestion,
  type CommunityGatheringRoomState,
} from "@/components/member/community-gathering-room";
import type { CommunitySummary } from "@/components/member/community-directory";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CommunityGatheringPage({
  params,
}: {
  params: Promise<{ eventSlug: string; slug: string }>;
}) {
  const { eventSlug, slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/communities/${slug}/gatherings/${eventSlug}`)}`);

  const [{ data: profile }, communitiesResult, eventResult] = await Promise.all([
    supabase.from("profiles").select("access_status").eq("id", user.id).maybeSingle(),
    supabase.rpc("list_communities"),
    supabase.from("events").select("id").eq("slug", eventSlug).in("status", ["published", "completed"]).maybeSingle(),
  ]);
  if (profile?.access_status !== "active") redirect("/membership/status");
  const community = ((communitiesResult.data as CommunitySummary[] | null) ?? []).find((item) => item.slug === slug);
  if (!community || community.membership_status !== "active") notFound();
  if (!eventResult.data) notFound();
  const eventId = eventResult.data.id;
  const canManage = ["owner", "moderator"].includes(community.membership_role ?? "");

  const roomResult = await supabase.rpc("get_community_gathering_room", {
    p_community_id: community.community_id,
    p_event_id: eventId,
  });
  const room = ((roomResult.data as CommunityGatheringRoomState[] | null) ?? [])[0] ?? null;
  if (roomResult.error) {
    return (
      <main className="community-page">
        <MemberHeader active="community" label={community.name} />
        <CommunityLocalNavigation active="gatherings" canManage={canManage} slug={slug} />
        <section className="admin-empty opportunity-error" role="alert">
          <strong>This gathering room is being prepared.</strong>
          <p>Your event is safe. Run the Community gathering rooms migration, then return here.</p>
          <Link className="button button-primary" href={`/communities/${slug}?view=gatherings`}>Back to gatherings</Link>
        </section>
      </main>
    );
  }
  if (!room) notFound();

  const [messageResult, questionResult, attendeeResult, preferenceResult] = await Promise.all([
    supabase.rpc("list_community_gathering_messages", { p_limit: 200, p_room_id: room.room_id }),
    supabase.rpc("list_community_gathering_questions", { p_room_id: room.room_id }),
    supabase.rpc("list_community_gathering_attendees", { p_room_id: room.room_id }),
    supabase.rpc("list_my_community_event_preferences", { p_community_id: community.community_id }),
  ]);

  return (
    <main className="community-page gathering-room-page">
      <MemberHeader active="community" label={community.name} />
      <CommunityLocalNavigation active="gatherings" canManage={canManage} slug={slug} />
      <CommunityGatheringRoom
        attendees={(attendeeResult.data as CommunityGatheringAttendee[] | null) ?? []}
        communityId={community.community_id}
        currentUserId={user.id}
        eventId={eventId}
        messages={(messageResult.data as CommunityGatheringMessage[] | null) ?? []}
        questions={(questionResult.data as CommunityGatheringQuestion[] | null) ?? []}
        reminderWindow={((preferenceResult.data as { event_id: string; reminder_window: "day_before" | "hour_before" | null }[] | null) ?? []).find((item) => item.event_id === eventId)?.reminder_window ?? null}
        room={room}
      />
    </main>
  );
}
