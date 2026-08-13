import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const adminEmail = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const adminPassword = process.env.HAT_PRIMARY_ADMIN_PASSWORD;
const communitySlug =
  process.env.HAT_COMMUNITY_TEST_SLUG ?? "nairobi-founding-table";

if (
  !url ||
  !publishable ||
  !password ||
  password.length < 12 ||
  !adminEmail ||
  !adminPassword ||
  adminPassword.length < 12
) {
  throw new Error(
    "Supabase public credentials plus 12+ character Community and primary Admin test credentials are required.",
  );
}

async function signIn(email, accountPassword = password) {
  const client = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({
    email,
    password: accountPassword,
  });
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
const platformAdmin = await signIn(adminEmail, adminPassword);
let reportId = null;

async function dismissActiveReport(id, reason) {
  const result = await platformAdmin.rpc("review_community_safety_report", {
    p_action: "dismiss",
    p_content_type: "post",
    p_outcome: reason,
    p_report_id: id,
  });
  if (result.error) throw result.error;
}

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

  const priorQueue = await platformAdmin.rpc("list_community_safety_reports");
  if (priorQueue.error) throw priorQueue.error;
  const prior = (priorQueue.data ?? []).find(
    (item) =>
      item.content_type === "post" &&
      item.evidence_snapshot?.post_id === target.post_id &&
      ["open", "reviewing"].includes(item.status),
  );
  if (prior) {
    await dismissActiveReport(
      prior.report_id,
      "Closed stale tagged rehearsal report before a repeatable acceptance run.",
    );
  }

  const report = await reporter.rpc("report_community_post", {
    p_category: "other",
    p_details:
      "Controlled acceptance rehearsal only. Verify evidence access, host count and audited dismissal.",
    p_post_id: target.post_id,
  });
  if (report.error || typeof report.data !== "string") {
    throw report.error ?? new Error("Safety rehearsal report was not created");
  }
  reportId = report.data;

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

  const adminQueue = await platformAdmin.rpc("list_community_safety_reports");
  if (
    adminQueue.error ||
    !(adminQueue.data ?? []).some(
      (item) => item.report_id === reportId && item.status === "open",
    )
  ) {
    throw adminQueue.error ?? new Error("Admin safety queue did not receive the report");
  }
  await dismissActiveReport(
    reportId,
    "Controlled acceptance rehearsal completed; original content retained.",
  );
  const resolvedQueue = await platformAdmin.rpc("list_community_safety_reports");
  if (
    resolvedQueue.error ||
    !(resolvedQueue.data ?? []).some(
      (item) => item.report_id === reportId && item.status === "dismissed",
    )
  ) {
    throw resolvedQueue.error ?? new Error("Admin moderation outcome was not recorded");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        communitySlug,
        passwordPrinted: false,
        reportId,
        checks: {
          adminModerationOutcome: "passed and restored",
          adminQueueVisibility: "passed",
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
  if (reportId) {
    const queue = await platformAdmin.rpc("list_community_safety_reports");
    const active = (queue.data ?? []).find(
      (item) =>
        item.report_id === reportId && ["open", "reviewing"].includes(item.status),
    );
    if (active) {
      await dismissActiveReport(
        reportId,
        "Acceptance cleanup after an interrupted Community safety rehearsal.",
      );
    }
  }
  await Promise.all([
    reporter.auth.signOut(),
    host.auth.signOut(),
    communityModerator.auth.signOut(),
    platformAdmin.auth.signOut(),
  ]);
}
