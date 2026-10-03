begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, email_confirmed_at
) values (
  '20000000-0000-4000-8000-000000000020', 'launch-admin@test.invalid',
  'authenticated', 'authenticated', '{}', '{}', now()
);
insert into public.user_roles (user_id, role, granted_by) values (
  '20000000-0000-4000-8000-000000000020', 'super_admin',
  '20000000-0000-4000-8000-000000000020'
);
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000020', true);

select throws_ok(
  $$select public.save_launch_gate_check('launch_signoff', 'passed', 'Product owner', 'All release owners approve the controlled pilot.')$$,
  'P0001', 'Complete every required launch check before final sign-off',
  'final sign-off refuses outstanding required checks'
);
select is(
  (select status from public.launch_gate_checks where check_key = 'launch_signoff'),
  'not_started', 'failed sign-off makes no state change'
);

-- Disposable fixture: simulate independent evidence already recorded for the
-- other required checks without claiming that production has this evidence.
update public.launch_gate_checks
set status = 'passed', owner_label = 'Test owner',
    evidence_note = 'Isolated test evidence for this required launch check.',
    verified_by = '20000000-0000-4000-8000-000000000020',
    verified_at = now()
where required and check_key <> 'launch_signoff';

select throws_ok(
  $$select public.save_launch_gate_check('launch_signoff', 'passed', null, 'All release owners approve the controlled pilot.')$$,
  'P0001', 'Name the accountable launch owner',
  'final sign-off needs an accountable owner'
);
update public.launch_gate_checks set verified_at = null
where check_key = 'member_email_otp';
select throws_ok(
  $$select public.save_launch_gate_check('launch_signoff', 'passed', 'Product owner', 'All release owners approve the controlled pilot.')$$,
  'P0001', 'Complete every required launch check before final sign-off',
  'a passed label without verification does not count as evidence'
);
update public.launch_gate_checks set verified_at = now()
where check_key = 'member_email_otp';

select lives_ok(
  $$select public.save_launch_gate_check('launch_signoff', 'passed', 'Product owner', 'All release owners approve the controlled pilot.')$$,
  'final sign-off accepts complete required evidence'
);
select is(
  (select status from public.launch_gate_checks where check_key = 'launch_signoff'),
  'passed', 'final sign-off is recorded'
);
select lives_ok(
  $$select public.save_launch_gate_check('member_email_otp', 'blocked', 'Operations lead', 'A fresh production OTP failed after prior approval.')$$,
  'an urgent required check can be blocked after sign-off'
);
select is(
  (select status from public.launch_gate_checks where check_key = 'launch_signoff'),
  'in_progress', 'a regression automatically reopens final sign-off'
);
select ok(
  (select verified_at is null from public.launch_gate_checks where check_key = 'launch_signoff'),
  'the old sign-off verification no longer counts'
);
select throws_ok(
  $$select public.save_launch_gate_check('launch_signoff', 'passed', 'Product owner', 'All release owners approve the controlled pilot.')$$,
  'P0001', 'Complete every required launch check before final sign-off',
  'sign-off cannot be repeated while a required check is blocked'
);
select lives_ok(
  $$select public.save_launch_gate_check('member_email_otp', 'passed', 'Operations lead', 'Fresh production OTP was received, verified and expiry was checked.')$$,
  'the failed required check can be restored with new evidence'
);
select lives_ok(
  $$select public.save_launch_gate_check('launch_signoff', 'passed', 'Product owner', 'All release owners reapproved the controlled pilot after OTP recovery.')$$,
  'owner can sign off again after the regression is resolved'
);
select is(
  (select status from public.launch_gate_checks where check_key = 'launch_signoff'),
  'passed', 'renewed sign-off is explicit'
);
select is(
  (select count(*) from public.audit_events where action = 'launch.signoff_reopened'),
  1::bigint, 'automatic sign-off reopening is audited once'
);

select * from finish();
rollback;
