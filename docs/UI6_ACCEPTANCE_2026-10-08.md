# UI-6 acceptance — 8 October 2026

This is an engineering evidence record, not a launch certificate. Browser checks used the existing Lavington Women owner's Chrome session. Role checks used separate short-lived Supabase sessions and the existing tagged test accounts. The later, explicitly approved Host rehearsal created one private, closed test event and one temporary test administrator; its access was removed afterward. No real invitation, booking, post, upload or membership decision was made.

## Results

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Ordinary-member Home, Members and Community discovery | Passed, server-rendered read-only pages | Current discovery controls rendered; Members did not show its read-failure state. Not a separate-account interactive browser test. |
| Ordinary-member Admin and Community moderation boundaries | Passed | Admin member decisions and release evidence denied; Community moderation workspace denied; private pilot and private Host workspace hidden. |
| Moderator member pages and scoped Community tools | Passed | Member discovery loaded; moderator workspace available; platform Admin decisions and private pilot denied. |
| Official Super Admin oversight | Passed, read-only | Cockpit, membership desk, selected private pilot editor, Host review and live launch board loaded. Real pending-request count matched non-test source records. No decisions were submitted. |
| Five-account conversation pagination | Passed | Owner, two ordinary members, moderator and scale member each read 45 conversations over three pages, without duplicate cursors; reply reads succeeded. |
| Populated published-Community search | Not accepted | The populated Nairobi fixture remains a draft. Search returned `P0001: This Community is unavailable`, consistent with its published-only guard. Do not open the Community merely to turn this test green. |
| Tagged Event Host positive workspace | Passed, server-rendered pages and scoped database reads | New fixture `hat-private-host-rehearsal-20261008` returned the assigned Host's workspace and future-event preparation controls. Ordinary member and moderator could not open it. Interactive Host browser/device acceptance remains separate. |
| Isolated Host write rehearsal | Passed, live database | Assignment, draft save/submission, requests for changes, pause/restore, private safety-contact denial and Host replacement passed. The former Host lost access and the replacement inherited a draft, not an approved submission. Event remained draft, registration closed and unfeatured. |
| Temporary administrator cleanup | Passed, live database and Auth | A unique hidden tagged identity received an audited 30-minute role. The role was revoked; its already-issued access token returned `is_admin=false`. Profile was suspended/hidden, Auth identity banned and rehearsal sessions signed out. The primary Admin's password/role were not changed. |
| Skip link | Passed in Chrome | Enter moved focus to `hat-page-content`. |
| Community About keyboard and 320px layout | Passed in Chrome | Enter opened About with focus on Close; Escape returned focus to About. Dialog stayed within the viewport, and document width remained 320px. Full screen-reader/keyboard-order acceptance remains. |
| Nia keyboard entry | Fixed and deployed | Enter/Space now activate the native button, mouse clicks do not double-toggle, expanded state is exposed, and Escape/Close return focus. No question was sent and no AI/audio request was made. |
| Mobile Guide accessible name | Fixed | Header now has an explicit Guide name even when its text is visually hidden. |
| Actual iOS/Android/PWA install and screen reader | Open | Chrome viewport simulation is not physical-device, Safari, screen-reader or OS installation evidence. |

## Fixes and regression checks

The role harness now uses current workspace controls rather than retired marketing headings, verifies member discovery, distinguishes future preparation from ended-event follow-up and reports all role failures without turning them into passes. It exits non-zero if any role is unaccepted.

Nia's keyboard activation is tested separately from pointer completion. Focus returns after the launcher is shown again. The mobile open panel hides the overlapping floating character while retaining its close button. Automated tests do not certify a complete assistive-technology journey.

## Next controlled sequence

1. Agree an isolated published Community fixture for populated browser search/reply/media acceptance. This approval is separate from the completed private Event Host rehearsal; the existing draft Nairobi Community was not published.
2. Run two ordinary-member browser sessions, a Host/moderator session, keyboard and slow-request/error recovery. Keep test recipients on the reserved `.invalid` domain unless real-inbox delivery is explicitly agreed.
3. Record iPhone Safari, Android Chrome, desktop installation and screen-reader outcomes. Only then close the relevant UI-6 items; formal launch gates still require their own evidence.

## Completed private Host rehearsal — 19:48 EAT

`scripts/accept-host-with-temporary-admin.mjs` preserved the existing distinct-Admin guard instead of changing `.env.test.local`. It created a unique reserved-domain account with a random password held only in memory, activated a hidden test profile, and used the official primary Admin's audited grant/revoke RPCs. The role had a 30-minute fallback expiry. The existing Host harness received public Supabase settings and the temporary test credentials only, never the service key.

The Host harness completed nine grouped live checks. It saved test-only content and a fake safety contact on the new event, never a real event. The read-only role-page harness then passed for the moderator, ordinary member, replacement Event Host and official primary Admin at `2026-10-08T16:48:29.960Z`. Anonymous release access was denied. All five cleanup checks passed, including denial using the temporary account's pre-revocation access token. No email worker was invoked, real recipients were not used, and the test event remains unpublished. Its tagged Host assignment is retained as an acceptance fixture; the temporary Admin identity remains disabled for audit continuity.

Mocked cleanup tests verify that a failed rehearsal still runs cleanup, a failed cleanup step does not prevent subsequent disabling attempts, and cleanup failure prevents a passing report. Explicit confirmations, exact project/primary-Admin guards and missing settings are also tested. These are engineering tests, not real-file, inbox, booking or device acceptance.

Commands used: `npm run ops:events:accept-role-pages`, `HAT_COMMUNITY_TEST_SLUG=nairobi-founding-table npm run ops:community:audit-rehearsal`, `HAT_CONFIRM_TEMPORARY_TEST_ADMIN=yes HAT_CONFIRM_PRIVATE_EVENT_REHEARSAL=yes npm run ops:events:accept-temporary-admin-host`, `npm test`, `npm run build`. The temporary-Admin command requires fresh explicit authorization; do not treat this record as permission to repeat privileged live writes.

No new SQL is required for this acceptance slice.
