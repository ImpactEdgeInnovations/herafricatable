-- Run only in an isolated pgTAP database. Never paste this fixture into the
-- production SQL Editor: it creates temporary users and an event.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values
  ('e0000000-0000-4000-8000-000000000011', 'cover-admin@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now()),
  ('e0000000-0000-4000-8000-000000000012', 'cover-host@test.invalid', 'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id in ('e0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000012');
insert into public.user_roles(user_id, role, granted_by)
values ('e0000000-0000-4000-8000-000000000011', 'super_admin', 'e0000000-0000-4000-8000-000000000011');
insert into public.events(id, slug, title, format, audience, status, starts_at, ends_at, registration_mode, created_by)
values ('e1000000-0000-4000-8000-000000000011', 'cover-review-test', 'Cover Review Test',
        'virtual', 'public', 'draft', now() + interval '10 days',
        now() + interval '10 days 2 hours', 'manual_review',
        'e0000000-0000-4000-8000-000000000011');
insert into public.event_hosts(event_id, user_id, assigned_by)
values ('e1000000-0000-4000-8000-000000000011',
        'e0000000-0000-4000-8000-000000000012',
        'e0000000-0000-4000-8000-000000000011');
insert into public.event_host_workspaces(event_id)
values ('e1000000-0000-4000-8000-000000000011');
insert into public.event_host_covers(event_id, draft_storage_path, draft_alt_text)
values ('e1000000-0000-4000-8000-000000000011',
        'e1000000-0000-4000-8000-000000000011/e0000000-0000-4000-8000-000000000012/first.jpg',
        'Women gathering around a table');

set local role anon;
select is(
  (select count(*)::integer from public.list_public_event_host_covers(
    array['e1000000-0000-4000-8000-000000000011']::uuid[])),
  0, 'A private draft has no public cover metadata'
);
select is(
  public.can_read_event_host_cover(
    'e1000000-0000-4000-8000-000000000011/e0000000-0000-4000-8000-000000000012/first.jpg'),
  false, 'A visitor cannot read the private image'
);

set local role postgres;
insert into public.event_safety_contacts(event_id, contact_name, contact_phone, updated_by)
values ('e1000000-0000-4000-8000-000000000011', 'Safety Lead', '+254700000001',
        'e0000000-0000-4000-8000-000000000011');
update public.events set status = 'published'
where id = 'e1000000-0000-4000-8000-000000000011';
update public.event_host_workspaces set status = 'submitted'
where event_id = 'e1000000-0000-4000-8000-000000000011';
update public.event_host_workspaces set status = 'approved'
where event_id = 'e1000000-0000-4000-8000-000000000011';

set local role anon;
select is(
  (select storage_path from public.list_public_event_host_covers(
    array['e1000000-0000-4000-8000-000000000011']::uuid[])),
  'e1000000-0000-4000-8000-000000000011/e0000000-0000-4000-8000-000000000012/first.jpg',
  'The approved cover becomes visible'
);
select is(
  public.can_read_event_host_cover(
    'e1000000-0000-4000-8000-000000000011/e0000000-0000-4000-8000-000000000012/first.jpg'),
  true, 'The approved image object is readable'
);

set local role postgres;
update public.event_host_covers
set draft_storage_path = 'e1000000-0000-4000-8000-000000000011/e0000000-0000-4000-8000-000000000012/replacement.jpg',
    draft_alt_text = 'A new gathering cover awaiting review'
where event_id = 'e1000000-0000-4000-8000-000000000011';
set local role anon;
select is(
  public.can_read_event_host_cover(
    'e1000000-0000-4000-8000-000000000011/e0000000-0000-4000-8000-000000000012/replacement.jpg'),
  false, 'A replacement stays private before review'
);
select is(
  (select storage_path from public.list_public_event_host_covers(
    array['e1000000-0000-4000-8000-000000000011']::uuid[])),
  'e1000000-0000-4000-8000-000000000011/e0000000-0000-4000-8000-000000000012/first.jpg',
  'The previous approved image remains live'
);

set local role postgres;
update public.event_host_workspaces
set status = 'submitted', arrival_info = 'Join at https://meet.google.com/secret'
where event_id = 'e1000000-0000-4000-8000-000000000011';
select throws_ok(
  $$update public.event_host_workspaces set status = 'approved'
    where event_id = 'e1000000-0000-4000-8000-000000000011'$$,
  'P0001', 'Remove links from public arrival notes; put private joining links in event details',
  'A Host cannot publish a private joining link in public arrival notes'
);

select * from finish();
rollback;
