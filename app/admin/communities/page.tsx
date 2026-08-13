import { redirect } from "next/navigation";
import { AdminHeader } from "@/components/admin/admin-header";
import {
  CommunityCommandCentre,
  type CommunityHealth,
} from "@/components/admin/community-command-centre";
import type { CommunityHostApplicationAdmin } from "@/components/admin/community-host-application-manager";
import type { CommunityMember } from "@/components/admin/community-manager";
import type { CommunitySummary } from "@/components/member/community-directory";
import type { CommunityBrandIdentity } from "@/components/member/community-branding-panel";
import { createClient } from "@/lib/supabase/server";
import type { ApplicationProposalMedia } from "@/lib/application-proposal-media";

export const dynamic = "force-dynamic";

export default async function AdminCommunitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!role) redirect("/admin");

  const [communityResult, applicationResult, joiningResult, brandingResult, applicationMediaResult] = await Promise.all([
    supabase.rpc("list_communities"),
    supabase.rpc("list_community_host_applications_admin"),
    supabase.rpc("list_community_joining_settings", { p_community_id: null }),
    supabase.rpc("list_community_brand_identities", { p_community_id: null }),
    supabase.rpc("list_admin_application_proposal_media"),
  ]);
  const joiningByCommunity = new Map(
    ((joiningResult.data as {
      admission_mode: "open" | "approval";
      community_id: string;
      effective_mode: "open" | "approval";
    }[] | null) ?? []).map((item) => [item.community_id, item]),
  );
  const communities = (
    (communityResult.data as CommunitySummary[] | null) ?? []
  ).map((community) => ({
    ...community,
    ...(joiningByCommunity.get(community.community_id) ?? {}),
  }));
  const branding = await Promise.all(
    (((brandingResult.data as CommunityBrandIdentity[] | null) ?? [])).map(
      async (identity) => {
        const [icon, cover] = await Promise.all([
          identity.icon_storage_path
            ? supabase.storage.from("community-media").createSignedUrl(identity.icon_storage_path, 3600)
            : Promise.resolve({ data: null }),
          identity.cover_storage_path
            ? supabase.storage.from("community-media").createSignedUrl(identity.cover_storage_path, 3600)
            : Promise.resolve({ data: null }),
        ]);
        return {
          ...identity,
          cover_url: cover.data?.signedUrl ?? null,
          icon_url: icon.data?.signedUrl ?? null,
        };
      },
    ),
  );
  const applicationMedia = await Promise.all(
    (((applicationMediaResult.data as Omit<ApplicationProposalMedia, "image_url">[] | null) ?? [])
      .filter((item) => item.context_type === "community_application"))
      .map(async (item) => {
        const signed = await supabase.storage.from("proposal-media").createSignedUrl(item.storage_path, 3600);
        return { ...item, image_url: signed.data?.signedUrl ?? null };
      }),
  );

  const [memberResults, healthResults] = await Promise.all([
    Promise.all(
      communities.map((community) =>
        supabase.rpc("list_community_members", {
          p_community_id: community.community_id,
        }),
      ),
    ),
    Promise.all(
      communities.map((community) =>
        supabase.rpc("get_community_host_health", {
          p_community_id: community.community_id,
        }),
      ),
    ),
  ]);
  const members = memberResults.flatMap((result, index) =>
    ((result.data as Omit<CommunityMember, "community_id">[] | null) ?? []).map(
      (member) => ({
        ...member,
        community_id: communities[index].community_id,
      }),
    ),
  );
  const health = healthResults.map((result, index) => ({
    ...(((result.data as Omit<CommunityHealth, "community_id">[] | null) ?? [])[0] ?? {
      active_members: 0,
      comments_7d: 0,
      open_reports: 0,
      pending_members: 0,
      posts_7d: 0,
      unanswered_asks: 0,
      upcoming_gatherings: 0,
    }),
    community_id: communities[index].community_id,
  }));

  return (
    <main className="admin-command-center community-command-page">
      <AdminHeader
        active="communities"
        label="Community oversight"
        role="super_admin"
      />
      <CommunityCommandCentre
        applicationReady={!applicationResult.error}
        applications={
          (applicationResult.data as CommunityHostApplicationAdmin[] | null) ?? []
        }
        applicationMedia={applicationMedia}
        communities={communities}
        branding={branding}
        health={health}
        members={members}
        migrationReady={
          !communityResult.error &&
          !brandingResult.error &&
          memberResults.every((result) => !result.error) &&
          healthResults.every((result) => !result.error)
        }
      />
    </main>
  );
}
