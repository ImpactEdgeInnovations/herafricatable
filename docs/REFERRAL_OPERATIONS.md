# Vouched invitation operations

Referrals are trust signals, not automatic membership approvals. The `referrals`
feature flag starts disabled and a member submission remains `pending_review` until a
Super Admin approves it.

## Release sequence

1. Apply `supabase/migrations/20260725170000_referrals_vouched_invitations.sql`.
2. Create a draft campaign with conservative per-member and total limits.
3. Confirm the production email worker and sender domain are healthy.
4. Test submission, duplicate email, member limit, approval, rejection, revocation,
   30-day expiry, authentication claim and completed-onboarding activation.
5. Activate the campaign, then enable Referrals after review staffing is confirmed.

Approval creates a normal `beta_invites` record and queues an invitation email. The
existing authentication trigger—not the referral page—matches the approved email and
grants onboarding eligibility. This preserves one access boundary for administrator,
event-payment and member-vouched invitations.

## Privacy and abuse controls

- The invitee email, relationship and vouch are visible only to the referrer and Super
  Admin review operation.
- Referral URLs contain only a random campaign/member code, never an email address.
- Existing accounts cannot be referred and each invitee email may have only one open
  invitation.
- Campaign limits and member limits are enforced inside the database transaction.
- Rejection and revocation require a reason and every decision is audited.
- Conversion attribution progresses from pending review to approved, claimed and
  activated; referral counts are not inferred from link clicks.
