import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { memberErrorMessage } from "@/lib/member-error";
import {
  CommunityFeed,
  type CommunityFeedCursor,
  type CommunityComment,
  type CommunityPost,
  type CommunityPostAttachment,
  type CommunityPostEditState,
  type CommunityPostReadState,
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
import {
  CommunityCircles,
  type CommunityCircleProgram,
} from "@/components/member/community-circles";
import type { CommunityEventPreference } from "@/components/member/community-event-actions";
import {
  CommunityCheckIns,
  type CommunityCheckIn,
} from "@/components/member/community-check-ins";
import { CommunityLocalNavigation } from "@/components/member/community-local-navigation";
import {
  CommunityGatherings,
  type CommunityGatheringCard,
} from "@/components/member/community-gatherings";
export const dynamic = "force-dynamic";
export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ moment?: string; view?: string }>;
}) {
  const { slug } = await params;
  const requestedSearch = await searchParams;
  const requestedView = requestedSearch.view;
  const isEventFollowUp = requestedSearch.moment === "event-follow-up";
  const selectedView = ["overview", "today", "conversations", "gatherings", "people"].includes(
    requestedView ?? "",
  )
    ? (requestedView === "today" ? "overview" : requestedView as "overview" | "conversations" | "gatherings" | "people")
    : "overview";
  const view = isEventFollowUp ? "conversations" : selectedView;
  const showToday = view === "overview";
  const showConversations = view === "conversations";
  const showGatherings = view === "gatherings";
  const showPeople = view === "people";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const [{ data: profile }, { data: flag }, { data: acceptanceFlag }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("is_test_account")
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
    ]);
  const communityAvailable =
    flag?.enabled || (profile?.is_test_account && acceptanceFlag?.enabled);
  if (!communityAvailable) redirect("/communities");
  const communitiesResult = await supabase.rpc("list_communities");
  const community = (
    (communitiesResult.data as CommunitySummary[] | null) ?? []
  ).find((item) => item.slug === slug);
  if (!community) notFound();
  if (community.membership_status !== "active") redirect("/communities");
  const [
    postsResult,
    structuredPostsResult,
    paginatedPostsResult,
    commentResult,
    cohortResult,
    introductionResult,
    memberResult,
    gatheringResult,
    resourceResult,
    circleProgramResult,
    notificationPreferenceResult,
    startPathResult,
    brandingResult,
    mediaResult,
    editStateResult,
    readSummaryResult,
    readStateResult,
    eventPreferenceResult,
    checkInResult,
    gatheringCardResult,
  ] = await Promise.all([
      showConversations ? supabase.rpc("list_community_posts", {
        p_community_id: community.community_id,
        p_limit: 30,
        p_offset: 0,
      }) : Promise.resolve({ data: [], error: null }),
      showConversations ? supabase.rpc("list_community_conversations", {
        p_category: null,
        p_community_id: community.community_id,
        p_limit: 30,
        p_offset: 0,
      }) : Promise.resolve({ data: [], error: null }),
      showConversations ? supabase.rpc("list_community_conversation_page", {
        p_before_activity_at: null,
        p_before_pinned: null,
        p_before_post_id: null,
        p_community_id: community.community_id,
        p_limit: 21,
      }) : Promise.resolve({ data: [], error: null }),
      showConversations ? supabase.rpc("list_community_comments", {
        p_community_id: community.community_id,
        p_limit: 200,
      }) : Promise.resolve({ data: [], error: null }),
      supabase.rpc("get_community_cohort", {
        p_community_id: community.community_id,
      }),
      showPeople ? supabase.rpc("list_community_introductions", {
        p_community_id: community.community_id,
      }) : Promise.resolve({ data: [], error: null }),
      showPeople ? supabase.rpc("list_community_member_directory", {
        p_community_id: community.community_id,
        p_limit: 8,
        p_offset: 0,
      }) : Promise.resolve({ data: [], error: null }),
      showGatherings ? supabase.rpc("list_community_gatherings", {
        p_community_id: community.community_id,
      }) : Promise.resolve({ data: [], error: null }),
      showGatherings ? supabase.rpc("list_community_resources", {
        p_community_id: community.community_id,
      }) : Promise.resolve({ data: [], error: null }),
      showGatherings ? supabase.rpc("list_community_circle_programs", {
        p_community_id: community.community_id,
      }) : Promise.resolve({ data: [], error: null }),
      showToday ? supabase.rpc("get_community_notification_preferences", {
        p_community_id: community.community_id,
      }) : Promise.resolve({ data: [], error: null }),
      showToday ? supabase.rpc("get_my_community_start_path", {
        p_community_id: community.community_id,
      }) : Promise.resolve({ data: [], error: null }),
      supabase.rpc("list_community_brand_identities", {
        p_community_id: community.community_id,
      }),
      showConversations ? supabase.rpc("list_community_post_media", {
        p_community_id: community.community_id,
        p_limit: 100,
      }) : Promise.resolve({ data: [], error: null }),
      showConversations ? supabase.rpc("list_community_post_edit_states", {
        p_community_id: community.community_id,
        p_limit: 100,
      }) : Promise.resolve({ data: [], error: null }),
      showConversations || showToday ? supabase.rpc("get_community_read_summary", {
        p_community_id: community.community_id,
      }) : Promise.resolve({ data: [], error: null }),
      showConversations ? supabase.rpc("list_community_post_read_states", {
        p_community_id: community.community_id,
        p_limit: 100,
      }) : Promise.resolve({ data: [], error: null }),
      showGatherings ? supabase.rpc("list_my_community_event_preferences", {
        p_community_id: community.community_id,
      }) : Promise.resolve({ data: [], error: null }),
      showToday ? supabase.rpc("list_community_check_ins", {
        p_community_id: community.community_id,
        p_limit: 8,
      }) : Promise.resolve({ data: [], error: null }),
      supabase.rpc("list_community_gathering_cards", {
        p_community_id: community.community_id,
      }),
    ]);
  const paginatedPosts =
    (paginatedPostsResult.data as CommunityPost[] | null) ?? [];
  const paginationReady = !paginatedPostsResult.error;
  const visiblePaginatedPosts = paginationReady
    ? paginatedPosts.slice(0, 20)
    : [];
  const initialHasMore = paginationReady && paginatedPosts.length > 20;
  const lastPaginatedPost =
    visiblePaginatedPosts[visiblePaginatedPosts.length - 1];
  const initialCursor: CommunityFeedCursor | null = lastPaginatedPost
    ? {
        activityAt:
          lastPaginatedPost.cursor_activity_at ?? lastPaginatedPost.created_at,
        pinned: Boolean(lastPaginatedPost.is_pinned),
        postId: lastPaginatedPost.post_id,
      }
    : null;
  const paginatedPostIds = visiblePaginatedPosts.map((post) => post.post_id);
  const [pageCommentsResult, pageMediaResult] =
    paginationReady && paginatedPostIds.length
      ? await Promise.all([
          supabase.rpc("list_community_comments_for_posts", {
            p_community_id: community.community_id,
            p_limit: 500,
            p_post_ids: paginatedPostIds,
          }),
          supabase.rpc("list_community_post_media_for_posts", {
            p_community_id: community.community_id,
            p_post_ids: paginatedPostIds,
          }),
        ])
      : [{ data: null, error: null }, { data: null, error: null }];
  const paginationOperational =
    paginationReady && !pageCommentsResult.error && !pageMediaResult.error;
  const structuredConversationsReady =
    paginationOperational ||
    (!structuredPostsResult.error && !commentResult.error);
  const programmingReady = !gatheringResult.error && !resourceResult.error;
  const circlePrograms =
    (circleProgramResult.data as CommunityCircleProgram[] | null) ?? [];
  const canManage = ["owner", "moderator"].includes(
    community.membership_role ?? "",
  );
  const gatheringCards = gatheringCardResult.error
    ? []
    : ((gatheringCardResult.data as CommunityGatheringCard[] | null) ?? []);
  const nextGathering = gatheringCards.find(
    (item) => new Date(item.ends_at).getTime() >= Date.now(),
  );
  const checkIns =
    (checkInResult.data as CommunityCheckIn[] | null) ?? [];
  const liveGathering = gatheringCards.find((item) => {
    const now = Date.now();
    return item.chat_phase === "open"
      && now >= new Date(item.starts_at).getTime() - 30 * 60 * 1000
      && now <= new Date(item.ends_at).getTime();
  });
  const cohort = ((cohortResult.data as CohortRoom[] | null) ?? [])[0];
  const brandIdentity =
    ((brandingResult.data as CommunityBrandIdentity[] | null) ?? [])[0] ?? null;
  const attachments = paginationOperational
    ? ((pageMediaResult.data as CommunityPostAttachment[] | null) ?? [])
    : ((mediaResult.data as CommunityPostAttachment[] | null) ?? []);
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
  const editStateByPost = new Map(
    ((editStateResult.data as CommunityPostEditState[] | null) ?? []).map(
      (state) => [state.post_id, state],
    ),
  );
  const readStateByPost = new Map(
    ((readStateResult.data as CommunityPostReadState[] | null) ?? []).map(
      (state) => [state.post_id, state],
    ),
  );
  const readSummary = (
    (readSummaryResult.data as { new_activity_count: number }[] | null) ?? []
  )[0];
  const sourcePosts = paginationOperational
    ? visiblePaginatedPosts
    : structuredConversationsReady
      ? ((structuredPostsResult.data as CommunityPost[] | null) ?? [])
      : ((postsResult.data as CommunityPost[] | null) ?? []);
  const posts = sourcePosts.map((post) => ({
    ...post,
    attachment: attachmentByPost.get(post.post_id) ?? null,
    ...editStateByPost.get(post.post_id),
    ...readStateByPost.get(post.post_id),
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
            ) : (
              <span className="community-room-icon is-placeholder" aria-hidden="true">
                {community.name.slice(0, 1)}
              </span>
            )}
            <div>
              <p className="eyebrow">
                {community.community_type === "private"
                  ? "Private community"
                  : "Her Africa Table community"}
              </p>
              <h1>{community.name}</h1>
            </div>
          </div>
          {brandIdentity?.tagline ? (
            <strong className="community-room-tagline">
              {brandIdentity.tagline}
            </strong>
          ) : null}
          <p>{community.description}</p>
          <div className="community-room-meta">
            <span>{community.member_count} members</span>
            <Link href={`/communities/${slug}/about`}>About</Link>
            <Link href="/communities">All Communities</Link>
          </div>
        </div>
      </section>
      <CommunityLocalNavigation active={view} canManage={canManage} slug={slug} />
      {liveGathering ? (
        <aside className="community-live-notice" aria-label="Gathering live now">
          <span aria-hidden="true" />
          <div><small>Live now</small><strong>{liveGathering.title}</strong></div>
          <Link href={`/communities/${slug}/gatherings/${liveGathering.event_slug}`}>Join the room →</Link>
        </aside>
      ) : null}
      {showToday ? (
        <>
          <CommunityStartPath
            cohortActive={cohort?.cohort_status === "active"}
            communitySlug={slug}
            state={
              startPathResult.error
                ? null
                : (
                    (startPathResult.data as CommunityStartPathState[] | null) ?? []
                  )[0] ?? null
            }
          />
          <nav className="community-overview-links" aria-label="Inside this Community">
            <Link href={`/communities/${slug}?view=conversations`}>
              <span aria-hidden="true">01</span>
              <div><strong>Conversations</strong><small>{Number(readSummary?.new_activity_count ?? 0) > 0 ? `${readSummary?.new_activity_count} new updates` : "Questions, ideas and useful updates"}</small></div>
              <i aria-hidden="true">→</i>
            </Link>
            <Link href={`/communities/${slug}?view=gatherings`}>
              <span aria-hidden="true">02</span>
              <div><strong>Gatherings</strong><small>{nextGathering ? `${nextGathering.title} · ${new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" }).format(new Date(nextGathering.starts_at))}` : "See what is coming up"}</small></div>
              <i aria-hidden="true">→</i>
            </Link>
            <Link href={`/communities/${slug}?view=people`}>
              <span aria-hidden="true">03</span>
              <div><strong>People</strong><small>Meet {community.member_count} members thoughtfully</small></div>
              <i aria-hidden="true">→</i>
            </Link>
          </nav>
          {!checkInResult.error ? (
            checkIns.length ? (
              <CommunityCheckIns checkIns={checkIns} communityId={community.community_id} currentUserId={user.id} />
            ) : (
              <details className="community-room-more">
                <summary><span>Quick check-in</span><strong>Ask members one clear question</strong></summary>
                <CommunityCheckIns checkIns={checkIns} communityId={community.community_id} currentUserId={user.id} />
              </details>
            )
          ) : null}
        </>
      ) : null}
      {showConversations && postsResult.error && !structuredConversationsReady ? (
        <section className="admin-empty opportunity-error" role="alert">
          <strong>Community posts are not loading</strong>
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
      ) : showConversations ? (
        <CommunityFeed
          canManage={canManage}
          composerInitiallyOpen={isEventFollowUp}
          enhanced={structuredConversationsReady}
          communityId={community.community_id}
          currentUserId={user.id}
          initialComments={
            paginationOperational
              ? ((pageCommentsResult.data as CommunityComment[] | null) ?? [])
              : structuredConversationsReady
              ? ((commentResult.data as CommunityComment[] | null) ?? [])
              : []
          }
          initialComposerType={isEventFollowUp ? "event_follow_up" : "discussion"}
          initialCursor={paginationOperational ? initialCursor : null}
          initialHasMore={paginationOperational && initialHasMore}
          initialNewActivityCount={Number(
            readSummary?.new_activity_count ?? 0,
          )}
          initialPosts={
            posts
          }
          mediaReady={
            paginationOperational ? !pageMediaResult.error : !mediaResult.error
          }
          paginationReady={paginationOperational}
          readStateReady={!readSummaryResult.error && !readStateResult.error}
          prompt={
            isEventFollowUp
              ? "What would you like to carry forward from the event?"
              : cohort
              ? "Share a question, an offer of help or an event follow-up"
              : undefined
          }
          readOnly={cohort?.cohort_status === "read_only"}
        />
      ) : null}
      {showPeople ? (
        <>
          <section className="community-people-intro" id="people">
            <p className="eyebrow">People</p>
            <h2>Find the right person to meet.</h2>
            <p>
              Learn who is here and what they care about. Private messages open
              only after both people agree to connect.
            </p>
          </section>
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
        </>
      ) : null}
      {showGatherings ? (
        <>
          <CommunityGatherings
            cards={gatheringCards}
            migrationReady={!gatheringCardResult.error}
            slug={slug}
          />
          {programmingReady || !circleProgramResult.error ? (
            <details className="community-room-more community-gathering-extras">
              <summary><span>More from this Community</span><strong>Resources and small groups</strong></summary>
              {programmingReady ? (
                <CommunityProgramming
                  canManage={canManage}
                  communityId={community.community_id}
                  eventPreferences={(eventPreferenceResult.data as CommunityEventPreference[] | null) ?? []}
                  gatherings={(gatheringResult.data as CommunityGathering[] | null) ?? []}
                  remindersReady={!eventPreferenceResult.error}
                  resources={(resourceResult.data as CommunityResource[] | null) ?? []}
                  showGatherings={Boolean(gatheringCardResult.error)}
                  slug={slug}
                />
              ) : null}
              {!circleProgramResult.error ? <CommunityCircles programs={circlePrograms} /> : null}
            </details>
          ) : null}
        </>
      ) : null}
      {showToday && !notificationPreferenceResult.error ? (
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
