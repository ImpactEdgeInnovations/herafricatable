import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const forbidden = [
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /sk_(?:live|test)_[A-Za-z0-9]{12,}/,
  /re_[A-Za-z0-9]{20,}/,
  /SUPABASE_SECRET_KEY[^\S\r\n]*=[^\S\r\n]*\S+/,
  /CRON_SECRET[^\S\r\n]*=[^\S\r\n]*\S+/,
];
for (const path of tracked) {
  if (path === "package-lock.json") continue;
  const content = read(path);
  for (const pattern of forbidden)
    assert(!pattern.test(content), `Potential committed secret in ${path}`);
}
const migrations = tracked
  .filter(
    (path) => path.startsWith("supabase/migrations/") && path.endsWith(".sql"),
  )
  .sort();
assert(migrations.length >= 18, "Expected the complete migration chain");
const names = migrations.map((path) => path.split("/").pop());
assert.equal(
  new Set(names.map((name) => name.slice(0, 14))).size,
  names.length,
  "Migration timestamps must be unique",
);
assert.deepEqual(
  names,
  [...names].sort(),
  "Migrations must sort chronologically",
);
for (const path of migrations.filter(
  (path) => path >= "supabase/migrations/20260723170000",
)) {
  const sql = read(path).trim().toLowerCase();
  assert(sql.startsWith("begin;"), `${path} must begin atomically`);
  assert(sql.endsWith("commit;"), `${path} must commit atomically`);
}
const cron = read("app/api/cron/notifications/route.ts");
const notificationWorker = read("lib/notifications/worker.ts");
assert(
  cron.includes("timingSafeEqual"),
  "Cron authorization must use constant-time comparison",
);
assert(cron.includes("CRON_SECRET"), "Cron route must require CRON_SECRET");
assert(
  notificationWorker.includes("reconcile_community_host_subscriptions") &&
    notificationWorker.includes("migrationPending"),
  "Cron must safely reconcile host subscription lifecycles",
);
assert(
  notificationWorker.includes("\\.invalid$") &&
    notificationWorker.includes("suppressed:test-address"),
  "Notification worker must suppress reserved test-account recipients",
);
const privacy = read("app/api/admin/privacy/delete/route.ts");
assert(
  privacy.includes('eq("role","super_admin")'),
  "Deletion endpoint must verify Super Admin",
);
assert(
  privacy.includes("execute_account_deletion"),
  "Deletion endpoint must use controlled database execution",
);
const webhook = read("app/api/payments/paystack/webhook/route.ts");
assert(
  webhook.indexOf("request.text()") < webhook.indexOf("JSON.parse"),
  "Paystack signature must verify the raw request body",
);
assert(
  webhook.includes("timingSafeEqual"),
  "Paystack signature check must be constant-time",
);
for (const contract of [
  "refund.processed",
  "refund.needs-attention",
  "charge.dispute.create",
  "charge.dispute.resolve",
  "process_community_financial_webhook",
  "p_signature_verified: true",
]) {
  assert(
    webhook.includes(contract),
    `Paystack webhook must reconcile ${contract}`,
  );
}
const paymentInitialize = read("app/api/payments/paystack/initialize/route.ts");
assert(
  paymentInitialize.includes("create_course_order"),
  "Course checkout must use the shared payment initializer",
);
assert(
  paymentInitialize.includes("create_community_order") &&
    paymentInitialize.includes("community_offer_id"),
  "Community checkout must use the shared server payment initializer",
);
assert(
  paymentInitialize.includes("create_community_host_plan_order") &&
    paymentInitialize.includes("community_host_plan_id"),
  "Host plan checkout must use the shared server payment initializer",
);
assert(
  paymentInitialize.includes("order_type"),
  "Payment metadata must identify fulfillment context",
);
const paymentCallback = read("app/api/payments/paystack/callback/route.ts");
assert(
  paymentCallback.includes("/learning/"),
  "Verified course checkout must return to Learning",
);
assert(
  paymentCallback.includes('order?.order_type==="community"') &&
    paymentCallback.includes("/communities/"),
  "Verified community checkout must return to its community",
);
assert(
  paymentCallback.includes('order?.order_type==="community_host_plan"') &&
    paymentCallback.includes("/host?payment="),
  "Verified host plan checkout must return to its Host workspace",
);
const learningMigration = read(
  "supabase/migrations/20260725130000_learning_foundation.sql",
);
assert(
  learningMigration.includes("order_item_exactly_one_product"),
  "Shared order lines must have exactly one product",
);
assert(
  learningMigration.includes("fulfill_course_order"),
  "Course purchases must converge on controlled fulfillment",
);
const referralMigration = read(
  "supabase/migrations/20260725170000_referrals_vouched_invitations.sql",
);
assert(
  referralMigration.indexOf("status='pending_review'") <
    referralMigration.indexOf("insert into public.beta_invites"),
  "Referral submission must precede a separate invite approval gate",
);
assert(
  referralMigration.includes("Super Admin review before a beta invitation"),
  "Referral access boundary must remain documented in schema",
);
const env = read(".env.example");
for (const secret of [
  "SUPABASE_SECRET_KEY",
  "PAYSTACK_SECRET_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
])
  assert(
    !env.includes(`NEXT_PUBLIC_${secret}`),
    `${secret} must remain server-only`,
  );
