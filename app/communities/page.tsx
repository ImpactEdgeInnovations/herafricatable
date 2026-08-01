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

export const dynamic = "force-dynamic";

export default async function CommunitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const [{ data: profile }, { data: flag }, applicationResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("access_status")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", "communities")
        .maybeSingle(),
      supabase.rpc("list_my_community_host_applications"),
    ]);

  if (profile?.access_status !== "active") redirect("/home");

  const applications =
    (applicationResult.data as CommunityHostApplicationState[] | null) ?? [];

  if (!flag?.enabled) {
    return (
      <main className="community-page">
        <MemberHeader active="community" label="Community" />
        <section className="community-hero community-preview-hero">
          <div>
            <p className="eyebrow">Your community home</p>
            <h1>
              A quieter way
              <br />
              to belong.
            </h1>
            <p>
              Trusted rooms for thoughtful introductions, practical support and
              relationships that continue beyond each gathering.
            </p>
          </div>
          <span className="community-preview-badge">Private preview</span>
        </section>
        <nav
          className="community-landing-navigation"
          aria-label="Community preview areas"
        >
          <a href="#community-preview">What opens first</a>
          <a href="#create-community">Create a community</a>
        </nav>
        <section className="community-preview-panel" id="community-preview">
          <div className="community-preview-copy">
            <p className="eyebrow">Opening carefully</p>
            <h2>The first rooms are passing final review.</h2>
            <p>
              Community access stays private until the host, backup moderator,
              member boundaries and safety experience are ready. Nothing about
              your wider membership or existing connections changes while we
              prepare.
            </p>
            <div className="journey-state-actions">
              <Link className="button button-primary" href="/events">
                View gatherings
              </Link>
              <Link className="button button-outline" href="/network">
                Meet members
              </Link>
            </div>
          </div>
          <ol aria-label="Community opening sequence">
            <li>
              <span>01</span>
              <div>
                <strong>Founding rooms</strong>
                <p>Small, hosted spaces connected to real gatherings.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Purpose-led communities</strong>
                <p>Approved hosts bring members together around clear value.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Member-led growth</strong>
                <p>New rooms open only after trust and operating review.</p>
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

  const [communityResult, brandingResult, activityResult] = await Promise.all([
    supabase.rpc("list_communities"),
    supabase.rpc("list_community_brand_identities", {
      p_community_id: null,
    }),
    supabase.rpc("list_my_community_activity"),
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

  return (
    <main className="community-page">
      <MemberHeader active="community" label="Community" />
      <section className="community-hero">
        <div>
          <p className="eyebrow">Your community home</p>
          <h1>
            Belong with
            <br />
            shared purpose.
          </h1>
          <p>
            Enter a trusted room to introduce yourself, exchange practical
            support and continue relationships beyond each gathering.
          </p>
        </div>
        <a className="button button-outline" href="#create-community">
          Create a community
        </a>
      </section>
      <nav
        className="community-landing-navigation"
        aria-label="Community page areas"
      >
        <a href="#your-communities">Your communities</a>
        <a href="#discover-communities">Discover</a>
        <a href="#create-community">Create a community</a>
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
