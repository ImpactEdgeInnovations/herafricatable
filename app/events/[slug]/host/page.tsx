import { notFound, redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import { EventHostWorkspace, type EventHostCover, type EventHostWorkspaceRow } from "@/components/events/event-host-workspace";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function EventHostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/host`)}`);
  const { data, error } = await supabase.rpc("get_my_event_host_workspace", { p_slug: slug });
  const workspace = ((data as EventHostWorkspaceRow[] | null) ?? [])[0];
  if (error || !workspace) notFound();
  const coverResult = await supabase.from("event_host_covers")
    .select("draft_storage_path,draft_alt_text,published_storage_path")
    .eq("event_id", workspace.event_id).maybeSingle();
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
  return <main className="admin-command-center event-command-page"><MemberHeader active="events" label="Your event" /><EventHostWorkspace initial={workspace} cover={cover} coverReady={!coverResult.error} /></main>;
}
