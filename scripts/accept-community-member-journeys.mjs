import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const communitySlug =
  process.env.HAT_COMMUNITY_TEST_SLUG ?? "nairobi-founding-table";

if (!url || !publishable || !password || password.length < 12) {
  throw new Error(
    "Supabase public credentials and a 12+ character HAT_COMMUNITY_TEST_PASSWORD are required.",
  );
}

const identities = {
  host: "community.host@hat-test.invalid",
  memberOne: "community.member.one@hat-test.invalid",
  memberTwo: "community.member.two@hat-test.invalid",
  moderator: "community.moderator@hat-test.invalid",
};

async function signedInClient(email) {
  const client = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`${email}: test sign-in failed`);
  return client;
}

async function requireCommunity(client, email) {
  const result = await client.rpc("list_communities");
  if (result.error) throw new Error(`${email}: Community list failed`);
  const community = (result.data ?? []).find(
    (candidate) => candidate.slug === communitySlug,
  );
  if (!community || community.membership_status !== "active") {
    throw new Error(`${email}: active rehearsal Community is required`);
  }
  return community;
}

async function conversationPage(client, communityId) {
  const result = await client.rpc("list_community_conversation_page", {
    p_before_activity_at: null,
    p_before_pinned: null,
    p_before_post_id: null,
    p_community_id: communityId,
    p_limit: 21,
  });
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function ensurePost(client, communityId, category, body) {
  const existing = (await conversationPage(client, communityId)).find(
    (post) => post.body === body,
  );
  if (existing) return { created: false, postId: existing.post_id };
  const creation = await client.rpc("create_structured_community_post", {
    p_body: body,
    p_category: category,
    p_community_id: communityId,
  });
  if (creation.error || typeof creation.data !== "string") {
    throw creation.error ?? new Error("Community conversation was not created");
  }
  return { created: true, postId: creation.data };
}

const clients = Object.fromEntries(
  await Promise.all(
    Object.entries(identities).map(async ([role, email]) => [
      role,
      await signedInClient(email),
    ]),
  ),
);

try {
  const communities = Object.fromEntries(
    await Promise.all(
      Object.entries(clients).map(async ([role, client]) => [
        role,
        await requireCommunity(client, identities[role]),
      ]),
    ),
  );
  const communityId = communities.memberOne.community_id;
  if (
    !Object.values(communities).every(
      (community) => community.community_id === communityId,
    )
  ) {
    throw new Error("Test identities do not share the same Community");
  }

  const memberPost = await ensurePost(
    clients.memberOne,
    communityId,
    "ask",
    "What would make the Nairobi Founding Table most useful in its first month?",
  );
  const hostPost = await ensurePost(
    clients.host,
    communityId,
    "announcement",
    "Welcome to the Nairobi Founding Table rehearsal. Please share one practical ask or offer.",
  );
  const memberOffer = await ensurePost(
    clients.memberTwo,
    communityId,
    "offer",
    "I can offer a practical introduction to Nairobi founders working on inclusive finance.",
  );
  const moderatorDiscussion = await ensurePost(
    clients.moderator,
    communityId,
    "discussion",
    "Which one theme should guide our first member roundtable?",
  );

  const memberAnnouncement = await clients.memberOne.rpc(
    "create_structured_community_post",
    {
      p_body: "This member-only permission check must not be published.",
      p_category: "announcement",
      p_community_id: communityId,
    },
  );
  if (!memberAnnouncement.error) {
    throw new Error("Ordinary member unexpectedly created an announcement");
  }

  const memberPin = await clients.memberOne.rpc("set_community_post_pinned", {
    p_pinned: true,
    p_post_id: hostPost.postId,
  });
  if (!memberPin.error) {
    throw new Error("Ordinary member unexpectedly pinned a conversation");
  }

  const moderationPin = await clients.moderator.rpc(
    "set_community_post_pinned",
    { p_pinned: true, p_post_id: hostPost.postId },
  );
  if (moderationPin.error) throw moderationPin.error;

  const beforeReply = await conversationPage(clients.memberTwo, communityId);
  const targetBeforeReply = beforeReply.find(
    (post) => post.post_id === memberPost.postId,
  );
  let replyCreated = false;
  if (!Number(targetBeforeReply?.comment_count ?? 0)) {
    const reply = await clients.memberTwo.rpc("create_community_comment", {
      p_body:
        "A short monthly member roundtable with one clear ask from each participant.",
      p_post_id: memberPost.postId,
    });
    if (reply.error) throw reply.error;
    replyCreated = true;
  }

  for (const operation of [
    "set_community_post_appreciation",
    "set_community_post_followed",
    "set_community_post_saved",
  ]) {
    const result = await clients.memberTwo.rpc(operation, {
      p_active: true,
      p_post_id: memberPost.postId,
    });
    if (result.error) throw result.error;
  }

  const roster = await clients.memberOne.rpc(
    "list_community_member_directory",
    { p_community_id: communityId, p_limit: 20, p_offset: 0 },
  );
  if (roster.error || (roster.data?.length ?? 0) < 4) {
    throw roster.error ?? new Error("Community roster is incomplete");
  }

  const after = await conversationPage(clients.memberTwo, communityId);
  const verifiedPost = after.find((post) => post.post_id === memberPost.postId);
  if (
    !verifiedPost ||
    !verifiedPost.appreciated_by_me ||
    !verifiedPost.followed_by_me ||
    !verifiedPost.saved_by_me ||
    Number(verifiedPost.comment_count ?? 0) < 1
  ) {
    throw new Error("Member conversation interactions were not persisted");
  }

  const memberOneIdentity = await clients.memberOne.auth.getUser();
  if (memberOneIdentity.error || !memberOneIdentity.data.user) {
    throw memberOneIdentity.error ?? new Error("Test member identity is missing");
  }
  const blockedMemberId = memberOneIdentity.data.user.id;
  const blocked = await clients.memberTwo.rpc("block_member", {
    p_member_id: blockedMemberId,
    p_reason: "Community acceptance visibility check",
  });
  if (blocked.error) throw blocked.error;
  try {
    const blockedPage = await conversationPage(clients.memberTwo, communityId);
    if (blockedPage.some((post) => post.post_id === memberPost.postId)) {
      throw new Error("Blocked member conversation remained visible");
    }
    const blockedRoster = await clients.memberTwo.rpc(
      "list_community_member_directory",
      { p_community_id: communityId, p_limit: 20, p_offset: 0 },
    );
    if (
      blockedRoster.error ||
      blockedRoster.data?.some((member) => member.user_id === blockedMemberId)
    ) {
      throw blockedRoster.error ?? new Error("Blocked member remained in roster");
    }
  } finally {
    const unblocked = await clients.memberTwo.rpc("unblock_member", {
      p_member_id: blockedMemberId,
    });
    if (unblocked.error) throw unblocked.error;
  }
  const restoredPage = await conversationPage(clients.memberTwo, communityId);
  if (!restoredPage.some((post) => post.post_id === memberPost.postId)) {
    throw new Error("Conversation visibility was not restored after unblock");
  }

  const anonymous = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonymousRead = await anonymous.rpc(
    "list_community_conversation_page",
    {
      p_before_activity_at: null,
      p_before_pinned: null,
      p_before_post_id: null,
      p_community_id: communityId,
      p_limit: 21,
    },
  );
  if (!anonymousRead.error) {
    throw new Error("Anonymous visitor unexpectedly read private conversations");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        communitySlug,
        passwordPrinted: false,
        checks: {
          activeCohort: Object.values(communities).length,
          anonymousBoundary: "passed",
          hostAnnouncement: hostPost.created ? "created" : "reused",
          memberAsk: memberPost.created ? "created" : "reused",
          memberOffer: memberOffer.created ? "created" : "reused",
          memberInteractions: "passed",
          memberRoleBoundary: "passed",
          moderatorDiscussion: moderatorDiscussion.created
            ? "created"
            : "reused",
          moderatorPin: "passed",
          mutualBlockVisibility: "passed and restored",
          reply: replyCreated ? "created" : "reused",
          rosterMembers: roster.data.length,
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.all(Object.values(clients).map((client) => client.auth.signOut()));
}
