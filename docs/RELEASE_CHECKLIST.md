# Her Africa Table — Production Release Checklist

## Source and deployment

- [ ] Intended commit is reviewed and present on `main`
- [ ] Vercel build, typecheck and automated tests pass
- [ ] GitHub application and database quality-gate jobs are green on the release commit
- [ ] Main-branch protection requires the quality gate before deployment
- [ ] Preview deployment was tested before merge
- [ ] Production points to the intended commit
- [ ] Admin Release shows `Core ready` for the exact production commit
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
- [ ] A clean Supabase reset applies every committed migration in chronological order
- [ ] Foreign keys, uniqueness constraints and policy indexes are present
- [ ] Seed/test data is absent or explicitly excluded from analytics
- [ ] Backup exists and restore procedure has been rehearsed

## Authentication and membership

- [ ] Production Site URL and redirect allow list are exact
- [ ] Localhost, Preview and Production callbacks work
- [ ] Email OTP template, sender branding and delivery configuration are production-ready
- [ ] Email OTP uses production sender configuration
- [ ] Public member and Admin sign-in expose no temporary-password control
- [ ] OTP and authentication endpoints are rate-limited
- [ ] Authenticated pending users cannot access member data
- [ ] Super Admin can switch between Review every request, verified-invitation
      auto-entry and Pause new requests; every change is audited
- [ ] Verified-invitation auto-entry accepts only a matching, unexpired team invitation
- [ ] Uninvited applicants remain pending when verified-invitation auto-entry is enabled
- [ ] Paused intake blocks new applications without affecting existing member sessions
- [ ] Active/dormant/suspended/deleted state tests pass
- [ ] Onboarding can activate without a photo, language, phone, social or business link
- [ ] Goals and interests use plain selectable choices rather than comma-separated input
- [ ] First Super Admin and scoped staff accounts are verified
- [ ] `npm run ops:auth-readiness` passes with a time-bounded, test-tagged identity

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
- [ ] Creator commerce remains disabled until a published host plan, accepted
      host agreement and verified payout profile exist
- [ ] Community admission is approved before a paid order can be created
- [ ] Automatic, manual-review and closed community payment modes preserve the
      same admission and entitlement boundaries
- [ ] Community host earnings remain `held` until provider settlement, fees,
      refunds, disputes and payout identity are reconciled
- [ ] Community hosts cannot verify their own payout profile or mark held revenue
      settled
- [ ] Host-plan self-service has an independent fail-closed feature flag and
      Automatic, Manual review, or Closed processing control
- [ ] Only an existing active community owner can create a host-plan order
- [ ] A host-plan browser callback cannot grant a subscription or host-tools
      entitlement
- [ ] Host-plan reversal revokes the purchased entitlement and pauses published
      paid access without removing the community or owner
- [ ] Host renewal creates only one scheduled next period and does not shorten
      the current paid period
- [ ] Plan change activates only after the current period; duplicate scheduled
      plans are rejected at the database boundary
- [ ] Scheduled host lifecycle reconciliation runs with `CRON_SECRET`, queues
      renewal reminders and exposes counts in Admin Operations
- [ ] Grace blocks new paid member checkout; final host-plan expiry revokes host
      tools and pauses the paid offer without removing community members
- [ ] Signed Paystack refund and dispute events are accepted only for matching
      community orders, currency and amount
- [ ] Pending, processing, needs-attention and failed refunds do not debit the
      creator statement; only Processed does
- [ ] Dispute create holds creator funds, Won releases once, and Lost preserves
      the hold without double-counting a later refund
- [ ] Creator statement entries and settlement items reject update and deletion
- [ ] Settlement creation requires verified payout identity, no open cases and a
      positive reconciled balance
- [ ] Draft and Approved settlements never send money; Paid requires an external
      provider reference and a final balance recheck
- [ ] Automatic creator transfers and Paystack split settlement remain disabled

## Privacy, trust and safety

