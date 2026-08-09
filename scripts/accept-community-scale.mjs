import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const adminEmail = process.env.HAT_ADMIN_TEST_EMAIL;
const adminPassword = process.env.HAT_ADMIN_TEST_PASSWORD;
const communitySlug =
  process.env.HAT_COMMUNITY_TEST_SLUG ?? "nairobi-founding-table";
const maySeed = process.env.HAT_COMMUNITY_SCALE_WRITE === "1";

if (
  !url ||
  !publishable ||
  !password ||
  password.length < 12 ||
  !adminEmail ||
  !adminPassword ||
  adminPassword.length < 8
) {
  throw new Error(
    "Supabase public credentials, HAT_COMMUNITY_TEST_PASSWORD, HAT_ADMIN_TEST_EMAIL and HAT_ADMIN_TEST_PASSWORD are required.",
  );
}

const identities = [
  { email: "community.member.one@hat-test.invalid", role: "member-one" },
  { email: "community.member.two@hat-test.invalid", role: "member-two" },
  { email: "community.host@hat-test.invalid", role: "host" },
  { email: "community.moderator@hat-test.invalid", role: "moderator" },
];

async function signIn(identity, credential = password) {
  const client = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({
    email: identity.email,
    password: credential,
  });
  if (result.error || !result.data.user) {
    throw new Error(`${identity.role}: test sign-in failed`);
  }
  return { ...identity, client, userId: result.data.user.id };
}

async function requireCommunity(identity) {
  const result = await identity.client.rpc("list_communities");
  if (result.error) throw new Error(`${identity.role}: Community list failed`);
  const community = (result.data ?? []).find(
    (candidate) => candidate.slug === communitySlug,
  );
  if (!community || community.membership_status !== "active") {
    throw new Error(`${identity.role}: active rehearsal Community is required`);
  }
  return community;
}

async function page(client, communityId, cursor = null) {
  const result = await client.rpc("list_community_conversation_page", {
    p_before_activity_at: cursor?.activityAt ?? null,
    p_before_pinned: cursor?.pinned ?? null,
    p_before_post_id: cursor?.postId ?? null,
    p_community_id: communityId,
    p_limit: 21,
  });
  if (result.error) throw result.error;
  return result.data ?? [];
}

async function allPages(client, communityId) {
  const posts = [];
  const seen = new Set();
  let cursor = null;
  let pageCount = 0;
  for (;;) {
    const result = await page(client, communityId, cursor);
    pageCount += 1;
    const visible = result.slice(0, 20);
    for (const post of visible) {
      if (seen.has(post.post_id)) {
        throw new Error(`Pagination repeated conversation ${post.post_id}`);
      }
      seen.add(post.post_id);
      posts.push(post);
    }
    if (result.length <= 20) break;
    const last = visible.at(-1);
    cursor = {
      activityAt: last.cursor_activity_at ?? last.created_at,
      pinned: Boolean(last.is_pinned),
      postId: last.post_id,
    };
    if (pageCount >= 10) {
      throw new Error("Pagination rehearsal exceeded ten pages");
    }
  }
  return { pageCount, posts };
}

async function seedToFortyFive(signedIn, communityId, existingCount) {
  if (existingCount >= 45) return 0;
  if (!maySeed) {
    throw new Error(
      `Only ${existingCount} conversations are available. Run again with HAT_COMMUNITY_SCALE_WRITE=1 to add tagged rehearsal conversations.`,
    );
  }
  const needed = 45 - existingCount;
  if (needed > identities.length * 9) {
    throw new Error(
      `The rehearsal needs ${needed} new conversations, above the safe per-run limit. Run the normal member journey first, then retry.`,
    );
  }
  const run = new Date().toISOString().replace(/[:.]/g, "-");
  let created = 0;
  for (let index = 0; index < needed; index += 1) {
    const identity = signedIn[index % signedIn.length];
    const result = await identity.client.rpc(
      "create_structured_community_post",
      {
        p_body: `Community scale rehearsal ${run} · ${identity.role} · ${index + 1}. This tagged conversation verifies stable loading across a busy room.`,
        p_category: index % 3 === 0 ? "ask" : index % 3 === 1 ? "offer" : "discussion",
        p_community_id: communityId,
      },
    );
    if (result.error) {
      throw new Error(`${identity.role}: scale conversation ${index + 1} failed`);
    }
    created += 1;
  }
  return created;
}

const signedIn = await Promise.all(identities.map(signIn));
const adminIdentity = await signIn(
  { email: adminEmail, role: "super-admin" },
  adminPassword,
);

try {
  const communities = await Promise.all(signedIn.map(requireCommunity));
  const communityId = communities[0].community_id;
  if (!communities.every((community) => community.community_id === communityId)) {
    throw new Error("Test identities do not share the same Community");
  }
  const roleCoverage = Object.fromEntries(
    signedIn.map((identity, index) => [
      identity.role,
      communities[index].membership_role,
    ]),
  );
  if (
    roleCoverage["member-one"] !== "member" ||
    roleCoverage["member-two"] !== "member" ||
    !["owner", "host"].includes(roleCoverage.host) ||
    roleCoverage.moderator !== "moderator"
  ) {
    throw new Error("The two-member, host and moderator role coverage is incomplete");
  }

  const before = await allPages(signedIn[0].client, communityId);
  const created = await seedToFortyFive(
    signedIn,
    communityId,
    before.posts.length,
  );
  const after = created
    ? await allPages(signedIn[0].client, communityId)
    : before;
  if (after.posts.length < 45 || after.pageCount < 3) {
    throw new Error("The Community did not return at least 45 conversations across three pages");
  }
  const firstUnpinned = after.posts.findIndex((post) => !post.is_pinned);
  if (
    firstUnpinned >= 0 &&
    after.posts.slice(firstUnpinned).some((post) => post.is_pinned)
  ) {
    throw new Error("A pinned conversation appeared after an unpinned conversation");
  }
  const pinnedCount = after.posts.filter((post) => post.is_pinned).length;
  if (pinnedCount > 3) {
    throw new Error("The three-pin Community limit was exceeded");
  }

  const adminRole = await adminIdentity.client
    .from("user_roles")
    .select("role")
    .eq("user_id", adminIdentity.userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (adminRole.error || !adminRole.data) {
    throw new Error("The fifth acceptance identity is not a Super Admin");
  }
  const adminSafety = await adminIdentity.client.rpc(
    "list_community_safety_reports",
  );
  if (adminSafety.error) {
    throw new Error("Super Admin could not open the Community safety queue");
  }

  const anonymous = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonymousRead = await page(anonymous, communityId).catch(
    () => "blocked",
  );
  if (anonymousRead !== "blocked") {
    throw new Error("Anonymous visitors unexpectedly read Community conversations");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        communitySlug,
        passwordPrinted: false,
        checks: {
          anonymousBoundary: "passed",
          conversations: after.posts.length,
          conversationsCreated: created,
          pages: after.pageCount,
          pinnedCount,
          roleCoverage,
          stableCursorPagination: "passed",
          superAdminSafetyAccess: "passed",
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.all([
    ...signedIn.map((identity) => identity.client.auth.signOut()),
    adminIdentity.client.auth.signOut(),
  ]);
}
