import Link from "next/link";
import { redirect } from "next/navigation";
import {
  NetworkHub,
  type BlockedMember,
  type ConnectionContact,
  type CuratedIntroduction,
  type DirectoryMember,
  type NetworkConnection,
  type SavedMemberProfile,
  type SuggestedMember,
} from "@/components/member/network-hub";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string; goal?: string; q?: string }>;
}) {
  const { city, goal, q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status,visibility_paused")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.access_status !== "active") redirect("/home");
  const [
    codeResult,
    directoryResult,
    networkResult,
    blocksResult,
    savedResult,
    suggestionsResult,
    introductionResult,
  ] = await Promise.all([
      supabase.rpc("ensure_connection_code"),
      supabase.rpc("list_member_directory", {
        p_city: city || null,
        p_goal: goal || null,
        p_limit: 24,
        p_offset: 0,
        p_search: q || null,
      }),
      supabase.rpc("list_my_network_with_context"),
      supabase.rpc("list_my_blocks"),
      supabase.rpc("list_my_saved_profiles"),
      supabase.rpc("list_member_recommendations", { p_limit: 6 }),
      supabase.rpc("list_my_curated_introductions"),
    ]);
  const connections = (networkResult.data as NetworkConnection[] | null) ?? [];
  const accepted = connections.filter((item) => item.status === "accepted");
  const pending = connections.filter(
    (item) => item.status === "pending" && item.direction === "incoming",
  );
  const contacts = (
    await Promise.all(
      accepted.map(async (item) => {
        const { data } = await supabase.rpc("get_connection_contact", {
          p_member_id: item.other_user_id,
        });
        const contact = (
          data as Omit<ConnectionContact, "user_id">[] | null
        )?.[0];
        return contact
          ? { ...contact, user_id: item.other_user_id }
          : null;
      }),
    )
  ).filter((item): item is ConnectionContact => Boolean(item));
  return (
    <main className="network-page">
      <MemberHeader active="members" label="Member network" />
      <section className="network-hero">
        <div>
          <p className="eyebrow">Your trusted network</p>
          <h1>Find the right person.</h1>
          <p>
            Search by her work, city, interests or what she hopes to achieve.
            Private contact details appear only after you both connect.
          </p>
        </div>
        <aside aria-label="Network summary">
          <span>
            <strong>{accepted.length}</strong> connections
          </span>
          <span>
            <strong>{pending.length}</strong> requests waiting
          </span>
        </aside>
      </section>
      {directoryResult.error ||
      networkResult.error ||
      codeResult.error ||
      savedResult.error ||
      suggestionsResult.error ||
      introductionResult.error ? (
        <section className="admin-empty network-error">
          <strong>The member directory is temporarily unavailable</strong>
          <p>Please try again or contact support if the problem continues.</p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/network">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <NetworkHub
          members={(directoryResult.data as DirectoryMember[] | null) ?? []}
          connections={connections}
          connectionCode={(codeResult.data as string) ?? ""}
          contacts={contacts}
          blockedMembers={(blocksResult.data as BlockedMember[] | null) ?? []}
          savedMembers={
            (savedResult.data as SavedMemberProfile[] | null) ?? []
          }
          suggestedMembers={
            (suggestionsResult.data as SuggestedMember[] | null) ?? []
          }
          curatedIntroductions={
            (introductionResult.data as CuratedIntroduction[] | null) ?? []
          }
          cityFilter={city ?? ""}
          goalFilter={goal ?? ""}
          searchQuery={q ?? ""}
        />
      )}
    </main>
  );
}
