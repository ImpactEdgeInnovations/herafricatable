begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('e0000000-0000-4000-8000-000000000001', 'bridge-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('e0000000-0000-4000-8000-000000000002', 'bridge-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('e0000000-0000-4000-8000-000000000003', 'bridge-guest@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('e0000000-0000-4000-8000-000000000004', 'bridge-other@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002');
update public.profiles set is_test_account = true
where id = 'e0000000-0000-4000-8000-000000000003';
insert into public.user_roles(user_id, role)
values ('e0000000-0000-4000-8000-000000000001', 'super_admin');

insert into public.events(id, slug, title, format, audience, status, starts_at, ends_at, registration_mode)
values ('e1000000-0000-4000-8000-000000000001', 'bridge-event-test',
  'Bridge Event Test', 'virtual', 'public', 'completed',
  now() - interval '2 days', now() - interval '1 day', 'closed');
insert into public.event_memberships(event_id, user_id, status, confirmed_at)
values
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'attended', now() - interval '1 day'),
  ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004', 'confirmed', now() - interval '1 day');
insert into public.member_event_proposals(
  id, proposed_by, title, summary, format, starts_at, ends_at, timezone,
  online_url, capacity, safety_contact_name, safety_contact_phone,
  host_experience, community_after_event, community_idea, status,
  canonical_event_id
) values (
  'e2000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000002',
  'Bridge Event Test',
  'A completed public gathering with an optional follow-up Community for guests.',
  'virtual', now() - interval '2 days', now() - interval '1 day',
  'Africa/Nairobi', 'https://meet.example.test/bridge', 20,
  'Safety Lead', '+254700000099',
  'Hosted a small gathering with clear participant boundaries.',
  true, 'A carefully reviewed Community for people who attended this event.',
  'approved', 'e1000000-0000-4000-8000-000000000001'
);
insert into public.communities(id, slug, name, description, community_type, status, created_by)
values ('e3000000-0000-4000-8000-000000000001', 'bridge-community-test',
  'Bridge Community Test', 'A private follow-up Community for people who met at the event.',
  'private', 'draft', 'e0000000-0000-4000-8000-000000000002');
insert into public.event_community_continuations(event_id, community_id, linked_by)
values ('e1000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000003', true);
select is(public.can_leave_event_feedback('e1000000-0000-4000-8000-000000000001'), false,
  'a guest without event entitlement cannot leave feedback');

set local role postgres;
insert into public.orders(id, user_id, event_id, status, processing_mode, currency, subtotal_minor, total_minor)
values ('e4000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000003',
  'e1000000-0000-4000-8000-000000000001', 'fulfilled', 'manual_review', 'KES', 0, 0);
insert into public.entitlements(user_id, event_id, order_id, entitlement_type)
values ('e0000000-0000-4000-8000-000000000003',
  'e1000000-0000-4000-8000-000000000001',
  'e4000000-0000-4000-8000-000000000001', 'event_access');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000003', true);
select ok(public.can_leave_event_feedback('e1000000-0000-4000-8000-000000000001'),
  'the entitled guest retains private post-event feedback');
select lives_ok(
  $$select public.set_my_event_follow_up_interest('e1000000-0000-4000-8000-000000000001', true)$$,
  'guest explicitly opts in to follow-up');
set local role postgres;
select is((select count(*) from public.event_follow_up_invitation_links), 0::bigint,
  'opting in alone does not issue an invitation');
set local role authenticated;
select throws_ok(
  $$select * from public.list_event_follow_up_candidates_admin()$$,
  'P0001', 'Super Admin required',
  'a guest cannot read the private invitation queue');

select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select * from public.list_event_follow_up_candidates_admin()$$,
  'P0001', 'Super Admin required',
  'the Event Host cannot see guest identities in the Admin queue');
