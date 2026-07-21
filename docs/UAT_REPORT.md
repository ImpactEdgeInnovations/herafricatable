# Production UAT record

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
