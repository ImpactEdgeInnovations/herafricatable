# Launch readiness evidence

Last updated: 13 August 2026<br />
Production: `https://herafricatable.vercel.app`<br />
Verified release: `ee78ccb`

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

- Positive Admin approve/decline writes with separate real or tagged accounts.
- Complete pending application → approval → onboarding → OTP return journey.
- Five-role Community write, pagination, safety and Gathering rehearsal.
- Resend provider status, real inbox delivery, retry and bounce operations.
- Final Nairobi event content, registration, check-in and post-event rehearsal.
- Low-value Paystack transaction, webhook, refund and reconciliation acceptance.
- iPhone, Android, desktop-browser, keyboard and screen-reader human sign-off.
- GitHub Actions quality-gate status; Git push works, but local `gh` authentication
  must be restored before CI evidence can be read.

## Current release position

The application is suitable for continued controlled rehearsal. Do not open
unrestricted public membership, automatic payments, creator payouts or Paystack
split settlement until the unproven P0 items above are recorded as passed.
