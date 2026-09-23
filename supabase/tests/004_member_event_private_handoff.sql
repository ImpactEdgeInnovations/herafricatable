begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('c0000000-0000-4000-8000-000000000001', 'handoff-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('c0000000-0000-4000-8000-000000000002', 'handoff-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002');
insert into public.user_roles(user_id, role, granted_by)
values ('c0000000-0000-4000-8000-000000000001', 'super_admin', 'c0000000-0000-4000-8000-000000000001');

insert into public.member_event_proposals(
  id, proposed_by, title, summary, format, starts_at, ends_at, timezone,
  online_url, capacity, safety_contact_name, safety_contact_phone,
  host_experience, status, submitted_at
) values (
  'c1000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000002',
  'Private Handoff Test',
  'A useful free gathering for members and event-only guests to meet safely.',
  'virtual', now() + interval '12 days', now() + interval '12 days 2 hours',
  'Africa/Nairobi', 'https://meet.example.test/private', 25,
  'Event Safety Lead', '+254700000000',
  'I have hosted several small gatherings with a clear safety contact.',
  'submitted', now()
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000001', true);
select ok(public.member_event_host_handoff_ready(), 'private Host handoff migration is installed');
select lives_ok(
  $$select public.review_member_event_proposal('c1000000-0000-4000-8000-000000000001', 'approve', 'A suitable pilot event.')$$,
  'Admin can approve the idea into a private canonical event'
);
select is(
  (select event.status from public.member_event_proposals proposal
   join public.events event on event.id = proposal.canonical_event_id
   where proposal.id = 'c1000000-0000-4000-8000-000000000001'),
  'draft', 'approved idea does not publish the event'
);
select is(
  (select ticket.status from public.member_event_proposals proposal
   join public.ticket_types ticket on ticket.event_id = proposal.canonical_event_id
   where proposal.id = 'c1000000-0000-4000-8000-000000000001'),
  'draft', 'free places are not sold before final review'
);
select is(
  (select host.user_id from public.member_event_proposals proposal
   join public.event_hosts host on host.event_id = proposal.canonical_event_id
   where proposal.id = 'c1000000-0000-4000-8000-000000000001'),
  'c0000000-0000-4000-8000-000000000002'::uuid,
  'the proposing member gets scoped Host access'
);

select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from public.get_my_event_host_workspace(
    (select event.slug from public.events event
     join public.member_event_proposals proposal on proposal.canonical_event_id = event.id
     where proposal.id = 'c1000000-0000-4000-8000-000000000001'))),
  1::bigint, 'the Host can open the private workspace'
);

select * from finish();
rollback;
