# UI-6 acceptance — 8 October 2026

This is an engineering evidence record, not a launch certificate. Browser checks used the existing Lavington Women owner's Chrome session. Role checks used separate short-lived Supabase sessions and the existing tagged test accounts. No real invitation, booking, post, upload or membership decision was made.

## Results

| Check | Result | Evidence / limitation |
| --- | --- | --- |
| Ordinary-member Home, Members and Community discovery | Passed, server-rendered read-only pages | Current discovery controls rendered; Members did not show its read-failure state. Not a separate-account interactive browser test. |
| Ordinary-member Admin and Community moderation boundaries | Passed | Admin member decisions and release evidence denied; Community moderation workspace denied; private pilot and private Host workspace hidden. |
| Moderator member pages and scoped Community tools | Passed | Member discovery loaded; moderator workspace available; platform Admin decisions and private pilot denied. |
| Official Super Admin oversight | Passed, read-only | Cockpit, membership desk, selected private pilot editor, Host review and live launch board loaded. Real pending-request count matched non-test source records. No decisions were submitted. |
| Five-account conversation pagination | Passed | Owner, two ordinary members, moderator and scale member each read 45 conversations over three pages, without duplicate cursors; reply reads succeeded. |
| Populated published-Community search | Not accepted | The populated Nairobi fixture remains a draft. Search returned `P0001: This Community is unavailable`, consistent with its published-only guard. Do not open the Community merely to turn this test green. |
| Tagged Event Host positive workspace | Not accepted | The older selected fixture returned no scoped workspace row. Negative ordinary-member access passed, but this is not a positive Host pass. A suitable future private fixture is needed. |
| Isolated Host write rehearsal | Approved but blocked by configuration | Owner approved one private closed test event and tagged-account assignment/submission/review/pause/restore/replacement. The command stopped before sign-in or writes because the configured test Admin equals the primary owner. No event was created and no Host access changed. Use a separate tagged test administrator; do not remove the guard. |
| Skip link | Passed in Chrome | Enter moved focus to `hat-page-content`. |
| Community About keyboard and 320px layout | Passed in Chrome | Enter opened About with focus on Close; Escape returned focus to About. Dialog stayed within the viewport, and document width remained 320px. Full screen-reader/keyboard-order acceptance remains. |
| Nia keyboard entry | Fixed and deployed | Enter/Space now activate the native button, mouse clicks do not double-toggle, expanded state is exposed, and Escape/Close return focus. No question was sent and no AI/audio request was made. |
| Mobile Guide accessible name | Fixed | Header now has an explicit Guide name even when its text is visually hidden. |
| Actual iOS/Android/PWA install and screen reader | Open | Chrome viewport simulation is not physical-device, Safari, screen-reader or OS installation evidence. |

## Fixes and regression checks

The role harness now uses current workspace controls rather than retired marketing headings, verifies member discovery, distinguishes future preparation from ended-event follow-up and reports all role failures without turning them into passes. It exits non-zero if any role is unaccepted.

Nia's keyboard activation is tested separately from pointer completion. Focus returns after the launcher is shown again. The mobile open panel hides the overlapping floating character while retaining its close button. Automated tests do not certify a complete assistive-technology journey.

## Next controlled sequence

1. Configure a separate, tagged test administrator in `.env.test.local` (`HAT_ADMIN_TEST_EMAIL` and `HAT_ADMIN_TEST_PASSWORD`). Never paste the password into this report or commit that file. A new administrator role needs a specific approval; it is not silently granted.
2. Run the already approved isolated private Host rehearsal. Confirm the event remains draft, closed and unfeatured. Then set its returned slug explicitly as `HAT_REHEARSAL_EVENT_SLUG` for the read-only role-page check.
3. Prepare an explicitly agreed isolated published Community fixture for populated browser search/reply/media acceptance. This approval is separate from the private Event Host rehearsal.
4. Run two ordinary-member browser sessions, a Host/moderator session, keyboard and slow-request/error recovery. Keep test recipients on the reserved `.invalid` domain unless real-inbox delivery is explicitly agreed.
5. Record iPhone Safari, Android Chrome, desktop installation and screen-reader outcomes. Only then close the relevant UI-6 items; formal launch gates still require their own evidence.

Commands used: `npm run ops:events:accept-role-pages`, `HAT_COMMUNITY_TEST_SLUG=nairobi-founding-table npm run ops:community:audit-rehearsal`, `npm test`, `npm run build`.

No new SQL is required for this acceptance slice.
