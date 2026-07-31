import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { memberErrorMessage } from "@/lib/member-error";
import {
  CommunityFeed,
  type CommunityComment,
  type CommunityPost,
  type CommunityPostAttachment,
} from "@/components/member/community-feed";
import {
  CohortActivation,
  type CohortIntroduction,
  type CohortRoom,
} from "@/components/member/cohort-activation";
import type { CommunitySummary } from "@/components/member/community-directory";
import { MemberHeader } from "@/components/member/member-header";
import {
  CommunityMemberRoster,
  type CommunityRosterMember,
} from "@/components/member/community-member-roster";
import {
  CommunityProgramming,
  type CommunityGathering,
  type CommunityResource,
} from "@/components/member/community-programming";
import {
  CommunityNotificationPreferences,
  type CommunityNotificationPreference,
} from "@/components/member/community-notification-preferences";
import {
  CommunityStartPath,
  type CommunityStartPathState,
} from "@/components/member/community-start-path";
import type { CommunityBrandIdentity } from "@/components/member/community-branding-panel";
export const dynamic = "force-dynamic";
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: flag } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", "communities")
    .maybeSingle();
  if (!flag?.enabled) redirect("/communities");
  const communitiesResult = await supabase.rpc("list_communities");
  const community = (
    (communitiesResult.data as CommunitySummary[] | null) ?? []
  ).find((item) => item.slug === slug);
  if (!community) notFound();
  if (community.membership_status !== "active") redirect("/communities");
  const [
    postsResult,
    structuredPostsResult,
    commentResult,
    cohortResult,
    introductionResult,
    memberResult,
    gatheringResult,
    resourceResult,
    notificationPreferenceResult,
    startPathResult,
    brandingResult,
    mediaResult,
  ] = await Promise.all([
      supabase.rpc("list_community_posts", {
        p_community_id: community.community_id,
        p_limit: 30,
        p_offset: 0,
      }),
      supabase.rpc("list_community_conversations", {
        p_category: null,
        p_community_id: community.community_id,
        p_limit: 30,
        p_offset: 0,
      }),
      supabase.rpc("list_community_comments", {
        p_community_id: community.community_id,
        p_limit: 200,
      }),
      supabase.rpc("get_community_cohort", {
        p_community_id: community.community_id,
      }),
      supabase.rpc("list_community_introductions", {
        p_community_id: community.community_id,
      }),
      supabase.rpc("list_community_member_directory", {
        p_community_id: community.community_id,
        p_limit: 8,
        p_offset: 0,
      }),
      supabase.rpc("list_community_gatherings", {
        p_community_id: community.community_id,
      }),
      supabase.rpc("list_community_resources", {
        p_community_id: community.community_id,
      }),
      supabase.rpc("get_community_notification_preferences", {
        p_community_id: community.community_id,
      }),
      supabase.rpc("get_my_community_start_path", {
        p_community_id: community.community_id,
      }),
      supabase.rpc("list_community_brand_identities", {
        p_community_id: community.community_id,
      }),
      supabase.rpc("list_community_post_media", {
        p_community_id: community.community_id,
        p_limit: 100,
      }),
    ]);
  const structuredConversationsReady =
    !structuredPostsResult.error && !commentResult.error;
  const programmingReady = !gatheringResult.error && !resourceResult.error;
  const canManage = ["owner", "moderator"].includes(
    community.membership_role ?? "",
  );
  const cohort = ((cohortResult.data as CohortRoom[] | null) ?? [])[0];
  const brandIdentity =
    ((brandingResult.data as CommunityBrandIdentity[] | null) ?? [])[0] ?? null;
  const attachments =
    (mediaResult.data as CommunityPostAttachment[] | null) ?? [];
  const [iconSigned, coverSigned, signedAttachments] = await Promise.all([
    brandIdentity?.icon_storage_path
      ? supabase.storage
          .from("community-media")
          .createSignedUrl(brandIdentity.icon_storage_path, 3600)
      : Promise.resolve({ data: null }),
    brandIdentity?.cover_storage_path
      ? supabase.storage
          .from("community-media")
          .createSignedUrl(brandIdentity.cover_storage_path, 3600)
      : Promise.resolve({ data: null }),
    Promise.all(
      attachments.map(async (attachment) => {
        if (!attachment.storage_path) return attachment;
        const signed = await supabase.storage
          .from("community-media")
          .createSignedUrl(attachment.storage_path, 3600);
        return {
          ...attachment,
          signed_url: signed.data?.signedUrl ?? null,
        };
      }),
    ),
  ]);
  const attachmentByPost = new Map(
    signedAttachments.map((attachment) => [attachment.post_id, attachment]),
  );
  const sourcePosts = structuredConversationsReady
    ? ((structuredPostsResult.data as CommunityPost[] | null) ?? [])
    : ((postsResult.data as CommunityPost[] | null) ?? []);
  const posts = sourcePosts.map((post) => ({
    ...post,
    attachment: attachmentByPost.get(post.post_id) ?? null,
  }));
  return (
    <main className="community-page">
      <MemberHeader active="community" label={community.name} />
      <section
        className={`community-room-hero accent-${brandIdentity?.accent_key ?? "wine"}${coverSigned.data?.signedUrl ? " has-cover" : ""}`}
        id="overview"
      >
        {coverSigned.data?.signedUrl ? (
          <figure className="community-room-cover">
            <img
              alt={brandIdentity?.cover_alt_text ?? ""}
              height={brandIdentity?.cover_height ?? undefined}
              src={coverSigned.data.signedUrl}
              width={brandIdentity?.cover_width ?? undefined}
            />
          </figure>
        ) : null}
        <div className="community-room-hero-copy">
          <div className="community-room-title">
            {iconSigned.data?.signedUrl ? (
              <img
                alt={brandIdentity?.icon_alt_text ?? ""}
                className="community-room-icon"
                height={brandIdentity?.icon_height ?? undefined}
                src={iconSigned.data.signedUrl}
                width={brandIdentity?.icon_width ?? undefined}
              />
            ) : null}
            <div>
              <p className="eyebrow">{community.community_type} community</p>
              <h1>{community.name}</h1>
            </div>
          </div>
          {brandIdentity?.tagline ? (
            <strong className="community-room-tagline">
              {brandIdentity.tagline}
            </strong>
          ) : null}
          <p>{community.description}</p>
          <Link href="/communities">← All communities</Link>
        </div>
        <span>{community.member_count} members</span>
      </section>
      <nav className="community-room-navigation" aria-label="Community areas">
        <a aria-current="page" href="#overview">
          Overview
        </a>
        <a href="#conversations">Conversations</a>
        <a href="#members">Members</a>
        {programmingReady ? (
          <>
            <a href="#gatherings">Gatherings</a>
            <a href="#resources">Resources</a>
          </>
        ) : (
          <>
            <Link href="/events">Gatherings</Link>
            <Link href="/learning">Resources</Link>
          </>
        )}
        {canManage ? <Link href={`/communities/${slug}/host`}>Host</Link> : null}
      </nav>
      <CommunityStartPath
        cohortActive={cohort?.cohort_status === "active"}
        state={
          startPathResult.error
            ? null
            : (
                (startPathResult.data as CommunityStartPathState[] | null) ?? []
              )[0] ?? null
        }
      />
      {postsResult.error && !structuredConversationsReady ? (
        <section className="admin-empty opportunity-error" role="alert">
          <strong>Community feed unavailable</strong>
          <p>{memberErrorMessage(postsResult.error, "load this community")}</p>
          <div className="journey-state-actions">
            <Link
              className="button button-primary"
              href={`/communities/${slug}`}
            >
              Try again
            </Link>
            <Link className="button button-outline" href="/support">
              Contact support
            </Link>
          </div>
        </section>
      ) : (
        <CommunityFeed
          canManage={canManage}
          enhanced={structuredConversationsReady}
          communityId={community.community_id}
          currentUserId={user.id}
          initialComments={
            structuredConversationsReady
              ? ((commentResult.data as CommunityComment[] | null) ?? [])
              : []
          }
          initialPosts={
            posts
          }
          mediaReady={!mediaResult.error}
          prompt={
            cohort
              ? "Continue the table with one focused Ask, Offer or follow-up"
              : undefined
          }
          readOnly={cohort?.cohort_status === "read_only"}
        />
      )}
      {programmingReady ? (
        <CommunityProgramming
          canManage={canManage}
          gatherings={
            (gatheringResult.data as CommunityGathering[] | null) ?? []
          }
          resources={(resourceResult.data as CommunityResource[] | null) ?? []}
          slug={slug}
        />
      ) : null}
      {cohort ? (
        <CohortActivation
          currentUserId={user.id}
          introductions={
            (introductionResult.data as CohortIntroduction[] | null) ?? []
          }
          room={cohort}
        />
      ) : null}
      {!memberResult.error ? (
        <CommunityMemberRoster
          members={
            (memberResult.data as CommunityRosterMember[] | null) ?? []
          }
        />
      ) : null}
      {!notificationPreferenceResult.error ? (
        <CommunityNotificationPreferences
          communityId={community.community_id}
          initialPreferences={
            (
              notificationPreferenceResult.data as
                | CommunityNotificationPreference[]
                | null
            )?.[0] ?? {
              email_replies: false,
              in_app_replies: true,
              weekly_briefing: true,
              weekly_briefing_email: false,
            }
          }
        />
      ) : null}
    </main>
  );
}
