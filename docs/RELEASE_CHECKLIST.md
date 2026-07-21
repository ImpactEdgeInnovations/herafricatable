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
- [ ] Paystack webhook URL is `/api/payments/paystack/webhook` on the canonical HTTPS domain
- [ ] Callback verification and webhook delivery converge without duplicate entitlement issuance
- [ ] Callback pages never grant payment status
- [ ] Manual approval captures reviewer, reference, notes and time
- [ ] Ticket inventory is checked under a row lock before an order reservation is created
- [ ] Automatic mode remains unavailable until server initialization and signed webhook verification pass
- [ ] Duplicate payment/entitlement protection passes
- [ ] Reconciliation, refund and cancellation runbooks are available
- [ ] Members can cancel only unpaid registrations and cannot self-approve refunds
- [ ] Automatic refunds retain access until provider completion is verified
- [ ] Real low-value end-to-end payment has been reconciled before public sale

## Privacy, trust and safety

- [ ] Public/private profile fields were tested with unrelated accounts
- [ ] Pause visibility and blocking take effect immediately
- [ ] Paused, pending, dormant and suspended profiles are excluded from directory results
- [ ] Private phone and WhatsApp data appear only to accepted connections when sharing is enabled
- [ ] Reverse-direction duplicate connection requests cannot create a second relationship
- [ ] Report actions exist on profiles, messages and posts
- [ ] Moderator content access is report-scoped and audited
- [ ] Terms, Privacy Notice and Community Guidelines are versioned
- [ ] Consent records store accepted document versions and timestamps
- [ ] Onboarding draft resumes after sign-out and across devices
- [ ] Avatar uploads enforce owner folder, MIME allow-list and 5 MB limit
- [ ] Member activation fails unless required profile, interest, goal and consent data exists
- [ ] Account export and deletion were tested
- [ ] Retention rules and legal-review actions are documented
- [ ] Support and safety escalation owners are on duty

## Product and content

- [ ] First event, programme, menu, speakers, sponsors and gallery are accurate
- [ ] Draft content is not visible to members
- [ ] Programme sessions cannot be saved outside the parent event dates
- [ ] Announcement and sponsor visibility changes create audit records
- [ ] Draft menus and dishes are invisible outside their assigned event administration scope
- [ ] Menu allergen content is reviewed by the event's catering owner before publishing
- [ ] Menu comments remain private until an assigned administrator moderates them
- [ ] Draft and archived gallery objects cannot receive anonymous signed URLs
- [ ] Gallery uploads reject unsupported MIME types and files larger than 10 MB
- [ ] Every published image has meaningful alt text and an accurate source credit
- [ ] Ticket capacity, currency, dates, timezone and venue are verified
- [ ] Empty/loading/error states teach the user what to do
- [ ] Notification copy, links and preferences were tested
- [ ] Feature flags expose only modules that passed their acceptance gate

## Quality

- [ ] Latest iOS Safari and Android Chrome pass core journeys
- [ ] Desktop Chrome/Safari/Firefox pass critical admin journeys
- [ ] Draft events are invisible anonymously and published events expose no private online URL
- [ ] Event staff can modify only explicitly assigned events
- [ ] Removing a staff member's final event scope also removes the event-staff role
- [ ] Featured-event changes update the public countdown and create an audit event
- [ ] Cancelled/completed event transitions and timezone rendering are verified
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