- [ ] Public/private profile fields were tested with unrelated accounts
- [ ] Pause visibility and blocking take effect immediately
- [ ] Paused, pending, dormant and suspended profiles are excluded from directory results
- [ ] Private phone and WhatsApp data appear only to accepted connections when sharing is enabled
- [ ] Reverse-direction duplicate connection requests cannot create a second relationship
- [ ] Report actions exist on profiles, messages and posts
- [ ] Blocking immediately removes directory, connection and private-contact visibility in both directions
- [ ] Moderator report access is limited to submitted details and captured evidence
- [ ] Moderator content access is report-scoped and audited
- [ ] Administrators cannot list or read member messages outside a submitted evidence snapshot
- [ ] Removing or blocking a connection immediately prevents message reads and writes
- [ ] Message rate limits remain enforced when RPCs are called outside the application UI
- [ ] Terms, Privacy Notice and Community Guidelines are versioned
- [ ] Consent records store accepted document versions and timestamps
- [ ] Onboarding draft resumes after sign-out and across devices
- [ ] Avatar uploads enforce owner folder, MIME allow-list and 5 MB limit
- [ ] Member activation fails unless required profile, interest, goal and consent data exists
- [ ] Account export and deletion were tested
- [ ] Data exports contain only the requesting member's records and omit provider secrets
- [ ] Deletion requests hide discovery immediately and remain cancellable during cooling-off
- [ ] Deletion execution is Super Admin-only, removes avatar/personal content and revokes sign-in
- [ ] Financial and audit retention after deletion matches the approved retention schedule
- [ ] Retention rules and legal-review actions are documented
- [ ] Support and safety escalation owners are on duty
- [ ] Members can read only their own support requests and replies
- [ ] Event staff and moderators cannot read the support inbox
- [ ] Support assignment, priority, waiting, resolution and closure transitions pass
- [ ] Support creation/reply rate limits remain enforced outside the application UI

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
- [ ] Resend sender domain, SPF and DKIM are verified
- [ ] Notification cron frequency matches the Vercel plan and support SLA
- [ ] Email outbox idempotency, retry backoff and permanent-failure alerting pass
- [ ] Essential registration, account and privacy notices cannot be opted out
- [ ] Feature flags expose only modules that passed their acceptance gate

## Table Guide

- [ ] `OPENAI_API_KEY` and `AI_SAFETY_SALT` are server-only in Vercel
- [ ] The Admin off-switch stops new requests immediately
- [ ] Members separately consent to using the Guide and appearing in suggestions
- [ ] Hidden, paused, blocked, pending, suspended and opted-out members never appear
- [ ] Suggestions use only visible industry, location, interests and goals
- [ ] Private contacts, messages, safety reports and Admin data never enter model context
- [ ] Moderation, daily limits, provider failure and human handoff paths pass
- [ ] Her Africa Table stores no ordinary prompt or response transcript
- [ ] A support transcript is stored only after explicit member confirmation
- [ ] Two-account recommendation and blocked-pair acceptance tests pass

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
- [ ] Check-in opening window, duplicate scan, wrong-event pass and audited reversal pass on launch devices
- [ ] Every event device is signed in as a scoped staff account, not a shared Super Admin account
- [ ] Slow-network, offline/retry and duplicate-submit tests pass
- [ ] Directory, messages and admin lists paginate
- [ ] Asks & Offers enforce active-member visibility, blocked-pair exclusion and private response ownership
- [ ] Marketplace report snapshots, hide/dismiss decisions and notification links pass moderator UAT
- [ ] Past Events use deterministic end times and expose only published recap fields
- [ ] Non-attendees cannot submit feedback; scoped staff cannot read another event's responses
- [ ] Learning remains disabled until free, event-bundle, manual and Paystack course access boundaries pass
- [ ] Unenrolled members cannot read lessons or sign private `course-assets` URLs
- [ ] Event and course orders both pass amount/currency, replay and reversal tests through shared Paystack processing
- [ ] Member referral cannot grant access before Super Admin approval
- [ ] Referral email, claim and activation attribution pass with duplicate and campaign-limit tests
- [ ] Named, anonymous, rejected and withdrawn testimonial paths are verified end to end
- [ ] Performance and image/media budgets pass

## Observability and operations

- [ ] Application errors and critical auth/payment failures alert an owner
- [ ] Health check and synthetic registration/sign-in checks are active
- [ ] `/api/health` is monitored externally and alerts on sustained degradation
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
- [ ] `REQUIRE_HEALTHY=1 npm run test:live` passes against the production domain
