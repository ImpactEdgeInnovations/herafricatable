# Production UAT record

## 13 August 2026 — release and decision-boundary pass

Deployment tested: `https://herafricatable.vercel.app`<br />
Release tested: `ee78ccb`

Passed:

- Production health returns HTTP 200 with the database reachable and the
  server-only Supabase integration ready.
- The landing page, Events and member sign-in return HTTP 200; anonymous access
  to Home, Communities, Learning, Referrals, Support, Settings and Notifications
  returns to member sign-in, while Admin returns to Admin sign-in.
- Production exposes the intended browser-security headers: content security
  policy, no framing, no MIME sniffing, restricted referrers and bounded camera,
  microphone and location permissions.
- The notification cron rejects an unsigned request with HTTP 401.
- Community Gathering rooms, the service-only reminder scheduler and standalone
  event questions are deployed. Signed-out reads, writes and Admin report access
  remain blocked.
- The deployed Super Admin operations for member decisions, membership-intake
  control, Community membership, Community applications, member-created events,
  Community events, manual registration and event-question moderation reject a
  signed-out caller.
- Source-to-database contracts confirm these Admin interfaces call real RPCs with
  database role enforcement, auditing, notifications and launch-tier boundaries.
- Public DNS exposes Resend DKIM, SPF and return-path MX records for
  `caseready.africa`.

Still required before go-live:

- Run positive approve, decline, request-changes and restore paths using tagged
  member, Host, moderator, event-staff and Super Admin credentials. Those
  credentials are intentionally absent from the local test environment.
- Inspect Resend provider status and prove inbox delivery, bounce handling and
  notification retry using a sending-capable local key or the provider dashboard.
- Publish and rehearse the final launch event; the public Events page currently
  has no upcoming published event.
- Complete the five-user mobile, browser and non-technical usability rehearsal.
- Confirm GitHub quality-gate results after GitHub CLI authentication is restored.

## 21 July 2026 — public and anonymous boundary pass

Deployment tested: `https://herafricatable.vercel.app`

Passed:

- Landing, events and member sign-in return production content with HTTP 200.
- Member home, support, settings and notifications redirect anonymous visitors to
  `/sign-in`.
- Admin redirects anonymous visitors to `/admin/sign-in`.
- The live countdown hydrates from Supabase and displays the Nairobi launch date.
- Landing and authentication pages fit a 390 × 844 viewport without horizontal overflow.
- The production bundle uses the intended Supabase project URL and the same publishable
  key as the local workspace; only non-reversible key fingerprints were compared.

Open production configuration gate:

- The health endpoint returned HTTP 503 on release `e436f2e`. The original endpoint
  could not distinguish a public database failure from a missing or invalid server-side
  Supabase integration. Release `e436f2e` is therefore not a go-live candidate.
- The next release adds separate `database` and `server_integration` states. Production
  remains blocked until `REQUIRE_HEALTHY=1 npm run test:live` returns HTTP 200.
- No OTP, registration, payment, support, privacy or deletion mutation was performed
  during this pass.

The public events page correctly renders its empty state because a published `events`
record has not yet been created. The countdown record alone does not publish a complete
event or open registration.
