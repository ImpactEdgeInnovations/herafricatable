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

async function signIn(email) {
  const client = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) throw new Error(`${email}: test sign-in failed`);
  return client;
}

async function communityFor(client) {
  const result = await client.rpc("list_communities");
  if (result.error) throw result.error;
  const community = (result.data ?? []).find(
    (candidate) => candidate.slug === communitySlug,
  );
  if (!community) throw new Error("Rehearsal Community not found");
  return community;
}

const reporter = await signIn("community.member.one@hat-test.invalid");
const host = await signIn("community.host@hat-test.invalid");
const communityModerator = await signIn(
  "community.moderator@hat-test.invalid",
);

try {
  const community = await communityFor(reporter);
  const page = await reporter.rpc("list_community_conversation_page", {
    p_before_activity_at: null,
    p_before_pinned: null,
    p_before_post_id: null,
    p_community_id: community.community_id,
    p_limit: 21,
  });
  if (page.error) throw page.error;
  const target = (page.data ?? []).find(
    (post) =>
      post.body ===
      "I can offer a practical introduction to Nairobi founders working on inclusive finance.",
  );
  if (!target) throw new Error("Safety rehearsal conversation not found");

  const report = await reporter.rpc("report_community_post", {
    p_category: "other",
    p_details:
      "Controlled acceptance rehearsal only. Verify evidence access, host count and audited dismissal.",
    p_post_id: target.post_id,
  });
  if (report.error || typeof report.data !== "string") {
    throw report.error ?? new Error("Safety rehearsal report was not created");
  }

  const hostHealth = await host.rpc("get_community_host_health", {
    p_community_id: community.community_id,
  });
  if (
    hostHealth.error ||
    Number(hostHealth.data?.[0]?.open_reports ?? 0) < 1
  ) {
    throw hostHealth.error ?? new Error("Host safety count did not increase");
  }

  const hostEvidenceAttempt = await host.rpc("list_community_safety_reports");
  if (!hostEvidenceAttempt.error) {
    throw new Error("Community host unexpectedly accessed safety evidence");
  }
  const communityModeratorEvidenceAttempt = await communityModerator.rpc(
    "list_community_safety_reports",
  );
  if (!communityModeratorEvidenceAttempt.error) {
    throw new Error(
      "Community moderator unexpectedly accessed platform safety evidence",
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        communitySlug,
        passwordPrinted: false,
        reportId: report.data,
        checks: {
          communityModeratorEvidenceBoundary: "passed",
          hostEvidenceBoundary: "passed",
          hostOpenReportCount: Number(hostHealth.data[0].open_reports),
          reportCreated: "passed",
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.all([
    reporter.auth.signOut(),
    host.auth.signOut(),
    communityModerator.auth.signOut(),
  ]);
}
