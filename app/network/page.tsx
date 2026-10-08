import Link from "next/link";
import { redirect } from "next/navigation";
import {
  NetworkHub,
  type BlockedMember,
  type ConnectionContact,
  type CuratedIntroduction,
  type ConnectionAvailability,
  type ConnectionFollowup,
  type ConnectionOutcome,
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
    consentSuggestionsResult,
    introductionResult,
    availabilityResult,
    followupResult,
    outcomeResult,
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
      supabase.rpc("list_consent_led_member_recommendations", { p_limit: 6 }),
      supabase.rpc("list_my_curated_introductions"),
      supabase.rpc("list_connection_availability"),
      supabase.rpc("list_my_connection_followups"),
      supabase.rpc("list_my_connection_outcomes"),
    ]);
  const suggestionsResult = consentSuggestionsResult.error
    ? { data: [], error: null }
    : consentSuggestionsResult;
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
  // Discovery and request availability are essential; optional tools must not blank the directory.
  const coreReadError = Boolean(directoryResult.error || networkResult.error || availabilityResult.error || blocksResult.error);
  const unavailableAreas = [
    codeResult.error ? "code" : null,
    savedResult.error ? "saved" : null,
    consentSuggestionsResult.error ? "suggestions" : null,
    introductionResult.error ? "introductions" : null,
    followupResult.error ? "followups" : null,
    outcomeResult.error ? "outcomes" : null,
  ].filter((area): area is string => Boolean(area));
  return (
    <main className="network-page">
      <MemberHeader active="members" label="Members" />
      <section className="network-hero">
        <div>
          <p className="eyebrow">Members</p>
          <h1>Meet members</h1>
          <p>
            Find someone by her work, location or interests. You can message
            each other once you both agree to connect.
          </p>
          {!coreReadError ? <nav className="network-section-links" aria-label="Members sections">
            <a href="#browse-members">Find members</a>
            {connections.length ? <a href="#network-connections">Your connections</a> : null}
          </nav> : null}
        </div>
        {!networkResult.error && (accepted.length || pending.length) ? <aside aria-label="Network summary">
          <span>
            <strong>{accepted.length}</strong> connection{accepted.length === 1 ? "" : "s"}
          </span>
          <span>
            <strong>{pending.length}</strong> waiting for you
          </span>
        </aside> : null}
      </section>
      {coreReadError ? (
        <section className="admin-empty network-error">
          <strong>We could not open the member list</strong>
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
          connectionAvailability={
            (availabilityResult.data as ConnectionAvailability[] | null) ?? []
          }
          followups={
            (followupResult.data as ConnectionFollowup[] | null) ?? []
          }
          outcomes={
            (outcomeResult.data as ConnectionOutcome[] | null) ?? []
          }
          cityFilter={city ?? ""}
          goalFilter={goal ?? ""}
          searchQuery={q ?? ""}
          unavailableAreas={unavailableAreas}
        />
      )}
    </main>
  );
}
