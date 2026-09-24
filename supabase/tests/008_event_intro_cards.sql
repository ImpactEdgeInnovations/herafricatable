-- Isolated pgTAP only. Never paste this fixture into the live SQL Editor.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id,email,aud,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at)
values
  ('e0000000-0000-4000-8000-000000000021','intro-admin@test.invalid','authenticated','authenticated','{}','{}',now()),
  ('e0000000-0000-4000-8000-000000000022','intro-member@test.invalid','authenticated','authenticated','{}','{}',now()),
  ('e0000000-0000-4000-8000-000000000023','intro-guest@test.invalid','authenticated','authenticated','{}','{}',now()),
  ('e0000000-0000-4000-8000-000000000024','intro-outsider@test.invalid','authenticated','authenticated','{}','{}',now());
update public.profiles set access_status = 'active', display_name = 'Intro Member'
where id = 'e0000000-0000-4000-8000-000000000022';
update public.profiles set access_status = 'pending', display_name = 'Intro Guest'
where id = 'e0000000-0000-4000-8000-000000000023';
insert into public.user_roles(user_id,role,granted_by)
values ('e0000000-0000-4000-8000-000000000021','super_admin',
        'e0000000-0000-4000-8000-000000000021');
insert into public.events(id,slug,title,format,audience,status,starts_at,ends_at,registration_mode,created_by)
values ('e1000000-0000-4000-8000-000000000021','intro-card-test','Introduction Card Test',
        'virtual','public','published',now()+interval '10 days',now()+interval '10 days 2 hours',
        'manual_review','e0000000-0000-4000-8000-000000000021');
insert into public.event_memberships(event_id,user_id,status)
values
  ('e1000000-0000-4000-8000-000000000021','e0000000-0000-4000-8000-000000000022','confirmed'),
  ('e1000000-0000-4000-8000-000000000021','e0000000-0000-4000-8000-000000000023','confirmed');
select is(
  public.can_use_event_intro('e1000000-0000-4000-8000-000000000021',
    'e0000000-0000-4000-8000-000000000022'),
  false,'Event introductions start closed even for confirmed guests'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000021',true);
select lives_ok(
  $$select public.set_event_intro_enabled('e1000000-0000-4000-8000-000000000021',true)$$,
  'Super Admin deliberately opens introductions for this event'
);
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000023',true);
select lives_ok(
  $$select public.save_event_intro_card('e1000000-0000-4000-8000-000000000021',true,
    'I would love to meet other regional trade founders.',false)$$,
  'A confirmed event-only guest may opt in without member-network access'
);
select set_config('test.intro_code',
  (select code from public.event_intro_cards
   where user_id = 'e0000000-0000-4000-8000-000000000023'),true);
select is(
  (select enabled from public.get_my_event_intro_card('e1000000-0000-4000-8000-000000000021')),
  true,'The guest reads her own card'
);

select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000024',true);
select throws_ok(
  $$select * from public.resolve_event_intro_card(
    'e1000000-0000-4000-8000-000000000021',current_setting('test.intro_code'))$$,
  'P0001','A confirmed event place is required',
  'A visitor without a place cannot resolve a code'
);

select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000022',true);
select is(
  (select display_name from public.resolve_event_intro_card(
    'e1000000-0000-4000-8000-000000000021',current_setting('test.intro_code'))),
  'Intro Guest','A confirmed member sees only the opted-in guest introduction'
);
select lives_ok(
  $$select public.request_event_intro(
    'e1000000-0000-4000-8000-000000000021',current_setting('test.intro_code'))$$,
  'The member requests an event-scoped introduction'
);
select throws_ok(
  $$select public.review_event_intro(
    (select request_id from public.list_my_event_intros('e1000000-0000-4000-8000-000000000021')),
    'accept')$$,
  'P0001','Only the recipient can decide',
  'The requester cannot accept on someone else’s behalf'
);

select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000023',true);
select lives_ok(
  $$select public.review_event_intro(
    (select request_id from public.list_my_event_intros('e1000000-0000-4000-8000-000000000021')),
    'accept')$$,
  'Only the recipient chooses to accept'
);
select lives_ok(
  $$select public.save_event_intro_card('e1000000-0000-4000-8000-000000000021',false,
    'I would love to meet other regional trade founders.',false)$$,
  'The guest can hide her card again'
);
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000022',true);
select is(
  (select count(*)::integer from public.resolve_event_intro_card(
    'e1000000-0000-4000-8000-000000000021',current_setting('test.intro_code'))),
  0,'Opting out closes the QR and manual code immediately'
);
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000021',true);
select lives_ok(
  $$select public.close_event_intro_card('e1000000-0000-4000-8000-000000000021',
    'e0000000-0000-4000-8000-000000000023','Safety concern requires review')$$,
  'The event team can pause a card without touching the entry pass'
);
select set_config('request.jwt.claim.sub','e0000000-0000-4000-8000-000000000023',true);
select throws_ok(
  $$select public.save_event_intro_card('e1000000-0000-4000-8000-000000000021',true,
    'I would love to meet other regional trade founders.',false)$$,
  'P0001','The event team has paused this introduction card',
  'A paused guest cannot turn her QR back on without Admin restoration'
);

select * from finish();
rollback;
