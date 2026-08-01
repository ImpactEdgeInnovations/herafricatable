begin;

create or replace function public.list_database_release_readiness()
returns table(
  module_key text,
  area text,
  label text,
  ready boolean,
  summary text,
  migration_file text,
  missing_items text[],
  sort_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin(array['super_admin']::public.app_role[]) then
    raise exception 'Super admin required';
  end if;

  return query
  with manifest(
    module_key,
    area,
    label,
    summary,
    migration_file,
    table_names,
    function_names,
    sort_order
  ) as (
    values
      (
        'member_access',
        'Core platform',
        'Member access and profiles',
        'Member approval, onboarding, private profile data and Admin roles.',
        '20260721120000_onboarding_v2.sql',
        array['profiles', 'profile_private', 'member_goals', 'user_roles']::text[],
        array['complete_member_onboarding_v2', 'list_admin_members_v2']::text[],
        10
      ),
      (
        'events_content',
        'Core platform',
        'Events and event content',
        'Published events, private joining details, programmes, menus and galleries.',
        '20260722090000_event_gallery_operations.sql',
        array['events', 'event_private_details', 'programme_sessions', 'event_announcements', 'event_menus', 'gallery_albums']::text[],
        array['list_managed_events', 'can_manage_event']::text[],
        20
      ),
      (
        'registration_payments',
        'Core platform',
        'Registration and payments',
        'Tickets, seat requests, verified payments, refunds and order fulfilment.',
        '20260722200000_registration_lifecycle.sql',
        array['ticket_types', 'registration_requests', 'orders', 'payment_attempts', 'payment_events', 'refund_requests']::text[],
        array['create_event_registration', 'process_paystack_payment', 'fulfill_registration_order']::text[],
        30
      ),
      (
        'network_messages',
        'Core platform',
        'Member network and messages',
        'Consent-based connections, blocking, conversations and private messages.',
        '20260723130000_private_messaging.sql',
        array['connections', 'member_blocks', 'conversations', 'conversation_participants', 'messages']::text[],
        array['list_member_directory', 'list_my_conversations', 'report_message']::text[],
        40
      ),
      (
        'support_privacy',
        'Core platform',
        'Support and privacy',
        'Member support, data export, deletion requests and consent records.',
        '20260723210000_privacy_account_lifecycle.sql',
        array['support_tickets', 'support_messages', 'privacy_requests', 'consent_records']::text[],
        array['create_support_ticket', 'get_my_data_export', 'execute_account_deletion']::text[],
        50
      ),
      (
        'notifications',
        'Core platform',
        'Notifications and email queue',
        'Member notification choices, in-app updates and retry-safe email delivery.',
        '20260724090000_notification_operations.sql',
        array['notifications', 'notification_preferences', 'notification_jobs', 'notification_deliveries']::text[],
        array['claim_notification_jobs', 'finish_notification_job']::text[],
        60
      ),
      (
        'community_core',
        'Community',
        'Community membership',
        'Community discovery, join requests, member roles and privacy-safe directories.',
        '20260730230000_community_hub_foundation.sql',
        array['communities', 'community_memberships', 'community_posts']::text[],
        array['list_communities', 'list_community_member_directory', 'can_manage_community']::text[],
        100
      ),
      (
        'community_conversations',
        'Community',
        'Community posts and replies',
        'Structured posts, replies, following, saved items, pagination and moderation.',
        '20260802170000_community_feed_pagination.sql',
        array['community_post_appreciations', 'community_saved_posts', 'community_followed_posts', 'community_post_reports']::text[],
        array['create_structured_community_post', 'create_community_comment', 'delete_community_comment', 'list_community_conversation_page']::text[],
        110
      ),
      (
        'community_member_experience',
        'Community',
        'Community identity and member updates',
        'Private branding, attachments, post editing, read state and global activity.',
        '20260802130000_community_activity_navigation.sql',
        array['community_media_assets', 'community_post_revisions', 'community_member_read_states']::text[],
        array['list_community_brand_identities', 'edit_community_post', 'mark_community_caught_up', 'list_my_community_activity']::text[],
        120
      ),
      (
        'community_programmes',
        'Community',
        'Community events, learning and member health',
        'Community-linked events, learning, notification choices and privacy-safe health totals.',
        '20260731160000_community_member_start_path.sql',
        array['community_event_links', 'community_course_links', 'community_notification_preferences', 'community_briefing_batches']::text[],
        array['list_community_programming_options', 'queue_community_weekly_briefings', 'get_community_continuity_summary', 'get_my_community_start_path']::text[],
        130
      ),
      (
        'community_release',
        'Community',
        'Community applications and opening checks',
        'Leader applications, private setup and database-enforced opening approval.',
        '20260801170000_community_host_applications.sql',
        array['community_host_applications', 'community_release_checks']::text[],
        array['review_community_host_application', 'community_release_ready', 'publish_community_after_acceptance']::text[],
        140
      ),
      (
        'community_commerce',
        'Community',
        'Community plans, payments and earnings',
        'Host plans, paid memberships, financial review, statements and payouts.',
        '20260801210000_community_host_plan_entitlements.sql',
        array['community_host_plans', 'community_host_subscriptions', 'community_offers', 'community_access_periods', 'community_financial_cases', 'community_settlement_batches']::text[],
        array['get_community_host_capabilities', 'create_community_order', 'process_community_financial_webhook', 'list_community_financial_statement']::text[],
        150
      ),
      (
        'community_circles',
        'Community',
        'Community-linked Circles',
        'Leader-selected Circle programmes with member-only assignment details.',
        '20260802210000_community_circle_links.sql',
        array['community_circle_cycle_links']::text[],
        array['list_community_circle_programs', 'list_community_circle_options']::text[],
        160
      ),
      (
        'learning',
        'Member programmes',
        'Learning',
        'Courses, lessons, enrolment, progress and paid access.',
        '20260725130000_learning_foundation.sql',
        array['courses', 'course_lessons', 'course_enrollments', 'lesson_progress']::text[],
        array['list_courses', 'create_course_order', 'fulfill_course_order']::text[],
        200
      ),
      (
        'referrals',
        'Member programmes',
        'Referrals',
        'Vouched invitations, review and controlled member activation.',
        '20260725170000_referrals_vouched_invitations.sql',
        array['referral_campaigns', 'referral_codes', 'referral_invitations']::text[],
        array['create_vouched_referral', 'list_referrals_admin']::text[],
        210
      ),
      (
        'membership',
        'Member programmes',
        'Membership and renewal',
        'Membership plans, manual or online payment, renewal, grace and expiry.',
        '20260725210000_membership_renewal_lifecycle.sql',
        array['membership_plans', 'membership_periods']::text[],
        array['create_membership_order', 'fulfill_membership_order', 'reconcile_membership_periods']::text[],
        220
      ),
      (
        'circles',
        'Member programmes',
        'Circles',
        'Opt-in, deterministic matching, reviewed groups and private prompts.',
        '20260726090000_circles_deterministic_matching.sql',
        array['circle_cycles', 'circle_opt_ins', 'circles', 'circle_memberships', 'circle_prompts']::text[],
        array['run_circle_matching', 'publish_circle_cycle', 'list_my_circles']::text[],
        230
      ),
      (
        'perks',
        'Member programmes',
        'Partner perks',
        'Approved partners, controlled inventory and verified redemption.',
        '20260726130000_partner_perks_redemption.sql',
        array['partners', 'partner_perks']::text[],
        array['list_partner_perks', 'expire_perk_redemptions']::text[],
        240
      ),
      (
        'release_controls',
        'Operations',
        'Analytics and launch controls',
        'Privacy-safe metrics, release targets and auditable launch evidence.',
        '20260728130000_launch_gate_evidence.sql',
        array['product_events', 'launch_readiness_targets', 'launch_gate_checks']::text[],
        array['get_product_analytics', 'get_launch_readiness_metrics', 'list_launch_gate_checks']::text[],
        300
      )
  ),
  evaluated as (
    select
      manifest.*,
      array(
        select 'table: ' || table_name
        from unnest(manifest.table_names) table_name
        where to_regclass('public.' || table_name) is null
        union all
        select 'function: ' || function_name
        from unnest(manifest.function_names) function_name
        where not exists (
          select 1
          from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname = function_name
        )
      ) as missing_items
    from manifest
  )
  select
    evaluated.module_key,
    evaluated.area,
    evaluated.label,
    cardinality(evaluated.missing_items) = 0,
    evaluated.summary,
    evaluated.migration_file,
    evaluated.missing_items,
    evaluated.sort_order
  from evaluated
  order by evaluated.sort_order;
end;
$$;

revoke all on function public.list_database_release_readiness() from public;
grant execute on function public.list_database_release_readiness()
  to authenticated;

comment on function public.list_database_release_readiness is
  'Super Admin-only release manifest that verifies required public tables and functions without exposing data or credentials.';

commit;
