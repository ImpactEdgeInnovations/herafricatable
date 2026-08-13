# Launch readiness evidence

Last updated: 13 August 2026<br />
Production: `https://herafricatable.vercel.app`<br />
Verified production release: `2e72038`<br />
Latest credentialed acceptance: local release candidate pending push

## Proven automatically

- Production health is ready: HTTP 200, database reachable and server integration ready.
- Public pages load and protected member/Admin routes preserve their authentication boundaries.
- Production security headers and unsigned notification-cron rejection are active.
- The full repository, journey, accessibility, operations, Community Gathering,
  event-question, Super Admin decision and TypeScript contract suites pass.
- The optimized Next.js production build passes.
- Community Gathering rooms and reminders are deployed with private reads/writes and
  a service-only delivery scheduler.
- Standalone event questions are deployed with private projections and signed-out
  writes blocked.
- Super Admin decision functions for membership, Communities, events, registration
  and event-question moderation are deployed and reject signed-out callers.
- Resend SPF, DKIM and return-path MX records resolve for `caseready.africa`.
- The release is committed and pushed to `main`; Vercel reports the exact commit.

## Proven with live tagged accounts

- Membership intake passed invited, manual-review, paused and trusted-network
  journeys and restored `manual_review` as the launch setting.
- Two ordinary members, an owner, backup moderator, scale member and time-bounded
  Super Admin completed the Community role rehearsal.
- Invitation, join, decline, cancel, leave, rejoin, removal and restoration paths
  passed with the member ending in active access.
- Community conversations passed with 45 records across three stable cursor pages,
  pins first and signed-out access denied.
- A member safety report reached the private Admin queue, remained hidden from the
  Host and Community moderator, received an audited outcome and left no open report.
- The isolated Community event passed draft, requested-changes, resubmission,
  approval, free manual registration, one-seat and audience boundaries.
- The isolated Gathering passed attendee consent, questions, support, Host answer,
  open live text, moderator pinning, bilateral blocking and anonymous denial, then
  cancelled and archived its fixtures.
- The Communities module passed all four platform release checks. An audited pause
  blocked an ordinary member, retained Community data and restored the enabled flag.
- The Nairobi Founding Table now has four of eight Community-specific publication
  checks passed and remains a private draft.

## Proven in source and database contracts

- Member approval moves only a submitted pending application into onboarding or
  active access, records the reviewer and audit event, and triggers a member notice.
- Community-host approval creates a private draft Community and active owner; it
  never silently publishes the room.
- Community membership approval is authorised by Community management rules, while
  ownership transfer remains Super Admin-only.
- Member-created events can currently approve only free public events with manual
  registration. Community event approval can currently approve only free,
  Community-only events. Public or paid Community events fail closed.
- Manual event-registration approval is event-scoped, row-locked through the order
  path, auditable and calls the central fulfilment function.
- Event-question reports expose captured evidence to the bounded safety workflow;
  general private conversations remain unavailable.

## Not yet proven

- Complete real-email pending application → Admin approval → onboarding → OTP
  return journey using a non-test member.
- Resend provider status, real inbox delivery, retry and bounce operations.
- Final Nairobi event content, registration, check-in and post-event rehearsal.
- Low-value Paystack transaction, webhook, refund and reconciliation acceptance.
- iPhone, Android, desktop-browser, keyboard and screen-reader human sign-off.
- Nairobi Community notification choices, privacy/outcome thresholds,
  non-technical usability and Host handover/closure checks.
- GitHub Actions quality-gate status; Git push works, but local `gh` authentication
  must be restored before CI evidence can be read.

## Current release position

The application can enter a private controlled pilot with manual membership review,
free/manual events and automatic creator payments disabled. Do not begin an
unrestricted public campaign, publish the Nairobi Community, enable automatic
payments, creator payouts or Paystack split settlement until the remaining P0
evidence is recorded as passed.
