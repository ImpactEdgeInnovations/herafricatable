begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select ok(
  (select guidance not ilike '%six-digit%' from public.launch_gate_checks
   where check_key = 'member_email_otp'),
  'member OTP launch gate does not assume a fixed six-digit code'
);
select ok(
  (select guidance ilike '%configured length%' from public.launch_gate_checks
   where check_key = 'member_email_otp'),
  'member OTP launch gate directs testing to the configured code length'
);

select * from finish();
rollback;
