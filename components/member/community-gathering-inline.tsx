"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { memberErrorMessage } from "@/lib/member-error";
import { CommunityGatheringRoom, type CommunityGatheringRoomState, type CommunityGatheringMessage, type CommunityGatheringQuestion, type CommunityGatheringAttendee } from "./community-gathering-room";
import type { GatheringVideo } from "./community-gathering-video";
import type { CommunityGatheringCard } from "./community-gatherings";

type Loaded = { room: CommunityGatheringRoomState; messages: CommunityGatheringMessage[]; questions: CommunityGatheringQuestion[]; attendees: CommunityGatheringAttendee[]; video: GatheringVideo | null; videoReady: boolean; contentKind: "scheduled" | "prerecorded"; reminder: "day_before" | "hour_before" | null };

export function CommunityGatheringInline({ card, communityId, currentUserId, onClose, backLabel = "Back to gatherings" }: {
  card: CommunityGatheringCard; communityId: string; currentUserId: string; onClose(): void; backLabel?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    setData(null); setError(""); heading.current?.focus();
    async function load() {
      try {
        const { data: profile, error: profileError } = await supabase.from("profiles").select("access_status").eq("id",currentUserId).maybeSingle();
        if (profileError) throw profileError;
        if (profile?.access_status !== "active") throw new Error("Your membership needs to be active to open this gathering.");
        const result = await supabase.rpc("get_community_gathering_room", {p_community_id:communityId,p_event_id:card.event_id});
        if (result.error) throw result.error;
        const room = (result.data as CommunityGatheringRoomState[] | null)?.[0];
        if (!room) throw new Error("This gathering is no longer available.");
        const [messages,questions,attendees,video,preferences,kind] = await Promise.all([
          supabase.rpc("list_community_gathering_messages",{p_room_id:room.room_id,p_limit:200}),
          supabase.rpc("list_community_gathering_questions",{p_room_id:room.room_id}),
          supabase.rpc("list_community_gathering_attendees",{p_room_id:room.room_id}),
          supabase.rpc("get_community_gathering_video",{p_room_id:room.room_id}),
          supabase.rpc("list_my_community_event_preferences",{p_community_id:communityId}),
          supabase.rpc("get_community_gathering_content_kind",{p_room_id:room.room_id}),
        ]);
        if (messages.error || questions.error || attendees.error || kind.error) throw messages.error || questions.error || attendees.error || kind.error;
        if (active) setData({room,messages:messages.data ?? [],questions:questions.data ?? [],attendees:attendees.data ?? [],video:video.data as GatheringVideo | null,videoReady:!video.error,
          contentKind: kind.data === "prerecorded" ? "prerecorded" : "scheduled",
          reminder:((preferences.data as {event_id:string;reminder_window:"day_before"|"hour_before"|null}[] | null) ?? []).find(item=>item.event_id===card.event_id)?.reminder_window ?? null});
      } catch (cause) { if (active) setError(memberErrorMessage(cause,"open this gathering")); }
    }
    void load(); return () => {active=false;};
  },[card.event_id,communityId,currentUserId,retry,supabase]);
  return <section className="community-inline-gathering" aria-labelledby="inline-gathering-title">
    <button type="button" className="community-inline-back" onClick={onClose}>← {backLabel}</button>
    <h2 ref={heading} id="inline-gathering-title" tabIndex={-1} className="sr-only">{card.title}</h2>
    {error ? <div role="alert"><p>{error}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>Try again</button></div> : !data ? <p role="status">Opening gathering…</p> :
      <CommunityGatheringRoom key={data.room.room_id} room={data.room} communityId={communityId} currentUserId={currentUserId} eventId={card.event_id}
        messages={data.messages} questions={data.questions} attendees={data.attendees} reminderWindow={data.reminder}
        video={data.video} videoReady={data.videoReady} contentKind={data.contentKind} embedded />}
  </section>;
}
