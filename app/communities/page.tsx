import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CommunityDirectory,
  type CommunitySummary,
} from "@/components/member/community-directory";
import {
  CommunityHostApplication,
  type CommunityHostApplicationState,
} from "@/components/member/community-host-application";
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
        <section className="community-hold">
          <p className="eyebrow">Your community home</p>
          <h1>The first table is being prepared.</h1>
          <p>
            Private spaces open only after their host, safety boundaries and
            member experience have passed release review. Your membership and
            existing connections remain unchanged.
          </p>
          <div className="journey-state-actions">
            <Link className="button button-primary" href="/events">
              View gatherings
            </Link>
            <Link className="button button-outline" href="/home">
              Return home
            </Link>
          </div>
        </section>
        <CommunityHostApplication
          applications={applications}
          migrationReady={!applicationResult.error}
        />
      </main>
    );
  }

  const communityResult = await supabase.rpc("list_communities");

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
          communities={
            (communityResult.data as CommunitySummary[] | null) ?? []
          }
        />
      )}

      <CommunityHostApplication
        applications={applications}
        migrationReady={!applicationResult.error}
      />
    </main>
  );
}
