# Launch readiness evidence

Last updated: 8 October 2026<br />
Current production: `https://www.herafricatable.com`<br />
Latest verified email-control release: `96b78cc`

## 8 October — real Admin test-email receipt

At 10:01 EAT, one private, clearly labelled test sent through the deployed application endpoint reached `impactedgeinnovations@gmail.com` in Gmail **Inbox**. The observed sender was `Her Africa Table <community@caseready.africa>`, and the button pointed to the production Admin notification page. The script confirmed provider acceptance at 07:01:45 UTC; the browser confirmed actual Inbox receipt separately. Local evidence: `tmp/admin-email-inbox-acceptance-20261008.png` (not committed).

A read-only queue audit immediately before the test found zero queued, processing or failed jobs and five provider-accepted jobs in the previous seven days. No general queue processing or member invitations were triggered by this acceptance.

This proves one application-email test delivery, not all emails: OTP, invitation/onboarding return, welcome templates, retry/preference/deduplication behaviour and urgent safety-alert timing remain open. It does not pass a global release gate or establish complete production readiness. See the current [implementation taskboard](./UX_EVENTS_IMPLEMENTATION_TASKBOARD.md).

## Historical baseline — 13 August 2026

The evidence below records the August build (`b6bb161`, then hosted at `https://herafricatable.vercel.app`). It is historical, not a certification of the present release or current pilot settings; changed features require new acceptance.

### Proven automatically at the August baseline

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
- Live membership intake reports `manual_review` and is ready for controlled admission.
- The release is committed and pushed to `main`; Vercel reports the exact commit.

### Proven with live tagged accounts at the August baseline

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
- Member invitations passed all four platform release checks. A tagged member vouch,
  Super Admin review, targeted email job, invited application, manual approval,
  claim, activation and fail-closed pause completed successfully; Referrals are enabled.
- The Nairobi Founding Table now has four of eight Community-specific publication
  checks passed and remains a private draft.

### Proven in source and database contracts at the August baseline

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
- Resend provider dashboard status, retry and bounce operations. The sending-only API
  key cannot inspect provider status; real OTP receipt has been confirmed manually.
- Final Nairobi event content, registration, check-in and post-event rehearsal.
- Low-value Paystack transaction, webhook, refund and reconciliation acceptance.
- iPhone, Android, desktop-browser, keyboard and screen-reader human sign-off.
- Nairobi Community notification choices, privacy/outcome thresholds,
  non-technical usability and Host handover/closure checks.
- GitHub Actions quality-gate status; Git push works, but local `gh` authentication
  must be restored before CI evidence can be read.

## Current release position

See the [8 October tester handover and current live audit](./TESTER_HANDOVER_AND_LAUNCH_READINESS.md). Current intake was observed as `trusted_auto`, not the historical manual-review setting below. Zero of ten formal launch gates are accepted. The named 9 October event remains a draft beyond its publication cutoff, and the engineering recommendation for its release is hold. Technical availability and individual successful rehearsals do not authorise unrestricted launch, automatic payments or creator payouts.

### Historical August pilot operating boundary (not current settings)

- Public and member-facing access uses email OTP only; no beta or temporary-password
  option is presented.
- New member requests remain under manual review and are admitted in small batches.
- Tagged `.invalid` accounts and password-based acceptance runners remain internal,
  excluded from member metrics and unavailable through the public sign-in.
- The first real member journey is monitored from request through approval,
  onboarding and OTP return, with support ready to intervene.
