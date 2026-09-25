begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users(id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at)
values ('e0000000-0000-4000-8000-000000000001', 'guide-referrals@test.invalid',
        'authenticated', 'authenticated', '{}', '{}', now());
update public.profiles set access_status = 'active'
where id = 'e0000000-0000-4000-8000-000000000001';
update public.feature_flags set enabled = true where key = 'table_guide';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.record_table_guide_usage('success', 'referrals', 24, 60, 'test-model')$$,
  'referral guidance records normal usage instead of a provider error'
);
select is(
  (select count(*) from public.table_guide_usage
   where user_id = auth.uid() and category = 'referrals' and status = 'success'),
  1::bigint,
  'the member sees the referral usage record'
);
select lives_ok(
  $$select public.record_table_guide_feedback('referrals', true)$$,
  'referral guidance accepts a usefulness response'
);
select is(
  (select count(*) from public.table_guide_feedback
   where user_id = auth.uid() and category = 'referrals' and helpful),
  1::bigint,
  'the member sees the referral feedback record'
);
select throws_ok(
  $$select public.record_table_guide_usage('success', 'private_messages', 8, 8, null)$$,
  'P0001', 'Unsupported Table Guide category',
  'unknown usage categories remain rejected'
);
select throws_ok(
  $$select public.record_table_guide_feedback('private_messages', true)$$,
  'P0001', 'Unsupported Table Guide category',
  'unknown feedback categories remain rejected'
);

select * from finish();
rollback;