const membershipMigration = read(
  "supabase/migrations/20260725210000_membership_renewal_lifecycle.sql",
);
assert(
  membershipMigration.includes("pg_advisory_xact_lock"),
  "Membership grants must serialize per member",
);
assert(
  membershipMigration.includes("onboarding_completed_at is null"),
  "Membership payment must preserve onboarding requirements",
);
assert(
  membershipMigration.includes("is_test_account"),
  "Production test identities must be explicitly tagged",
);
const expiringAdminMigration = read(
  "supabase/migrations/20260730210000_expiring_admin_access.sql",
);
for (const contract of [
  "expires_at is null or expires_at > now()",
  "grant_time_bounded_admin_access",
  "revoke_admin_access",
  "You cannot revoke your own Super Admin access",
  "admin_access.granted",
  "admin_access.revoked",
]) {
  assert(
    expiringAdminMigration.includes(contract),
    `Temporary Admin access must include ${contract}`,
  );
}
const communityHubMigration = read(
  "supabase/migrations/20260730230000_community_hub_foundation.sql",
);
for (const contract of [
  "list_community_member_directory",
  "public.communities_enabled()",
  "membership.user_id = auth.uid()",
  "membership.status = 'active'",
  "profile.access_status = 'active'",
  "not profile.visibility_paused",
  "public.is_blocked_pair(auth.uid(), profile.id)",
]) {
  assert(
    communityHubMigration.includes(contract),
    `Community member roster must include ${contract}`,
  );
}
const structuredCommunityMigration = read(
  "supabase/migrations/20260731010000_structured_community_conversations.sql",
);
for (const contract of [
  "parent_post_id",
  "community_post_appreciations",
  "community_saved_posts",
  "community_followed_posts",
  "list_community_conversations",
  "post.parent_post_id is null",
  "list_community_comments",
  "create_structured_community_post",
  "create_community_comment",
  "set_community_post_appreciation",
  "set_community_post_saved",
  "set_community_post_followed",
  "set_community_post_pinned",
  "public.can_manage_community(target.community_id)",
  "'content_kind'",
  "not public.is_blocked_pair",
  "Hourly community comment limit reached",
]) {
  assert(
    structuredCommunityMigration.includes(contract),
    `Structured community conversations must include ${contract}`,
  );
}
assert(
  !structuredCommunityMigration.includes("'body', trim(p_body)"),
  "Community audit metadata must not copy conversation or comment bodies",
);
const communityProgrammingMigration = read(
  "supabase/migrations/20260731050000_community_programming_and_host_health.sql",
);
for (const contract of [
  "community_event_links",
  "community_course_links",
  "list_community_gatherings",
  "list_community_resources",
  "set_community_event_link",
  "set_community_course_link",
  "list_community_programming_options",
  "get_community_host_health",
  "public.can_manage_community(p_community_id)",
  "membership.user_id = auth.uid()",
  "membership.status = 'active'",
  "not coalesce(profile.is_test_account, false)",
  "post.parent_post_id is null",
  "report.status in ('open', 'reviewing')",
]) {
  assert(
    communityProgrammingMigration.includes(contract),
    `Community programming and Host health must include ${contract}`,
  );
}
assert(
  !communityProgrammingMigration.includes("community_saved_posts"),
  "Host health must not inspect members' private saved conversations",
);
assert(
  !communityProgrammingMigration.includes("select post.body"),
  "Host health must not project community conversation bodies",
);
const communityIdentityMediaMigration = read(
  "supabase/migrations/20260802010000_community_identity_and_media.sql",
);
for (const contract of [
  "community_media_assets",
  "'community-media'",
  "community_one_active_post_attachment_idx",
  "Members read authorised community media",
  "Owners upload draft community branding",
  "Members upload media for their own community posts",
  "list_community_brand_identities",
  "save_community_brand_identity",
  "membership.role = 'owner'",
  "attach_community_post_media",
  "list_community_post_media",
  "https://%",
  "'attachment'",
  "media_revoked",
  "community.brand_identity_saved",
  "community.post_media_attached",
]) {
  assert(
    communityIdentityMediaMigration.includes(contract),
    `Community identity and media controls must include ${contract}`,
  );
}
assert(
  !communityIdentityMediaMigration.includes(
    "on storage.objects for update",
  ) &&
    !communityIdentityMediaMigration.includes(
      "on storage.objects for delete",
    ),
  "Registered community media objects must remain immutable to browser clients",
);
const communityPostEditingMigration = read(
  "supabase/migrations/20260802050000_community_post_editing.sql",
);
for (const contract of [
  "community_post_revisions",
  "revoke all on table public.community_post_revisions",
  "list_community_post_edit_states",
  "edit_community_post",
  "interval '30 minutes'",
  "not post.is_pinned",
  "revision_number >= 5",
  "previous_body",
  "'prior_versions'",
  "'edited_at'",
  "'community.post_edited'",
]) {
  assert(
    communityPostEditingMigration.includes(contract),
    `Controlled Community post editing must include ${contract}`,
  );
}
const communityPostEditFunction = communityPostEditingMigration.slice(
  communityPostEditingMigration.indexOf(
    "create or replace function public.edit_community_post",
  ),
  communityPostEditingMigration.indexOf(
    "create or replace function public.report_community_post",
  ),
);
assert(
  !communityPostEditFunction.includes("'body', clean_body") &&
    !communityPostEditFunction.includes("'body', p_body"),
  "Community post edit audit metadata must never copy conversation text",
);
const communityMemberReadStateMigration = read(
  "supabase/migrations/20260802090000_community_member_read_state.sql",
);
for (const contract of [
  "community_member_read_states",
  "revoke all on table public.community_member_read_states",
  "get_community_read_summary",
  "list_community_post_read_states",
  "mark_community_caught_up",
  "membership.joined_at",
  "membership.created_at",
  "post.author_id <> actor",
  "reply.author_id <> actor",
  "not public.is_blocked_pair",
  "on conflict (community_id, user_id)",
  "last_caught_up_at = greatest",
]) {
  assert(
    communityMemberReadStateMigration.includes(contract),
    `Private Community read state must include ${contract}`,
  );
}
assert(
  !communityMemberReadStateMigration.includes("create policy") &&
    !communityMemberReadStateMigration.includes(
      "grant select on table public.community_member_read_states",
    ),
  "Community read state must remain available only through member-scoped functions",
);
const communityActivityNavigationMigration = read(
  "supabase/migrations/20260802130000_community_activity_navigation.sql",
);
for (const contract of [
  "list_my_community_activity",
  "cross join lateral public.get_community_read_summary",
  "membership.user_id = actor",
  "membership.status = 'active'",
  "summary.new_activity_count desc",
  "revoke all on function public.list_my_community_activity()",
]) {
  assert(
    communityActivityNavigationMigration.includes(contract),
    `Global Community activity navigation must include ${contract}`,
  );
}
assert(
  !communityActivityNavigationMigration.includes("can_manage_community") &&
    !communityActivityNavigationMigration.includes("is_admin"),
  "Community navigation activity must never expose another member's read state to hosts or staff",
);
const communityFeedPaginationMigration = read(
  "supabase/migrations/20260802170000_community_feed_pagination.sql",
);
for (const contract of [
  "list_community_conversation_page",
  "p_before_activity_at",
  "p_before_post_id",
  "num_nulls",
  "post.is_pinned::integer",
  "post.id desc",
  "list_community_comments_for_posts",
  "list_community_post_media_for_posts",
  "cardinality(p_post_ids)",
  "not public.is_blocked_pair",
  "Keep no more than three pinned conversations",
  ") >= 3",
  "limit least(greatest(coalesce(p_limit, 21), 1), 25)",
]) {
  assert(
    communityFeedPaginationMigration.includes(contract),
    `Scalable Community feed pagination must include ${contract}`,
  );
}
const conversationPageFunction = communityFeedPaginationMigration.slice(
  communityFeedPaginationMigration.indexOf(
    "create or replace function public.list_community_conversation_page",
  ),
  communityFeedPaginationMigration.indexOf(
    "create or replace function public.list_community_comments_for_posts",
  ),
);
assert(
  !conversationPageFunction.includes(" offset "),
  "Community feed pagination must use a stable cursor rather than offset paging",
);
const communityNotificationMigration = read(
  "supabase/migrations/20260731100000_community_notification_preferences_and_briefings.sql",
);
const communityEventReminderMigration = read(
  "supabase/migrations/20260803170000_community_event_reminders.sql",
);
const communityCheckInMigration = read(
  "supabase/migrations/20260803210000_community_check_ins.sql",
);
const memberGlobalSearchMigration = read(
  "supabase/migrations/20260804010000_member_global_search.sql",
);
const communityCheckInSafetyMigration = read(
  "supabase/migrations/20260804050000_community_check_in_safety.sql",
);
for (const contract of [
  "community_check_in_reports",
  "report_community_check_in",
  "list_community_safety_reports",
  "review_community_safety_report",
  "array['super_admin', 'moderator']",
  "You already have an active report for this check-in",
  "'question', target.question",
  "'options', coalesce(captured_options",
  "community.check_in_reported",
  "community.report_queue_accessed",
  "community_check_in_reports qr",
]) {
  assert(
    communityCheckInSafetyMigration.includes(contract),
    `Community Check-in safety must enforce ${contract}`,
  );
}
const checkInReportFunction = communityCheckInSafetyMigration.slice(
  communityCheckInSafetyMigration.indexOf(
    "create or replace function public.report_community_check_in",
  ),
  communityCheckInSafetyMigration.indexOf(
    "create or replace function public.list_community_safety_reports",
  ),
);
for (const privateVoteProjection of [
  "community_check_in_responses",
  "option_id",
  "response_count",
]) {
  assert(
    !checkInReportFunction.includes(privateVoteProjection),
    `Check-in report evidence must not include ${privateVoteProjection}`,
  );
}
for (const contract of [
  "search_my_table",
  "public.is_active_member(actor)",
  "not profile.visibility_paused",
  "not public.is_blocked_pair(actor, profile.id)",
  "membership.user_id = actor",
  "membership.status = 'active'",
  "not public.is_blocked_pair(actor, post.author_id)",
  "event.status = 'published'",
  "course.status = 'published'",
  "limit least(greatest(coalesce(p_limit, 30), 1), 40)",
]) {
  assert(
    memberGlobalSearchMigration.includes(contract),
    `Member-wide search must enforce ${contract}`,
  );
}
for (const privateField of [
  "profile_private",
  "email",
  "phone",
  "private_note",
  "messages",
]) {
  assert(
    !memberGlobalSearchMigration.includes(privateField),
    `Member-wide search must not include ${privateField}`,
  );
}
for (const contract of [
  "community_check_ins",
  "community_check_in_options",
  "community_check_in_responses",
  "list_community_check_ins",
  "create_community_check_in",
  "respond_to_community_check_in",
  "close_community_check_in",
  "remove_community_check_in",
  "response_total.response_count >= 3",
  "not public.is_blocked_pair",
  "now() - interval '7 days'",
  "on conflict (check_in_id, user_id) do update",
]) {
  assert(
    communityCheckInMigration.includes(contract),
    `Community Quick Check-ins must enforce ${contract}`,
  );
}
const communityCheckInResponseFunction = communityCheckInMigration.slice(
  communityCheckInMigration.indexOf(
    "create or replace function public.respond_to_community_check_in",
  ),
  communityCheckInMigration.indexOf(
    "create or replace function public.close_community_check_in",
  ),
);
assert(
  !communityCheckInResponseFunction.includes("audit_events") &&
    !communityCheckInResponseFunction.includes("display_name"),
  "Individual Community Check-in answers must not enter audit or identity projections",
);
for (const contract of [
  "community_event_reminders",
  "list_my_community_event_preferences",
  "set_my_community_event_reminder",
  "queue_due_community_event_reminders",
  "Service role required",
  "for update of reminder skip locked",
  "not profile.is_test_account",
  "revision = reminder.revision + 1",
  "foreign key (community_id, event_id)",
]) {
  assert(
    communityEventReminderMigration.includes(contract),
    `Community event reminders must enforce ${contract}`,
  );
}
assert(
  notificationWorker.includes("queue_due_community_event_reminders") &&
    notificationWorker.includes("migrationPending"),
  "Notification worker must queue Community event reminders without breaking pre-migration delivery",
);
for (const contract of [
  "community_notification_preferences",
  "email_replies boolean not null default false",
  "weekly_briefing_email boolean not null default false",
  "community_briefing_email_requires_briefing",
  "get_community_notification_preferences",
  "update_community_notification_preferences",
  "enqueue_community_notification",
  "global_preference.in_app_enabled",
  "global_preference.email_network",
  "queue_community_weekly_briefings",
  "community_briefing_batches",
  "on conflict (week_start) do nothing",
  "profile.access_status = 'active'",
  "not profile.is_test_account",
  "not public.is_blocked_pair",
  "activity.post_count > 0",
  "activity.comment_count > 0",
  "activity.upcoming_gatherings > 0",
  "Service role required",
]) {
  assert(
    communityNotificationMigration.includes(contract),
    `Community briefing delivery must include ${contract}`,
  );
}
const weeklyBriefingFunction = communityNotificationMigration.slice(
  communityNotificationMigration.indexOf(
    "create or replace function public.queue_community_weekly_briefings",
  ),
  communityNotificationMigration.indexOf(
    "create or replace function public.list_community_briefing_batches",
  ),
);
for (const privateProjection of [
  "post.body",
  "comment.body",
  "ask.body",
  "profile.display_name",
  "account.email",
]) {
  assert(
    !weeklyBriefingFunction.includes(privateProjection),
    `Weekly Community briefing must not project ${privateProjection}`,
  );
}
assert(
  notificationWorker.includes("queue_community_weekly_briefings") &&
    notificationWorker.includes("migrationPending"),
  "Notification worker must queue weekly Community briefings without breaking pre-migration delivery",
);
const communityContinuityMigration = read(
  "supabase/migrations/20260731130000_community_continuity_and_outcome_signals.sql",
);
for (const contract of [
  "community_member_nudges",
  "get_community_continuity_summary",
  "list_community_outcome_trends",
  "list_community_introduction_followups",
  "send_community_introduction_nudge",
  "public.can_manage_community(p_community_id)",
  "profile.access_status = 'active'",
  "not profile.is_test_account",
  "continuity.eligible_count >= 5",
  "outcome.share_anonymously",
  "having count(distinct outcome.owner_id) >= 3",
  "now() - interval '7 days'",
  "preference.in_app_enabled",
]) {
  assert(
    communityContinuityMigration.includes(contract),
    `Community continuity and privacy boundaries must include ${contract}`,
  );
}
const continuitySummaryFunction = communityContinuityMigration.slice(
  communityContinuityMigration.indexOf(
    "create or replace function public.get_community_continuity_summary",
  ),
  communityContinuityMigration.indexOf(
    "create or replace function public.list_community_outcome_trends",
  ),
);
const outcomeTrendFunction = communityContinuityMigration.slice(
  communityContinuityMigration.indexOf(
    "create or replace function public.list_community_outcome_trends",
  ),
  communityContinuityMigration.indexOf(
    "create or replace function public.list_community_introduction_followups",
  ),
);
for (const privateProjection of [
  "private_detail",
  "profile.display_name",
  "account.email",
]) {
  assert(
    !continuitySummaryFunction.includes(privateProjection) &&
      !outcomeTrendFunction.includes(privateProjection),
    `Community continuity aggregates must not project ${privateProjection}`,
  );
}
const introductionNudgeFunction = communityContinuityMigration.slice(
  communityContinuityMigration.indexOf(
    "create or replace function public.send_community_introduction_nudge",
  ),
  communityContinuityMigration.indexOf(
    "revoke all on function public.get_community_continuity_summary",
  ),
);
assert(
  introductionNudgeFunction.includes("in_app_allowed") &&
    introductionNudgeFunction.includes("insert into public.notifications"),
  "Introduction reminders must use preference-aware in-app delivery",
);
for (const forbiddenDelivery of [
  "notification_jobs",
  "email_network",
  "email_enabled",
]) {
  assert(
    !introductionNudgeFunction.includes(forbiddenDelivery),
    `Introduction reminders must not queue ${forbiddenDelivery}`,
  );
}
const communityStartPathMigration = read(
  "supabase/migrations/20260731160000_community_member_start_path.sql",
);
for (const contract of [
  "get_my_community_start_path",
  "public.communities_enabled()",
  "public.is_active_member(actor)",
  "membership.user_id = actor",
  "introduction.user_id = actor",
  "post.author_id = actor",
  "connection.status = 'accepted'",
  "other_membership.community_id = p_community_id",
  "not public.is_blocked_pair(actor, other_membership.user_id)",
  "event_member.user_id = actor",
  "link.community_id = p_community_id",
  "event.ends_at >= now()",
  "no public score or member comparison",
]) {
  assert(
    communityStartPathMigration.includes(contract),
    `Private Community start path must include ${contract}`,
  );
}
const communityStartPathFunction = communityStartPathMigration.slice(
  communityStartPathMigration.indexOf(
    "create or replace function public.get_my_community_start_path",
  ),
  communityStartPathMigration.indexOf(
    "revoke all on function public.get_my_community_start_path",
  ),
);
for (const privateProjection of [
  "display_name",
  "private_detail",
  "profile_private",
  "auth.users",
]) {
  assert(
    !communityStartPathFunction.includes(privateProjection),
    `Member Community start path must not project ${privateProjection}`,
  );
}
const communityReleaseMigration = read(
  "supabase/migrations/20260731190000_community_release_acceptance.sql",
);
for (const contract of [
  "community_release_checks",
  "seed_community_release_checks",
  "list_community_release_checks",
  "save_community_release_check",
  "community_release_ready",
  "publish_community_after_acceptance",
  "enforce_community_publish_acceptance",
  "count(*) = 8",
  "membership.role = 'owner'",
  "membership.role = 'moderator'",
  "Every published community must pass release acceptance",
  "community.release_guard_applied",
  "'draft'",
  "'release_state', 'controlled'",
]) {
  assert(
    communityReleaseMigration.includes(contract),
    `Database-enforced Community acceptance must include ${contract}`,
  );
}
const releaseEvidenceFunction = communityReleaseMigration.slice(
  communityReleaseMigration.indexOf(
    "create or replace function public.save_community_release_check",
  ),
  communityReleaseMigration.indexOf(
    "create or replace function public.community_release_ready",
  ),
);
assert(
  !releaseEvidenceFunction.includes("'evidence_note', clean_evidence") &&
    releaseEvidenceFunction.includes("'has_evidence'"),
  "Community acceptance audit metadata must never copy evidence text",
);
const controlledCohortFunction = communityReleaseMigration.slice(
  communityReleaseMigration.indexOf(
    "create or replace function public.ensure_founding_cohort",
  ),
  communityReleaseMigration.indexOf(
    "revoke all on function public.seed_community_release_checks",
  ),
);
assert(
  !controlledCohortFunction.includes("set enabled = true"),
  "Preparing a founding room must not enable Communities",
);
const communityCreatorCommerceMigration = read(
  "supabase/migrations/20260801010000_community_creator_commerce.sql",
);
for (const contract of [
  "community_creator_commerce",
  "community_host_plans",
  "community_host_subscriptions",
  "community_host_accounts",
  "community_offers",
  "community_access_periods",
  "community_revenue_ledger",
  "approved_pending_payment",
  "save_community_host_plan",
  "grant_community_host_plan",
  "accept_community_host_terms",
  "review_community_host_payout",
  "save_community_offer",
  "create_community_order",
  "fulfill_community_order",
  "review_community_order",
  "get_community_host_commerce",
  "list_community_commerce_admin",
  "list_community_orders_admin",
  "pg_advisory_xact_lock",
  "p_signature_verified",
  "set status = 'fulfilled', fulfilled_at = now()",
  "settlement_status",
  "'held'",
]) {
  assert(
    communityCreatorCommerceMigration.includes(contract),
    `Community creator commerce must include ${contract}`,
  );
}
const communityOrderFunction = communityCreatorCommerceMigration.slice(
  communityCreatorCommerceMigration.indexOf(
    "create or replace function public.create_community_order",
  ),
  communityCreatorCommerceMigration.indexOf(
    "create or replace function public.issue_community_access_period",
  ),
);
for (const boundary of [
  "membership.status = 'approved_pending_payment'",
  "offer.payment_mode = 'closed'",
  "community_order.status in",
  "'pending_payment'",
  "'pending_review'",
]) {
  assert(
    communityOrderFunction.includes(boundary),
    `Community checkout boundary must include ${boundary}`,
  );
}
const saveCommunityOfferFunction = communityCreatorCommerceMigration.slice(
  communityCreatorCommerceMigration.indexOf(
    "create or replace function public.save_community_offer",
  ),
  communityCreatorCommerceMigration.indexOf(
    "drop function if exists public.list_communities",
  ),
);
for (const boundary of [
  "public.is_community_owner",
  "public.community_creator_commerce_enabled",
  "account.payout_status = 'verified'",
  "subscription.status in ('active', 'grace')",
  "p_payment_mode = 'closed'",
]) {
  assert(
    saveCommunityOfferFunction.includes(boundary),
    `Paid community publishing must include ${boundary}`,
  );
}
assert(
  communityCreatorCommerceMigration.includes(
    "Provider reference only; bank account details must never be stored here",
  ),
  "Community payout records must not store bank account details",
);
const communityHostBillingMigration = read(
  "supabase/migrations/20260801050000_community_host_self_service_billing.sql",
);
for (const contract of [
  "community_host_self_service_billing",
  "community_host_billing_settings",
  "community_host_plan_orders",
  "set_community_host_billing_configuration",
  "get_community_host_billing",
  "create_community_host_plan_order",
  "fulfill_community_host_plan_order",
  "review_community_host_plan_order",
  "list_community_host_plan_orders_admin",
  "community_host_tools",
  "pg_advisory_xact_lock",
  "Active community ownership required",
  "p_signature_verified",
  "'community_host_plan'",
  "set status = 'fulfilled', fulfilled_at = now()",
  "set status = 'cancelled', updated_at = now()",
  "set status = 'paused', updated_at = now()",
]) {
  assert(
    communityHostBillingMigration.includes(contract),
    `Host self-service billing must include ${contract}`,
  );
}
const hostPlanOrderFunction = communityHostBillingMigration.slice(
  communityHostBillingMigration.indexOf(
    "create or replace function public.create_community_host_plan_order",
  ),
  communityHostBillingMigration.indexOf(
    "create or replace function public.fulfill_community_host_plan_order",
  ),
);
for (const boundary of [
  "public.is_community_owner(p_community_id)",
  "billing_mode = 'closed'",
  "plan.price_minor",
  "subscription.ends_at > now()",
  "host_order.status in",
  "'pending_payment'",
  "'pending_review'",
]) {
  assert(
    hostPlanOrderFunction.includes(boundary),
    `Host plan order boundary must include ${boundary}`,
  );
}
assert(
  !hostPlanOrderFunction.includes("insert into public.community_memberships"),
  "Host plan checkout must never create or transfer community ownership",
);
const communityHostLifecycleMigration = read(
  "supabase/migrations/20260801090000_community_host_subscription_lifecycle.sql",
);
for (const contract of [
  "order_kind",
  "'renewal'",
  "'plan_change'",
  "'scheduled'",
  "grace_ends_at",
  "renewed_from_id",
  "community_one_scheduled_host_plan_idx",
  "reconcile_community_host_subscriptions",
  "handle_host_plan_order_reversal",
  "community-host-renewal-reminder:",
  "status = 'paused'",
  "Service or Super Admin required",
]) {
  assert(
    communityHostLifecycleMigration.includes(contract),
    `Host subscription lifecycle must include ${contract}`,
  );
}
const lifecycleOrderFunction = communityHostLifecycleMigration.slice(
  communityHostLifecycleMigration.indexOf(
    "create or replace function public.create_community_host_plan_order",
  ),
  communityHostLifecycleMigration.indexOf(
    "create or replace function public.fulfill_community_host_plan_order",
  ),
);
for (const boundary of [
  "pg_advisory_xact_lock",
  "An upcoming host plan is already scheduled",
  "A current host plan order already exists",
  "current_subscription.plan_id = selected_plan.id",
  "public.is_community_owner(p_community_id)",
]) {
  assert(
    lifecycleOrderFunction.includes(boundary),
    `Host renewal checkout must include ${boundary}`,
  );
}
assert(
  !communityHostLifecycleMigration.includes(
    "delete from public.community_memberships",
  ),
  "Host subscription lifecycle must never delete community membership",
);
const communityFinanceMigration = read(
  "supabase/migrations/20260801130000_community_financial_reconciliation.sql",
);
for (const contract of [
  "community_reconciliation_entries",
  "community_financial_cases",
  "community_settlement_batches",
  "community_settlement_items",
  "prevent_community_financial_mutation",
  "process_community_financial_webhook",
  "capture_initial_community_provider_fee",
  "record_community_financial_adjustment",
  "review_community_financial_case",
  "create_community_settlement_batch",
  "mark_community_settlement_paid",
  "list_community_financial_statement",
  "list_community_finance_admin",
  "pg_advisory_xact_lock",
  "Provider signature required",
  "Financial event amount or currency mismatch",
  "Resolve open refunds and disputes before settlement",
  "Creator balance changed; cancel and rebuild the batch",
]) {
  assert(
    communityFinanceMigration.includes(contract),
    `Community financial reconciliation must include ${contract}`,
  );
}
for (const event of [
  "'refund.pending'",
  "'refund.processing'",
  "'refund.needs-attention'",
  "'refund.failed'",
  "'refund.processed'",
  "'charge.dispute.create'",
  "'charge.dispute.remind'",
  "'charge.dispute.resolve'",
]) {
  assert(
    communityFinanceMigration.includes(event),
    `Community financial webhook must include ${event}`,
  );
}
assert(
  communityFinanceMigration.includes(
    "before update or delete on public.community_reconciliation_entries",
  ) &&
    communityFinanceMigration.includes(
      "before update or delete on public.community_settlement_items",
    ),
  "Creator statement entries and settlement items must be append-only",
);
assert(
  !communityFinanceMigration.includes(
    "delete from public.community_memberships",
  ),
  "Financial reconciliation must never delete community membership",
);
const communityHostApplicationMigration = read(
  "supabase/migrations/20260801170000_community_host_applications.sql",
);
for (const contract of [
  "community_host_applications",
  "community_one_open_host_application_idx",
  "save_community_host_application",
  "withdraw_community_host_application",
  "list_my_community_host_applications",
  "list_community_host_applications_admin",
  "review_community_host_application",
  "public.is_active_member(target.applicant_id)",
  "'community.host_application_submitted'",
  "'community.host_application_' || p_action",
  "'private'",
  "'draft'",
  "'owner'",
  "'active'",
  "public.enqueue_notification",
]) {
  assert(
    communityHostApplicationMigration.includes(contract),
    `Community host admission must include ${contract}`,
  );
}
assert(
  communityHostApplicationMigration.includes(
    "grant select on table public.community_host_applications to authenticated",
  ) &&
    !communityHostApplicationMigration.includes(
      "grant insert on table public.community_host_applications",
    ) &&
    !communityHostApplicationMigration.includes(
      "grant update on table public.community_host_applications",
    ),
  "Community host applications must mutate only through audited functions",
);
assert(
  !communityHostApplicationMigration.includes(
    "insert into public.communities(\n      slug,\n      name,\n      description,\n      community_type,\n      status,\n      created_by\n    )\n    values (\n      clean_slug,\n      target.community_name,\n      target.purpose,\n      'private',\n      'published'",
  ),
  "Host approval must never publish a community directly",
);
const communityHostEntitlementMigration = read(
  "supabase/migrations/20260801210000_community_host_plan_entitlements.sql",
);
for (const contract of [
  "community_host_has_feature",
  "get_community_host_capabilities",
  "enforce_community_moderator_entitlement",
  "community_host_subscriptions",
  "subscription.status in ('active', 'grace')",
  "subscription.ends_at > now()",
  "pg_advisory_xact_lock",
  "'advanced_analytics'",
  "'automations'",
  "'multiple_moderators'",
  "Advanced insights are not included in the active host plan",
  "Host reminders are not included in the active host plan",
  "Your host plan includes % moderator%",
  "jsonb_typeof(feature.value) <> 'boolean'",
  "'entitlement', 'automations'",
]) {
  assert(
    communityHostEntitlementMigration.includes(contract),
    `Community host entitlements must include ${contract}`,
  );
}
assert(
  communityHostEntitlementMigration.includes(
    "before insert or update of role, status",
  ),
  "Moderator limits must be enforced for invitations, promotions and activation",
);
assert(
  !communityHostEntitlementMigration.includes(
    "delete from public.community_memberships",
  ),
  "Plan enforcement must never delete community membership",
);
const hardenedCommunityOrderFunction = communityHostBillingMigration.slice(
  communityHostBillingMigration.indexOf(
    "create or replace function public.create_community_order",
  ),
  communityHostBillingMigration.indexOf(
    "create or replace function public.notify_order_event",
  ),
);
for (const boundary of [
  "subscription.ends_at > now()",
  "account.payout_status = 'verified'",
  "membership.status = 'approved_pending_payment'",
]) {
  assert(
    hardenedCommunityOrderFunction.includes(boundary),
    `Member community checkout must fail closed on ${boundary}`,
  );
}
const betaAdminProvisioning = read("scripts/provision-beta-admin.mjs");
for (const contract of [
  "HAT_BETA_ADMIN_PASSWORD",
  "beta_admin_expires_at",
  "is_test_account: true",
  "signInWithPassword",
  "expiryEnforced",
]) {
  assert(
    betaAdminProvisioning.includes(contract),
    `Beta Admin provisioning must include ${contract}`,
  );
}
assert(
  paymentInitialize.includes("create_membership_order"),
  "Membership checkout must use the shared payment initializer",
);
const testUsers = read("app/api/admin/test-users/route.ts");
assert(
  testUsers.includes('eq("role","super_admin")'),
  "Test user creation must verify Super Admin",
);
assert(
  testUsers.includes('.endsWith(".invalid")'),
  "Test identities must use a reserved domain",
);
const circlesMigration = read(
  "supabase/migrations/20260726090000_circles_deterministic_matching.sql",
);
assert(
  circlesMigration.includes("deterministic_v1"),
  "Circle matching must identify its deterministic method",
);
assert(
  circlesMigration.includes("Matching produced a blocked pair"),
  "Circle matching must stop on blocked pairs",
);
assert(
  circlesMigration.indexOf("status='matched'") <
    circlesMigration.indexOf("publish_circle_cycle"),
  "Circle matching must remain reviewable before publication",
);
assert(
  circlesMigration.includes("include_test_accounts"),
  "Circle cycles must explicitly control test identities",
);
const communityCircleLinksMigration = read(
  "supabase/migrations/20260802210000_community_circle_links.sql",
);
for (const contract of [
  "community_circle_cycle_links",
  "revoke all on table public.community_circle_cycle_links",
  "list_community_circle_programs",
  "list_community_circle_options",
  "set_community_circle_cycle_link",
  "public.communities_enabled()",
  "public.circles_enabled()",
  "public.can_manage_community(p_community_id)",
  "mine_membership.user_id = auth.uid()",
  "circle.status in ('published', 'completed')",
  "community.circle_cycle_linked",
  "community.circle_cycle_unlinked",
]) {
  assert(
    communityCircleLinksMigration.includes(contract),
    `Community-linked Circles must include ${contract}`,
  );
}
assert(
  !communityCircleLinksMigration.includes("create policy") &&
    !communityCircleLinksMigration.includes(
      "grant select on table public.community_circle_cycle_links",
    ),
  "Community-Circle links must be available only through controlled functions",
);
const communityCircleMemberFunction = communityCircleLinksMigration.slice(
  communityCircleLinksMigration.indexOf(
    "create or replace function public.list_community_circle_programs",
  ),
  communityCircleLinksMigration.indexOf(
    "create or replace function public.list_community_circle_options",
  ),
);
for (const privateProjection of [
  "match_explanation",
  "circle_prompt_responses",
  "profile.display_name",
  "auth.users",
]) {
  assert(
    !communityCircleMemberFunction.includes(privateProjection),
    `Community Circle context must not project ${privateProjection}`,
  );
}
const perksMigration = read(
  "supabase/migrations/20260726130000_partner_perks_redemption.sql",
);
assert(
  perksMigration.includes("for update"),
  "Perk inventory must be locked before reservation",
);
assert(
  perksMigration.includes("perk_active_reservation_idx"),
  "Perks must prevent duplicate active reservations",
);
assert(
  perksMigration.includes("expire_perk_redemptions"),
  "Expired reservations must release inventory",
);
assert(
  perksMigration.includes("Super admin required"),
  "Redemption reconciliation must remain admin controlled",
);
const analyticsMigration = read(
  "supabase/migrations/20260726170000_privacy_safe_analytics.sql",
);
for (const forbiddenField of [
  "ip_address",
  "user_agent",
  "raw_url",
  "search_query",
  "message_body",
  "subject_id",
  "total_minor",
])
  assert(
    !analyticsMigration.includes(forbiddenField),
    `Analytics must not collect ${forbiddenField}`,
  );
