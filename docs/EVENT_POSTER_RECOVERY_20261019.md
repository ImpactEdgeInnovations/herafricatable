# Event posters — access and PWA recovery

Updated: 19 October 2026.

## Delivered

- Published poster access follows `can_view_event`: public visitors can read public-event posters; Community-only posters require the event's authorised audience.
- Applicant metadata remains private. Draft covers, unapproved/replaced proposal images and draft-event posters remain hidden from unrelated viewers. Existing owner/Host/Admin draft access is preserved.
- Both mixed-use storage buckets remain private. No service key or public bucket is used for delivery.
- Event listing/full-poster view and event detail use a same-origin `/api/events/[eventId]/poster` endpoint. Each request rechecks event visibility, resolves only published metadata and signs with the viewer's own permissions. Caller-supplied bucket/path values are ignored. Responses/redirects are private and not stored; the service worker already excludes API routes.
- Old image links are renewed on visible/online app resume after 45 minutes. Failed images receive one automatic retry; subsequent failures show **Image unavailable / Retry image**. Failed resume retries have a 30-second cooldown; manual retries cannot double-submit. Recovery attempts have a 20-second timeout. Hidden/offline resume does not initiate renewal. This is not offline image support.

## Verification

### L1 — controlled code/runtime

`scripts/verify-event-poster-recovery.mjs` executes the actual recovery state machine, lifecycle hook and route with controlled dependencies: stale events, bounded retry, duplicate retry prevention, resume throttling, visibility, timeout cleanup, invalid IDs, denied audiences, missing poster, failed signing, published-cover preference and proposal fallback. `verify-event-card-media.mjs` renders/executes the real card controls, including visible Retry and replacement recovery. Full `npm test`, typecheck and production build passed. Provider calls in controlled tests are mocked, not inbox/device evidence.

### L2 — live database

Migration `20261019145942_event_poster_access_and_recovery.sql` applied to `gtzwqromwvzqytygebfc`. Ordinary-member readback for Food & Tech changed from one visible poster / zero readable files to one visible poster / one readable file.

`supabase/tests/068_event_poster_visibility.sql` passed in a rollback-only transaction using tagged accounts and synthetic event/file metadata: anonymous/public/member access; denial for Community nonmembers; access for active Community members; draft, unapproved and replaced images denied; private application metadata denied; private buckets preserved. No files uploaded, no emails sent, no fixture events or storage metadata left behind.

Security advisor comparison introduced no new findings. Existing project-wide findings remain; this work is not a claim that the entire project is security-clean. Existing public poster RPCs are intentionally callable with explicit event-audience checks; their pre-existing generic SECURITY DEFINER notices remain.

### L3 — browser and physical devices

Release `32aba53` pushed to main and Vercel status confirmed success. In the existing creator/Host Chrome session at 390 × 844, Food & Tech and December Dubai Trip both decoded successfully from the new same-origin endpoints, at a 320 × 200 card size. Food & Tech's full-poster dialog opened and closed correctly; its event-detail poster also decoded successfully from the new endpoint after navigation. Screenshot: `tmp/event-poster-recovery-mobile-20261019.jpg`. These are real browser/provider checks but not independent-member browser or physical-device acceptance. Physical installed iPhone/Android, hour-long background/resume and real connectivity-failure acceptance remain open. A responsive desktop browser is not a substitute for those checks.

## Tester check

1. Reload the installed app once to receive this release; sign in as a non-Host.
2. Open Events and Food & Tech. Its poster should load in both listing and detail. Open the full poster and close it.
3. Background the app for over an hour; return while online. The poster should recover without signing out or reinstalling.
4. Test loss/recovery of connection. A failed load should stop retrying automatically and offer Retry image. Restore the connection and retry.
5. Repeat with a Community-only event: active Community member allowed; unrelated account denied. Never use a real private image as a public test fixture.
6. Her African Table Launch currently has no published poster; its branded fallback is expected until a Host saves one.

No Vercel environment-variable changes or owner-run SQL are required for this release.
