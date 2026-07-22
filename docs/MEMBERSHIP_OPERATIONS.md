# Membership Operations

Account membership is deployed behind the `memberships` feature flag. Keep the flag
disabled until the migration, plans, manual-review journey, Paystack journey and
lifecycle reconciliation have passed acceptance testing.

## Operating model

- Plans define price in minor units, currency, term length, grace period and one of
  `automatic`, `manual_review` or `closed` payment modes.
- A verified Paystack payment or audited Super Admin approval calls the same
  idempotent fulfillment function.
- A renewal begins after the latest active/grace/scheduled period. Per-member advisory
  locking prevents concurrent grants from overlapping.
- Scheduled periods become active, expired terms enter grace, and members become
  dormant only after grace ends. Tagged test identities are excluded from automatic
  dormancy and operational member metrics.
- A paid but incomplete profile remains in onboarding; payment never bypasses required
  profile and consent completion.

## Safe acceptance sequence

1. Apply `20260725210000_membership_renewal_lifecycle.sql` in Supabase.
2. In Admin → Memberships, create a draft plan and choose `manual_review` first.
3. Use the test-identity form with an address ending in `.invalid` and a unique
   12-character temporary password. Never use a real person's email for test data.
4. Grant that identity a membership, confirm it appears as `TEST` in the ledger, then
   exercise renewal and reconciliation.
5. Publish the plan, enable the feature flag, submit a manual payment from the member
   experience, and approve/reject it from Admin.
6. Change the plan to `automatic` only after Paystack credentials and webhook
   verification have passed. Confirm amount/currency mismatch and replay tests.
7. Run `reconcile_membership_periods()` daily and review the audit event.

The dummy-user endpoint is Super Admin-only, accepts only the reserved `.invalid`
domain, does not return or log passwords, and deletes the auth identity if profile
tagging fails.