select throws_ok(
  $$select public.invite_event_follow_up_guest('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Super Admin required',
  'the Event Host cannot send Admin invitations');

select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.list_event_follow_up_candidates_admin()), 1::bigint,
  'only the opted-in eligible attendee enters the Admin queue');
select is((select is_test_account from public.list_event_follow_up_candidates_admin()),
  true, 'the Admin can see when a consenting guest is a rehearsal account');
select is((select community_id from public.list_event_follow_up_candidates_admin()),
  'e3000000-0000-4000-8000-000000000001'::uuid,
  'Admin can see the linked Community even while draft');
select is((select community_name from public.list_event_follow_up_candidates_admin()),
  null::text, 'a draft Community is not invitation-ready');
select throws_ok(
  $$select public.invite_event_follow_up_guest('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003')$$,
  'P0001', 'Approve and publish the follow-up Community first',
  'Admin cannot invite into an unpublished Community');

set local role postgres;
update public.communities set status = 'published'
where id = 'e3000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.invite_event_follow_up_guest('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003')$$,
  'Admin queues a reviewed private Community invitation');
select is((select count(*) from public.table_invitations invitation
  where invitation.invitee_user_id = 'e0000000-0000-4000-8000-000000000003'
    and invitation.status = 'sent' and invitation.token_hash is not null),
  1::bigint, 'the invitation has a protected bearer token');
select is((select count(*) from public.notification_jobs job
  where job.user_id = 'e0000000-0000-4000-8000-000000000003'
    and job.template_key = 'table_invitation' and job.status = 'queued'),
  1::bigint, 'the existing email engine receives one delivery job');
select is((select count(*) from public.community_memberships membership
  where membership.user_id = 'e0000000-0000-4000-8000-000000000003'),
  0::bigint, 'invitation never silently adds a guest to a Community');
select throws_ok(
  $$select public.invite_event_follow_up_guest('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003')$$,
  'P0001', 'An invitation to this Community is already open',
  'duplicate follow-up delivery is blocked');
select throws_ok(
  $$select public.invite_event_follow_up_guest('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000004')$$,
  'P0001', 'This attendee has no current follow-up request',
  'attendance without opt-in never authorises a Community invitation');

select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000003', true);
select lives_ok(
  $$select public.set_my_event_follow_up_interest('e1000000-0000-4000-8000-000000000001', false)$$,
  'guest can withdraw her interest while her event pass is active');
select is((select count(*) from public.table_invitations invitation
  where invitation.invitee_user_id = auth.uid() and invitation.status = 'revoked'
    and invitation.token_hash is null),
  1::bigint, 'withdrawal closes the event-specific unused invitation');
select is((select count(*) from public.notification_jobs job
  where job.user_id = auth.uid() and job.status = 'suppressed'),
  1::bigint, 'withdrawal suppresses the unsent email job');
select lives_ok(
  $$select public.set_my_event_follow_up_interest('e1000000-0000-4000-8000-000000000001', true)$$,
  'guest may choose to hear about the Community again');
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.invite_event_follow_up_guest('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000003')$$,
  'Admin may send a new invitation after fresh consent');

set local role postgres;
update public.entitlements set status = 'revoked', revoked_at = now()
where user_id = 'e0000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000003', true);
select is(public.can_leave_event_feedback('e1000000-0000-4000-8000-000000000001'), false,
  'revoked event entitlement closes new guest feedback access');
select is((select count(*) from public.table_invitations invitation
  where invitation.invitee_user_id = auth.uid() and invitation.status = 'revoked'
    and invitation.token_hash is null),
  2::bigint, 'revoking event access invalidates a later unused invitation');
select is((select count(*) from public.notification_jobs job
  where job.user_id = auth.uid() and job.status = 'suppressed'),
  2::bigint, 'revoking event access suppresses its later unsent email');
select lives_ok(
  $$select public.set_my_event_follow_up_interest('e1000000-0000-4000-8000-000000000001', false)$$,
  'guest can withdraw an existing choice even after entitlement revocation');

select * from finish();
rollback;
