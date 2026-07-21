# Her Africa Table — Production Release Checklist

## Source and deployment

- [ ] Intended commit is reviewed and present on `main`
- [ ] Vercel build, typecheck and automated tests pass
- [ ] Preview deployment was tested before merge
- [ ] Production points to the intended commit
- [ ] No secret or `.env.local` file is tracked by Git
- [ ] Production and Preview environment scopes contain the correct values
- [ ] Custom domain, HTTPS and canonical URL are correct
- [ ] Rollback commit/deployment is identified

## Supabase and database

- [ ] Production uses a dedicated Supabase project
- [ ] All database changes exist as committed migrations
- [ ] Migrations were rehearsed against non-production data
- [ ] RLS is enabled on every exposed table and Storage bucket
- [ ] Anonymous/member/admin/moderator/event-staff boundary tests pass
- [ ] Foreign keys, uniqueness constraints and policy indexes are present
- [ ] Seed/test data is absent or explicitly excluded from analytics
- [ ] Backup exists and restore procedure has been rehearsed

## Authentication and membership

- [ ] Production Site URL and redirect allow list are exact
- [ ] Localhost, Preview and Production callbacks work
- [ ] Email OTP template, sender branding and delivery configuration are production-ready
- [ ] Email OTP uses production sender configuration
- [ ] OTP and authentication endpoints are rate-limited
- [ ] Authenticated pending users cannot access member data
- [ ] Active/dormant/suspended/deleted state tests pass
- [ ] First Super Admin and scoped staff accounts are verified

## Payments and registration

- [ ] Admin can select automatic, manual review or closed mode
- [ ] Paystack live/test keys are in the correct environment scope
- [ ] Webhook signature and replay/idempotency tests pass
- [ ] Callback pages never grant payment status
- [ ] Manual approval captures reviewer, reference, notes and time
- [ ] Duplicate payment/entitlement protection passes
- [ ] Reconciliation, refund and cancellation runbooks are available
- [ ] Real low-value end-to-end payment has been reconciled before public sale

## Privacy, trust and safety

- [ ] Public/private profile fields were tested with unrelated accounts
- [ ] Pause visibility and blocking take effect immediately
- [ ] Report actions exist on profiles, messages and posts
- [ ] Moderator content access is report-scoped and audited
- [ ] Terms, Privacy Notice and Community Guidelines are versioned
- [ ] Consent records store accepted document versions and timestamps
- [ ] Account export and deletion were tested
- [ ] Retention rules and legal-review actions are documented
- [ ] Support and safety escalation owners are on duty

## Product and content

- [ ] First event, programme, menu, speakers, sponsors and gallery are accurate
- [ ] Draft content is not visible to members
- [ ] Ticket capacity, currency, dates, timezone and venue are verified
- [ ] Empty/loading/error states teach the user what to do
- [ ] Notification copy, links and preferences were tested
- [ ] Feature flags expose only modules that passed their acceptance gate

## Quality

- [ ] Latest iOS Safari and Android Chrome pass core journeys
- [ ] Desktop Chrome/Safari/Firefox pass critical admin journeys
- [ ] Keyboard-only and screen-reader checks pass
- [ ] Contrast, focus and 44px touch targets pass
- [ ] QR camera permission denied path falls back to manual code
- [ ] Slow-network, offline/retry and duplicate-submit tests pass
- [ ] Directory, messages and admin lists paginate
- [ ] Performance and image/media budgets pass

## Observability and operations

- [ ] Application errors and critical auth/payment failures alert an owner
- [ ] Health check and synthetic registration/sign-in checks are active
- [ ] Logs exclude OTPs, secrets, private messages and unnecessary personal data
- [ ] Notification delivery/bounce logs are visible to support
- [ ] Payment and entitlement events are traceable by correlation ID
- [ ] Incident, moderation, support and payment runbooks are accessible
- [ ] Launch-day monitoring window and rollback authority are agreed

## Go/no-go

- [ ] Product owner sign-off
- [ ] Engineering/security sign-off
- [ ] Operations/support sign-off
- [ ] Legal/privacy launch conditions recorded
- [ ] Production backup captured
- [ ] P0 feature flags enabled deliberately
- [ ] Smoke test completed after deployment
