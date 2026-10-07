import { notFound, redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import { EventHostWorkspace, type EventHostCommunity, type EventHostCover, type EventHostOutcomes, type EventHostWorkspaceRow } from "@/components/events/event-host-workspace";
import { DestinationInvitationPanel, type DestinationInvitation } from "@/components/member/destination-invitation-panel";
import { createClient } from "@/lib/supabase/server";
import { EventFreeBookingControl } from "@/components/events/event-free-booking-control";
import type { Metadata } from "next";
import { PilotEventCancellation, type PilotCancellation } from "@/components/events/pilot-event-cancellation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EventHostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/host`)}`);
  const { data: cancellationRows } = await supabase.rpc("list_pilot_event_cancellations", { p_slug: slug });
  const cancellations = (cancellationRows as PilotCancellation[] | null) ?? [];
  if (cancellations.length) return <main className="event-host-page"><MemberHeader active="events" label="Your event" /><PilotEventCancellation items={cancellations} /></main>;
  const { data, error } = await supabase.rpc("get_my_event_host_workspace", { p_slug: slug });
  const workspace = ((data as EventHostWorkspaceRow[] | null) ?? [])[0];
  if (error) throw new Error("The event workspace could not be loaded. Please try again.");
  if (!workspace) notFound();
  const { data: selfPublish } = await supabase.rpc("can_self_publish_pilot_event", { p_event_id: workspace.event_id });
  const { data: canCancel } = await supabase.rpc("can_cancel_pilot_event", { p_event_id: workspace.event_id });
  const hasEnded = new Date(workspace.ends_at).getTime() < Date.now();
  const freeBookingResult = workspace.event_status === "published" && !hasEnded
    ? await supabase.from("events").select("free_instant_booking,registration_mode")
        .eq("id", workspace.event_id).maybeSingle()
    : { data: null, error: null };
  const [coverResult, outcomesResult, communitiesResult, invitationsResult] = await Promise.all([
    hasEnded ? Promise.resolve({ data: null, error: null }) : supabase.from("event_host_covers")
      .select("draft_storage_path,draft_alt_text,published_storage_path")
      .eq("event_id", workspace.event_id).maybeSingle(),
    hasEnded
      ? supabase.rpc("get_event_host_outcomes", { p_event_id: workspace.event_id })
      : Promise.resolve({ data: null, error: null }),
    supabase.rpc("list_my_host_event_communities", { p_event_id: workspace.event_id }),
    workspace.event_status === "published" && !hasEnded
      ? supabase.rpc("list_my_table_invitations", {
          p_destination_id: workspace.event_id,
          p_destination_type: "event",
        })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const savedCover = coverResult.data as Omit<EventHostCover, "draft_url" | "published_url"> | null;
  const [draftSigned, publishedSigned] = savedCover
    ? await Promise.all([
        supabase.storage.from("event-host-covers").createSignedUrl(savedCover.draft_storage_path, 3600),
        savedCover.published_storage_path
          ? supabase.storage.from("event-host-covers").createSignedUrl(savedCover.published_storage_path, 3600)
          : Promise.resolve({ data: null }),
      ])
    : [{ data: null }, { data: null }];
  const cover: EventHostCover | null = savedCover ? {
    ...savedCover,
    draft_url: draftSigned.data?.signedUrl ?? null,
    published_url: publishedSigned.data?.signedUrl ?? null,
  } : null;
  const outcomes = ((outcomesResult.data as EventHostOutcomes[] | null) ?? [])[0] ?? null;
  return <main className="event-host-page"><MemberHeader active="events" label="Your event" /><EventHostWorkspace initial={workspace} cover={cover} coverReady={!coverResult.error} outcomes={outcomes} communities={(communitiesResult.data as EventHostCommunity[] | null) ?? []} communityLinksReady={!communitiesResult.error} selfPublish={selfPublish === true} />{workspace.event_status === "published" && !hasEnded && freeBookingResult.data?.registration_mode === "manual_review" ? <EventFreeBookingControl eventId={workspace.event_id} eventTitle={workspace.event_title} enabled={Boolean(freeBookingResult.data.free_instant_booking)} ready={!freeBookingResult.error} /> : null}{workspace.event_status === "published" && !hasEnded ? <DestinationInvitationPanel destinationId={workspace.event_id} destinationName={workspace.event_title} destinationType="event" invitations={(invitationsResult.data as DestinationInvitation[] | null) ?? []} ready={!invitationsResult.error} /> : null}{canCancel === true ? <PilotEventCancellation eventId={workspace.event_id} title={workspace.event_title} /> : null}</main>;
}
