begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('f0000000-0000-4000-8000-000000000001', 'follow-up-guest@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('f0000000-0000-4000-8000-000000000002', 'follow-up-member@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('f0000000-0000-4000-8000-000000000003', 'follow-up-other@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set display_name = 'Guest Test' where id = 'f0000000-0000-4000-8000-000000000001';
update public.profiles set access_status = 'active' where id = 'f0000000-0000-4000-8000-000000000002';

insert into public.events(id, slug, title, format, audience, status, starts_at, ends_at, registration_mode)
values
  ('f1000000-0000-4000-8000-000000000001', 'public-follow-up-test', 'Public Follow-up Test', 'virtual', 'public', 'completed', now() - interval '2 days', now() - interval '1 day', 'closed'),
  ('f1000000-0000-4000-8000-000000000002', 'private-follow-up-test', 'Private Follow-up Test', 'virtual', 'community', 'completed', now() - interval '2 days', now() - interval '1 day', 'closed'),
  ('f1000000-0000-4000-8000-000000000003', 'future-follow-up-test', 'Future Follow-up Test', 'virtual', 'public', 'published', now() + interval '1 day', now() + interval '1 day 2 hours', 'closed');
insert into public.event_memberships(event_id, user_id, status, confirmed_at)
values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'attended', now() - interval '1 day'),
  ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'confirmed', now() - interval '1 day'),
  ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'attended', now() - interval '1 day'),
  ('f1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'confirmed', now());
insert into public.member_event_proposals(
  id, proposed_by, title, summary, format, starts_at, ends_at, timezone,
  online_url,
  capacity, safety_contact_name, safety_contact_phone, host_experience,
  community_after_event, community_idea, status, canonical_event_id
) values (
  'f2000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000002',
  'Public Follow-up Test',
  'A public event whose guests may choose whether to hear about a future Community.',
  'virtual', now() - interval '2 days', now() - interval '1 day',
  'Africa/Nairobi', 'https://meet.example.test/follow-up',
  20, 'Safety Lead', '+254700000088',
  'Hosted a small gathering with clear participant boundaries.',
  true, 'A carefully reviewed follow-up Community for past guests.',
  'approved', 'f1000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select is(public.can_leave_event_feedback('f1000000-0000-4000-8000-000000000001'), false,
  'an event-only guest needs the specific fulfilled entitlement');
select throws_ok(
  $$select public.save_event_feedback('f1000000-0000-4000-8000-000000000001', 5, 5, 5, true, 'A useful table.', 'More time for introductions.', null, 'none')$$,
  'P0001', 'Confirmed event attendance required',
  'attendance without guest entitlement cannot save feedback'
);

set local role postgres;
insert into public.orders(id, user_id, event_id, status, processing_mode, currency, subtotal_minor, total_minor)
values ('f3000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
        'f1000000-0000-4000-8000-000000000001', 'fulfilled', 'manual_review', 'KES', 0, 0);
insert into public.entitlements(user_id, event_id, order_id, entitlement_type)
values ('f0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001',
        'f3000000-0000-4000-8000-000000000001', 'event_access');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
select ok(public.can_leave_event_feedback('f1000000-0000-4000-8000-000000000001'),
  'the confirmed public-event guest may leave private feedback');
select lives_ok(
  $$select public.save_event_feedback('f1000000-0000-4000-8000-000000000001', 5, 4, 5, true, 'A useful table.', 'More time for introductions.', 'A warm table with thoughtful and practical exchanges.', 'anonymous')$$,
  'guest feedback and a separately consented quote save successfully'
);
select is((select count(*) from public.event_feedback where user_id = auth.uid()), 1::bigint,
  'guest sees only her own feedback');
select throws_ok(
  $$select * from public.list_event_attendee_directory('f1000000-0000-4000-8000-000000000001', 30, 0)$$,
  'P0001', 'Active visible membership required',
  'event-only feedback does not open the member directory'
);
select is((select available from public.get_my_event_follow_up_interest('f1000000-0000-4000-8000-000000000001')),
  true, 'a completed event still offers the optional Community follow-up choice');
select lives_ok(
  $$select public.set_my_event_follow_up_interest('f1000000-0000-4000-8000-000000000001', true)$$,
  'guest can ask to hear about a future Community'
);
select is((select access_status from public.profiles where id = auth.uid()), 'pending'::public.member_access_status,
  'follow-up interest never approves wider membership');
select is(public.can_leave_event_feedback('f1000000-0000-4000-8000-000000000002'), false,
  'event-only guest cannot use a private Community event for feedback');
select is(public.can_leave_event_feedback('f1000000-0000-4000-8000-000000000003'), false,
  'feedback does not open before the event ends');

set local role postgres;
update public.event_feedback set testimonial_status = 'approved'
where event_id = 'f1000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is((select attribution from public.list_event_testimonials('f1000000-0000-4000-8000-000000000001')),
  'Event guest', 'anonymous guest quote is not mislabelled as a member quote');

set local role postgres;
update public.entitlements set status = 'revoked', revoked_at = now()
where user_id = 'f0000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.can_leave_event_feedback('f1000000-0000-4000-8000-000000000001'), false,
  'revoked guest entitlement closes new feedback access');
select is((select available from public.get_my_event_follow_up_interest('f1000000-0000-4000-8000-000000000001')),
  false, 'revoked guest entitlement closes follow-up choices');

select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
select ok(public.can_leave_event_feedback('f1000000-0000-4000-8000-000000000002'),
  'an active member keeps feedback access for her private event');
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000003', true);
select is(public.can_leave_event_feedback('f1000000-0000-4000-8000-000000000001'), false,
  'unrelated pending account cannot use guest follow-up');
select throws_ok(
  $$select public.set_my_event_follow_up_interest('f1000000-0000-4000-8000-000000000001', true)$$,
  'P0001', 'A confirmed place at this event is required',
  'unrelated pending account cannot opt into the Community bridge'
);

select * from finish();
rollback;