assert(
  analyticsMigration.includes("is_test_event"),
  "Analytics must separate tagged test activity",
);
assert(
  analyticsMigration.includes("Super admin required"),
  "Analytics aggregates must remain Super Admin-only",
);
assert(
  analyticsMigration.includes("octet_length(metadata::text)<=2048"),
  "Analytics metadata must remain bounded",
);
assert(
  analyticsMigration.includes("t.status='on_sale'"),
  "Readiness must use the live ticket status contract",
);
const launchGateMigration = read(
  "supabase/migrations/20260728130000_launch_gate_evidence.sql",
);
for (const contract of [
  "launch_gate_checks",
  "list_launch_gate_checks",
  "save_launch_gate_check",
  "Super admin required",
  "Passed checks require concise evidence",
  "'launch.gate_updated'",
]) {
  assert(
    launchGateMigration.includes(contract),
    `Operational launch evidence must include ${contract}`,
  );
}
assert(
  !launchGateMigration.includes(
    "jsonb_build_object('check_key', p_check_key, 'status', p_status, 'evidence'",
  ),
  "Launch audit metadata must not duplicate operational evidence text",
);
const databaseReadinessMigration = read(
  "supabase/migrations/20260803010000_production_database_readiness.sql",
);
for (const contract of [
  "list_database_release_readiness",
  "Super admin required",
  "to_regclass('public.' || table_name)",
  "pg_catalog.pg_proc",
  "pg_catalog.pg_namespace",
  "cardinality(evaluated.missing_items) = 0",
  "20260722200000_registration_lifecycle.sql",
  "20260802170000_community_feed_pagination.sql",
  "20260802210000_community_circle_links.sql",
  "20260728130000_launch_gate_evidence.sql",
  "Community-linked Circles",
  "Analytics and launch controls",
]) {
  assert(
    databaseReadinessMigration.includes(contract),
    `Production database readiness must include ${contract}`,
  );
}
assert(
  !databaseReadinessMigration.includes("select * from public.") &&
    !databaseReadinessMigration.includes("auth.users"),
  "Database readiness must inspect structure without reading member or authentication data",
);
const moduleReleaseMigration = read(
  "supabase/migrations/20260803050000_module_release_acceptance.sql",
);
const communityAcceptanceModeMigration = read(
  "supabase/migrations/20260805010000_community_acceptance_mode.sql",
);
for (const contract of [
  "community_acceptance_mode",
  "profile.is_test_account",
  "profile.access_status = 'active'",
  "communities_enabled",
]) {
  assert(
    communityAcceptanceModeMigration.includes(contract),
    `Community controlled rehearsal must include ${contract}`,
  );
}
for (const contract of [
  "module_release_checks",
  "list_module_release_acceptance",
  "save_module_release_check",
  "enforce_module_release_acceptance",
  "Complete this module in Admin Release before enabling it",
  "two_account_journey",
  "privacy_and_permissions",
  "admin_operations",
  "rollback_and_recovery",
  "community_creator_commerce",
  "list_database_release_readiness",
  "revoke insert, update, delete on public.feature_flags from anon, authenticated",
  "if not new.enabled then",
  "if p_enabled",
  "Every published community must pass release acceptance",
]) {
  assert(
    moduleReleaseMigration.includes(contract),
    `Module release acceptance must include ${contract}`,
  );
}
assert(
  !moduleReleaseMigration.includes(
    "jsonb_build_object(\n      'feature_key', p_feature_key,\n      'check_key', p_check_key,\n      'status', p_status,\n      'evidence_note'",
  ),
  "Module release audit metadata must not duplicate acceptance evidence",
);
const communityPublicProfileMigration = read(
  "supabase/migrations/20260803090000_community_public_profiles.sql",
);
for (const contract of [
  "public_preview_enabled boolean not null default false",
  "enforce_community_public_profile",
  "new.public_preview_enabled := false",
  "public.community_release_ready(new.id)",
  "public.communities_enabled()",
  "Complete every required public Community field before sharing",
  "get_community_public_profile_admin",
  "save_community_public_profile",
  "get_public_community_about",
  "community.public_profile_saved",
  "show_public_member_count",
  "public.community_creator_commerce_enabled()",
  "grant execute on function public.get_public_community_about(text)\n  to anon, authenticated",
  "public_preview_enabled boolean\n)",
]) {
  assert(
    communityPublicProfileMigration.includes(contract),
    `Community public profiles must include ${contract}`,
  );
}
assert(
  !communityPublicProfileMigration.includes("storage_path"),
  "Anonymous Community profiles must not project private media storage paths",
);
assert(
  !communityPublicProfileMigration.includes(
    "jsonb_build_object(\n      'about_summary'",
  ) &&
    !communityPublicProfileMigration.includes(
      "jsonb_build_object(\n      'host_intro'",
    ),
  "Community public-profile audits must not duplicate owner-written copy",
);
const memberProfileMigration = read(
  "supabase/migrations/20260728170000_member_profile_view.sql",
);
for (const contract of [
  "get_member_profile",
  "public.is_blocked_pair(actor, p_member_id)",
  "connection.status = 'accepted'",
  "private_profile.share_phone_with_connections",
  "Active visible membership required",
]) {
  assert(
    memberProfileMigration.includes(contract),
    `Privacy-safe member profile view must include ${contract}`,
  );
}
const intentionalIntroductionsMigration = read(
  "supabase/migrations/20260728210000_intentional_introductions.sql",
);
for (const contract of [
  "introduction_note",
  "request_connection_with_context",
  "list_my_network_with_context",
  "get_connection_introduction",
  "'introduction_provided', clean_note is not null",
]) {
  assert(
    intentionalIntroductionsMigration.includes(contract),
    `Intentional introductions must include ${contract}`,
  );
}
assert(
  !intentionalIntroductionsMigration.includes(
    "'introduction_note', clean_note",
  ),
  "Private introduction text must not be duplicated into audit metadata",
);
const savedProfilesMigration = read(
  "supabase/migrations/20260729010000_saved_member_profiles.sql",
);
for (const contract of [
  "member_saved_profiles",
  "save_member_profile",
  "remove_saved_member_profile",
  "is_member_profile_saved",
  "list_my_saved_profiles",
  "'private_note_provided', clean_note is not null",
  "Saved profile limit reached",
]) {
  assert(
    savedProfilesMigration.includes(contract),
    `Private saved profiles must include ${contract}`,
  );
}
assert(
  !savedProfilesMigration.includes("'private_note', clean_note"),
  "Private saved-profile notes must not be duplicated into audit metadata",
);
const memberRecommendationsMigration = read(
  "supabase/migrations/20260729050000_member_recommendations.sql",
);
for (const contract of [
  "list_member_recommendations",
  "shared_goals",
  "shared_interests",
  "match_reasons",
  "public.is_blocked_pair(auth.uid(), profile.id)",
  "connection.status in ('pending', 'accepted')",
  "member_saved_profiles",
  "A new perspective for your network",
]) {
  assert(
    memberRecommendationsMigration.includes(contract),
    `Explainable member recommendations must include ${contract}`,
  );
}
const curatedIntroductionsMigration = read(
  "supabase/migrations/20260729090000_curated_introductions.sql",
);
for (const contract of [
  "curated_introductions",
  "create_curated_introduction",
  "respond_to_curated_introduction",
  "cancel_curated_introduction",
  "list_my_curated_introductions",
  "list_curated_introductions_admin",
  "You both accepted",
  "public.is_blocked_pair",
  "'curated_introduction.created'",
]) {
  assert(
    curatedIntroductionsMigration.includes(contract),
    `Consent-based curated introductions must include ${contract}`,
  );
}
assert(
  !curatedIntroductionsMigration.includes("'reason', clean_reason"),
  "Curated-introduction audit metadata must not duplicate the visible reason",
);
const connectionPreferencesMigration = read(
  "supabase/migrations/20260729130000_connection_preferences.sql",
);
for (const contract of [
  "member_connection_preferences",
  "get_my_connection_preferences",
  "set_my_connection_preferences",
  "list_connection_availability",
  "get_member_connection_mode",
  "list_connection_availability_admin",
  "enforce_direct_connection_preference",
  "enforce_curated_connection_preference",
  "Member accepts curated introductions only",
  "One or both members are not accepting curated introductions",
]) {
  assert(
    connectionPreferencesMigration.includes(contract),
    `Member-controlled connection availability must include ${contract}`,
  );
}
const relationshipFollowupsMigration = read(
  "supabase/migrations/20260729170000_relationship_followups.sql",
);
for (const contract of [
  "connection_followups",
  "save_connection_followup",
  "complete_connection_followup",
  "remove_connection_followup",
  "list_my_connection_followups",
  "list_due_connection_followups",
  "Accepted connection required",
  "'has_private_note', clean_note is not null",
]) {
  assert(
    relationshipFollowupsMigration.includes(contract),
    `Private relationship follow-ups must include ${contract}`,
  );
}
assert(
  !relationshipFollowupsMigration.includes("'private_note', clean_note"),
  "Relationship follow-up audit metadata must not copy private notes",
);
const connectionOutcomesMigration = read(
  "supabase/migrations/20260729210000_connection_outcomes.sql",
);
for (const contract of [
  "connection_outcomes",
  "record_connection_outcome",
  "list_my_connection_outcomes",
  "remove_connection_outcome",
  "get_connection_outcome_summary",
  "share_anonymously",
  "not owner_profile.is_test_account",
  "not low_profile.is_test_account",
  "not high_profile.is_test_account",
  "Accepted connection required",
]) {
  assert(
    connectionOutcomesMigration.includes(contract),
    `Privacy-safe connection outcomes must include ${contract}`,
  );
}
assert(
  !connectionOutcomesMigration.includes("'private_detail', clean_detail"),
  "Connection outcome audit metadata must not copy private details",
);
const connectionOutcomeThresholdMigration = read(
  "supabase/migrations/20260730090000_connection_outcome_privacy_threshold.sql",
);
for (const contract of [
  "get_connection_outcome_summary",
  "having count(distinct outcome.owner_id) >= 3",
  "not owner_profile.is_test_account",
  "not low_profile.is_test_account",
  "not high_profile.is_test_account",
]) {
  assert(
    connectionOutcomeThresholdMigration.includes(contract),
    `Small-cohort outcome suppression must include ${contract}`,
  );
}
const connectionOutcomeEditsMigration = read(
  "supabase/migrations/20260730130000_connection_outcome_edits.sql",
);
const connectionRequestBoundariesMigration = read(
  "supabase/migrations/20260730170000_connection_request_boundaries.sql",
);
for (const contract of [
  "enforce_connection_request_boundaries",
  "outstanding_count >= 10",
  "daily_count >= 20",
  "old.status = 'ignored'",
  "interval '30 days'",
  "old.status = 'cancelled'",
  "interval '7 days'",
  "before insert or update of status, requester_id, recipient_id",
]) {
  assert(
    connectionRequestBoundariesMigration.includes(contract),
    `Database-enforced connection request boundaries must include ${contract}`,
  );
}
for (const contract of [
  "update_connection_outcome",
  "owner_id = actor",
  "connection.outcome_updated",
  "'shared_anonymously', coalesce(p_share_anonymously, false)",
]) {
  assert(
    connectionOutcomeEditsMigration.includes(contract),
    `Owner-controlled connection outcome edits must include ${contract}`,
  );
}
assert(
  !connectionOutcomeEditsMigration.includes("'private_detail', clean_detail"),
  "Connection outcome edit audit metadata must not copy private details",
);
const databaseCorrections = read(
  "supabase/migrations/20260726210000_ci_database_corrections.sql",
);
assert(
  databaseCorrections.includes("extensions.gen_random_bytes"),
  "Security-definer token generation must qualify the extensions schema",
);
assert(
  databaseCorrections.includes("e.status='published'"),
  "Readiness queries must qualify status columns",
);
assert(
  databaseCorrections.includes("nj.status='failed'"),
  "Notification readiness must avoid output-column ambiguity",
);
const boundaryTests = read("supabase/tests/001_production_boundaries.sql");
assert(
  boundaryTests.includes(
    "select report_id from public.list_community_reports()",
  ),
  "Moderation tests must use the authorized report projection",
);
assert(
  boundaryTests.includes("select circle_id from public.list_my_circles()"),
  "Circle tests must use the authorized member projection",
);
const actionDialog = read("components/ui/action-dialog.tsx");
assert(
  actionDialog.includes("showModal()"),
  "Critical actions must use a modal focus boundary",
);
assert(
  actionDialog.includes('role="alert"'),
  "Action validation must announce inline errors",
);
const adminDialogModules = [
  "analytics-readiness",
  "circle-manager",
  "community-manager",
  "community-event-proposal-manager",
  "community-release-gate",
  "community-moderation",
  "event-checkin-console",
  "event-feedback-manager",
  "learning-manager",
  "marketplace-moderation",
  "membership-manager",
  "moderation-queue",
  "perks-manager",
  "privacy-operations",
  "referral-manager",
  "registration-manager",
];
for (const module of adminDialogModules) {
  const path = `components/admin/${module}.tsx`;
  const content = read(path);
  assert(
    !/\b(?:window\.)?(?:prompt|confirm)\s*\(/.test(content),
    `${path} must not regress to browser prompts`,
  );
  assert(
    content.includes("useActionDialog"),
    `${path} must use the shared accessible action dialog`,
  );
}
const memberDialogModules = [
  "account-settings",
  "circles-hub",
  "community-feed",
  "learning-catalog",
  "message-center",
  "network-hub",
  "opportunity-marketplace",
  "order-history",
  "perks-gallery",
];
for (const module of memberDialogModules) {
  const path = `components/member/${module}.tsx`;
  const content = read(path);
  assert(
    !/\b(?:window\.)?(?:prompt|confirm)\s*\(/.test(content),
    `${path} must not regress to browser prompts`,
  );
  assert(
    content.includes("useActionDialog"),
    `${path} must use the shared accessible action dialog`,
  );
}
const memberError = read("lib/member-error.ts");
assert(
  memberError.includes("technicalMessagePatterns"),
  "Member errors must filter technical database details",
);
assert(
  memberError.includes("contact support from your account"),
  "Member errors must provide a recovery path",
);
const memberRecoveryModules = [
  "account-settings",
  "circles-hub",
  "community-directory",
  "community-feed",
  "learning-catalog",
  "membership-center",
  "message-center",
  "network-hub",
  "notification-center",
  "opportunity-marketplace",
  "order-history",
  "perks-gallery",
  "referral-center",
  "support-center",
];
for (const module of memberRecoveryModules) {
  const path = `components/member/${module}.tsx`;
  const content = read(path);
  assert(
    content.includes("memberErrorMessage"),
    `${path} must use member-safe error recovery`,
  );
  assert(
    !/\berror\.message\b/.test(content),
    `${path} must not expose raw service errors`,
  );
}
const adminError = read("lib/admin-error.ts");
assert(
  adminError.includes("configurationPatterns"),
  "Admin errors must filter configuration details",
);
assert(
  adminError.includes("Admin support area"),
  "Admin errors must provide an operational recovery path",
);
const adminRecoveryModules = [
  "analytics-readiness",
  "circle-manager",
  "community-manager",
  "community-release-gate",
  "community-moderation",
  "event-checkin-console",
  "event-content-manager",
  "event-countdown-manager",
  "event-feedback-manager",
  "event-gallery-manager",
  "event-manager",
  "event-menu-manager",
  "learning-manager",
  "marketplace-moderation",
  "member-review",
  "membership-manager",
  "moderation-queue",
  "notification-operations",
  "perks-manager",
  "privacy-operations",
  "referral-manager",
  "registration-manager",
  "support-inbox",
];
for (const module of adminRecoveryModules) {
  const path = `components/admin/${module}.tsx`;
  const content = read(path);
  assert(
    content.includes("adminErrorMessage"),
    `${path} must use Admin-safe error recovery`,
  );
  assert(
    !/\berror\.message\b/.test(content),
    `${path} must not expose raw service errors`,
  );
}
const notificationOperations = read(
  "components/admin/notification-operations.tsx",
);
assert(
  /adminErrorMessage\(\s*job\.last_error/.test(notificationOperations),
  "Notification operations must filter provider errors",
);
const adminGuidanceContracts = {
  "circle-manager": ["circle-cycle-guide", "circle-prompt-guide"],
  "community-manager": ["community-editor-guide", "community-invite-guide"],
  "event-content-manager": [
    "session-editor-guide",
    "announcement-editor-guide",
    "sponsor-editor-guide",
    "event-staff-guide",
  ],
  "event-countdown-manager": ["event-countdown-guide"],
  "event-feedback-manager": ["event-recap-guide"],
  "event-gallery-manager": ["gallery-album-guide", "gallery-asset-guide"],
  "event-menu-manager": ["menu-narrative-guide", "menu-item-guide"],
  "learning-manager": ["lesson-editor-guide", "course-grant-guide"],
  "perks-manager": ["perk-partner-guide", "perk-benefit-guide"],
  "referral-manager": ["referral-campaign-guide"],
};
for (const [module, guidanceIds] of Object.entries(adminGuidanceContracts)) {
  const path = `components/admin/${module}.tsx`;
  const content = read(path);
  for (const guidanceId of guidanceIds) {
    assert(
      content.includes(`id="${guidanceId}"`) &&
        content.includes(`aria-describedby="${guidanceId}"`),
      `${path} must provide accessible guidance for ${guidanceId}`,
    );
  }
}
const qualityWorkflow = read(".github/workflows/ci.yml");
assert(
  qualityWorkflow.includes("supabase/setup-cli@v2"),
  "CI must use the Node 24-compatible Supabase setup action",
);
const communityScaleAcceptance = read("scripts/accept-community-scale.mjs");
const packageJson = JSON.parse(read("package.json"));
for (const contract of [
  "HAT_ADMIN_TEST_EMAIL",
  "HAT_COMMUNITY_SCALE_WRITE",
  "list_community_conversation_page",
  "list_community_safety_reports",
  "after.posts.length < 45",
  "Pagination repeated conversation",
  "Anonymous visitors unexpectedly read",
]) {
  assert(
    communityScaleAcceptance.includes(contract),
    `Community scale acceptance must include ${contract}`,
  );
}
assert(
  packageJson.scripts?.["ops:community:accept-scale"],
  "Package scripts must expose the five-role Community scale acceptance",
);
const membershipApplicationMigration = read(
  "supabase/migrations/20260809100000_membership_application_journey.sql",
);
for (const contract of [
  "membership_applications",
  "submit_membership_application",
  "list_admin_members_v3",
  "Only a submitted pending request can be declined",
  "public.is_admin(array['super_admin']::public.app_role[])",
  "membership.application_submitted",
]) {
  assert(
    membershipApplicationMigration.includes(contract),
    `Membership application boundary must include ${contract}`,
  );
}
const communityEventProposalMigration = read(
  "supabase/migrations/20260809140000_community_hosted_event_proposals.sql",
);
for (const contract of [
  "community_event_proposals",
  "save_community_event_proposal",
  "review_community_event_proposal",
  "list_admin_community_event_proposals",
  "can_view_event",
  "p_user_id = auth.uid()",
  "public.is_active_member(p_user_id)",
  "Event is not available to this member",
  "Choose one Community place per member",
  "Public and paid Community events are not open yet",
  "'manual_review'",
  "'community'",
  "'free'",
]) {
  assert(
    communityEventProposalMigration.includes(contract),
    `Community-hosted event boundary must include ${contract}`,
  );
}
const hostEventProposal = read(
  "components/community/community-event-proposal-panel.tsx",
);
for (const contract of [
  "Plan a gathering",
  "Members only",
  "Save private draft",
  "Send for review",
  "memberErrorMessage",
]) {
  assert(
    hostEventProposal.includes(contract),
    `Host event proposal journey must include ${contract}`,
  );
}
const adminEventProposal = read(
  "components/admin/community-event-proposal-manager.tsx",
);
for (const contract of [
  "Approve free gathering",
  "Request changes",
  "Responsible person",
  "adminErrorMessage",
  "useActionDialog",
]) {
  assert(
    adminEventProposal.includes(contract),
    `Admin event review journey must include ${contract}`,
  );
}
console.log(
  `Repository contracts passed: ${tracked.length} tracked files, ${migrations.length} ordered migrations.`,
);
