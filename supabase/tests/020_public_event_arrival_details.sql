begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.venues(id, name, city, country)
values ('ab000000-0000-4000-8000-000000000001', 'Shared Cafe Brand', 'Nairobi', 'Kenya');
insert into public.events(id, slug, title, format, audience, status, venue_id,
  starts_at, ends_at, registration_mode)
values ('ab000000-0000-4000-8000-000000000002', 'arrival-detail-test',
  'Arrival Detail Test', 'in_person', 'public', 'draft',
  'ab000000-0000-4000-8000-000000000001',
  now() + interval '10 days', now() + interval '10 days 2 hours', 'manual_review');

select ok(public.event_arrival_details_guard_ready(),
  'both arrival-detail triggers are installed');
select throws_ok(
  $$update public.events set status = 'published'
    where id = 'ab000000-0000-4000-8000-000000000002'$$,
  'P0001', 'Add the exact venue address or map link before publishing',
  'direct event publication cannot bypass exact arrival details'
);
select lives_ok(
  $$update public.venues set address_line = 'Example Road, Nairobi'
    where id = 'ab000000-0000-4000-8000-000000000001'$$,
  'a private draft venue can gain an exact address'
);
select lives_ok(
  $$update public.events set status = 'published'
    where id = 'ab000000-0000-4000-8000-000000000002'$$,
  'publication works after an arrival address is set'
);
select throws_ok(
  $$update public.venues set address_line = null, map_url = null
    where id = 'ab000000-0000-4000-8000-000000000001'$$,
  'P0001', 'Keep an exact address or map link while this event is public',
  'venue edits cannot erase public arrival details'
);
select lives_ok(
  $$update public.venues set address_line = null,
      map_url = 'https://maps.example.test/exact-door'
    where id = 'ab000000-0000-4000-8000-000000000001'$$,
  'a precise map link may replace the written address'
);
select lives_ok(
  $$insert into public.events(slug, title, format, audience, status,
    starts_at, ends_at, registration_mode)
    values ('arrival-virtual-test', 'Virtual Arrival Test', 'virtual', 'public',
      'published', now() + interval '10 days', now() + interval '10 days 2 hours',
      'manual_review')$$,
  'virtual events do not need a physical address'
);

select * from finish();
rollback;
