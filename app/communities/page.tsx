import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CommunityDirectory,
  type CommunityActivitySummary,
  type CommunitySummary,
} from "@/components/member/community-directory";
import {
  CommunityHostApplication,
  type CommunityHostApplicationState,
} from "@/components/member/community-host-application";
import type { CommunityBrandIdentity } from "@/components/member/community-branding-panel";
import { MemberHeader } from "@/components/member/member-header";
import { createClient } from "@/lib/supabase/server";
import type { CommunityJoiningSettings } from "@/components/member/community-joining-settings";

export const dynamic = "force-dynamic";

export default async function CommunitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [
    { data: profile },
    { data: flag },
    { data: acceptanceFlag },
    applicationResult,
  ] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("access_status, is_test_account")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", "communities")
        .maybeSingle(),
      supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", "community_acceptance_mode")
        .maybeSingle(),
      supabase.rpc("list_my_community_host_applications"),
    ]);

  if (profile?.access_status !== "active") redirect("/home");

  const applications =
    (applicationResult.data as CommunityHostApplicationState[] | null) ?? [];

  const communityAvailable =
    flag?.enabled || (profile?.is_test_account && acceptanceFlag?.enabled);

  if (!communityAvailable) {
    return (
      <main className="community-page">
        <MemberHeader active="community" label="Communities" />
        <section className="community-hero community-preview-hero">
          <div>
            <p className="eyebrow">Communities</p>
            <h1>
              Find your people.
              <br />
              Grow together.
            </h1>
            <p>
              Join a private group of women who share an interest, goal or
              location. Talk, exchange support and meet beyond the screen.
            </p>
          </div>
          <span className="community-preview-badge">Opening soon</span>
        </section>
        <nav
          className="community-landing-navigation"
          aria-label="Community preview areas"
        >
          <a href="#community-preview">How it works</a>
          <a href="#create-community">Start a community</a>
        </nav>
        <section className="community-preview-panel" id="community-preview">
          <div className="community-preview-copy">
            <p className="eyebrow">How communities work</p>
            <h2>Small groups with a clear purpose.</h2>
            <p>
              Each community has a trusted leader and its own members,
              conversations, events and learning. We are checking the first
              groups before opening them to members.
            </p>
            <div className="journey-state-actions">
              <Link className="button button-primary" href="/events">
                Browse upcoming events
              </Link>
              <Link className="button button-outline" href="/network">
                Meet other members
              </Link>
            </div>
          </div>
          <ol aria-label="How communities work">
            <li>
              <span>01</span>
              <div>
                <strong>Find your group</strong>
                <p>Choose a community built around a purpose you share.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Join safely</strong>
                <p>Request to join or accept an invitation from the leader.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Take part</strong>
                <p>Post, reply, meet members and join community events.</p>
              </div>
            </li>
          </ol>
        </section>
        <CommunityHostApplication
          applications={applications}
          migrationReady={!applicationResult.error}
        />
      </main>
    );
  }

  const [communityResult, brandingResult, activityResult, joiningResult] = await Promise.all([
    supabase.rpc("list_communities"),
    supabase.rpc("list_community_brand_identities", {
      p_community_id: null,
    }),
    supabase.rpc("list_my_community_activity"),
    supabase.rpc("list_community_joining_settings", {
      p_community_id: null,
    }),
  ]);
  const communities =
    (communityResult.data as CommunitySummary[] | null) ?? [];
  const branding =
    (brandingResult.data as CommunityBrandIdentity[] | null) ?? [];
  const signedBranding = await Promise.all(
    branding.map(async (identity) => {
      const signed = identity.icon_storage_path
        ? await supabase.storage
            .from("community-media")
            .createSignedUrl(identity.icon_storage_path, 3600)
        : { data: null };
      return {
        ...identity,
        icon_url: signed.data?.signedUrl ?? null,
      };
    }),
  );
  const brandingByCommunity = new Map(
    signedBranding.map((identity) => [identity.community_id, identity]),
  );
  const activityByCommunity = new Map(
    ((activityResult.data as CommunityActivitySummary[] | null) ?? []).map(
      (activity) => [activity.community_id, activity],
    ),
  );
  const joiningByCommunity = new Map(
    ((joiningResult.data as CommunityJoiningSettings[] | null) ?? []).map(
      (settings) => [settings.community_id, settings],
    ),
  );

  return (
    <main className="community-page">
      <MemberHeader active="community" label="Communities" />
      <section className="community-hero community-member-hero">
        <div>
          <p className="eyebrow">Communities</p>
          <h1>
            Your people,
            <br />
            one place.
          </h1>
          <p>
            Pick up conversations, meet members and find the next useful thing
            to do together.
          </p>
        </div>
      </section>
      <nav
        className="community-landing-navigation"
        aria-label="Community page areas"
      >
        <a href="#your-communities">Your communities</a>
        <a href="#discover-communities">Find a community</a>
      </nav>

      {communityResult.error ? (
        <section className="admin-empty opportunity-error">
          <strong>Community is temporarily unavailable</strong>
          <p>
            Please try again or contact support if the problem continues.
          </p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/communities">
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <CommunityDirectory
          communities={communities.map((community) => ({
            ...community,
            ...(brandingByCommunity.get(community.community_id) ?? {}),
            ...(activityByCommunity.get(community.community_id) ?? {}),
            ...(joiningByCommunity.get(community.community_id) ?? {}),
          }))}
        />
      )}

      <CommunityHostApplication
        applications={applications}
        migrationReady={!applicationResult.error}
      />
    </main>
  );
}
