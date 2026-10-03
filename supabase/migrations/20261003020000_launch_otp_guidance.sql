begin;

-- Supabase's configured email code length may be six or eight digits. The
-- release gate must test the real configured journey, not an obsolete length.
update public.launch_gate_checks
set guidance = 'Request, receive and verify the production email sign-in code using a real member inbox. Confirm its configured length, expiry and invalid-code recovery.',
    updated_at = now()
where check_key = 'member_email_otp'
  and guidance is distinct from 'Request, receive and verify the production email sign-in code using a real member inbox. Confirm its configured length, expiry and invalid-code recovery.';

commit;
