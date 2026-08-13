# Referral launch runbook

## Release order

1. Apply `supabase/migrations/20260813120000_referral_launch_readiness.sql` in Supabase.
2. Deploy the matching application commit through Vercel.
3. Run `npm run ops:referrals:accept-launch` from the project workspace.
4. Confirm the output reports `ready: true` and the complete lifecycle:
   `pending_review → approved → claimed → activated`.
5. In Admin, open **Programmes → Vouched invitations** and confirm the
   **Thoughtful introductions** campaign is active.

## What the release proves

- Only active members can submit a vouch.
- Every vouch waits for Super Admin approval.
- Approval creates a 30-day invitation and a targeted Resend job.
- The invitation is bound to the recipient's authenticated email.
- Manual membership approval advances referral tracking to `claimed`.
- Completing onboarding advances referral tracking to `activated`.
- The applicant sees verified invitation context without retyping it.
- Test identities and test referral records are removed after acceptance.

## Safe operating controls

- Five introductions per member under the launch campaign.
- 500 total invitations before the campaign must be reviewed or replaced.
- Admin can pause the referral feature, pause the campaign, decline a vouch or
  revoke an unused invitation.
- Referral approval does not bypass the platform membership application.
- Email failures remain visible under **Admin → Message delivery** and can be
  retried without issuing a second invitation.
