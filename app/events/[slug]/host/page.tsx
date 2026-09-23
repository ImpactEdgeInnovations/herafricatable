import { notFound, redirect } from "next/navigation";
import { MemberHeader } from "@/components/member/member-header";
import { EventHostWorkspace, type EventHostWorkspaceRow } from "@/components/events/event-host-workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EventHostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/events/${slug}/host`)}`);
  const { data, error } = await supabase.rpc("get_my_event_host_workspace", { p_slug: slug });
  const workspace = ((data as EventHostWorkspaceRow[] | null) ?? [])[0];
  if (error || !workspace) notFound();
  return <main className="admin-command-center event-command-page"><MemberHeader active="events" label="Your event" /><EventHostWorkspace initial={workspace} /></main>;
}
