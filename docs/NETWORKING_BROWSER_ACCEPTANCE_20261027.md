# Host networking — browser acceptance, first pass

27 October 2026 (Africa/Nairobi). Fix release: `253b752`; Vercel deployment successful.

## Scope

Read-only inspection of the real production website in the owner's already signed-in Chrome member/Host session. Navigation used Home → Events → Food & Tech Event → Host workspace → Networking / Guests & check-in → scanner, then the event's read-only member preview. No real event content, schedule, pass, booking, helper, message, notification state or account setting was changed. Camera permission was not requested and no pass was submitted.

This is **partial L3 navigation/display evidence**, not independent guest acceptance or physical scanning. The previous [26-check persistent API rehearsal](NETWORKING_API_REHEARSAL_20261027.md) remains L2 evidence.

## Observed and refined

| Check | Observation / action |
| --- | --- |
| Persistent member navigation | Home, Events, Communities and People remain present on event detail, Host workspace and scanner. |
| Host tools | Networking and Guests & check-in are visible sections. Networking setup exposes start/finish, conversation/changeover time, table count, optional names and prompt. Fields inspected only; nothing saved. |
| Refresh / return | Baseline lost the selected Host section on refresh and after returning from the scanner. Fixed: section changes retain a safe `#host-networking` / `#host-guests` link without a page reload or extra Back entries. Query strings are preserved; no member, draft or pass data is placed in the URL. |
| Initial networking read | Baseline briefly called a normal first load a reconnection failure. Fixed: Checking your networking session is distinct from a failed read. Setup is disabled until a fresh successful read. |
| No networking schedule | Baseline said no guests had joined even though no session existed. Fixed: Networking is not scheduled yet, with a short setup explanation. |
| Attendance | Current event identity, refreshed counts, helper controls, guest search/filters, export link and scanner link rendered. No arrival/export mutation performed on the real event. |
| Scanner | Correct event name, venue/time, QR action and manual code fallback rendered. Wording now describes the scanner screen's limited display, rather than incorrectly implying the Host account cannot access her guest list. |
| Member preview | Read-only notice rendered, booking and Community joining disabled, management tools omitted. This does not simulate another authenticated person's permissions. |

## Regression verification

- Final `npm test` and `npm run test:event-networking` passed including the actual scanner and networking component cases.
- `node scripts/verify-event-host-resilience.mjs` passed: actual Host component selection, safe query-preserving URLs, refresh/share restoration, absent-section fallback, hash/popstate handling and listener cleanup; no writes or router reload.
- Production build passed after the final code change; TypeScript is included in that build. No schema, authentication, role or payment change.

### Post-deployment browser confirmation

On the live release, selecting Networking updated the URL to `#host-networking`; a normal reload kept Networking selected. The initial read showed Checking your networking session, then the confirmed Networking is not scheduled yet state. Selecting Guests & check-in updated to `#host-guests`; opening the correct scanner and pressing browser Back returned to Guests & check-in instead of Event details. The scanner displayed the corrected scope wording. No event-writing control was used.

Screenshot: `tmp/networking-host-browser-20261027.png` (real production page, not example data). The existing event has no networking schedule; this screenshot does not demonstrate a running session or a guest match.

## Normal test-account browser sign-in limitation

The isolated in-app browser correctly opened email-code sign-in. Existing tagged test accounts use reserved `.invalid` addresses and cannot receive an OTP. The live site has no password sign-in, so their successful SDK password authentication in L2 does **not** demonstrate a normal browser login.

No password backdoor, session/cookie injection, credential reset or new role was introduced. The owner's Chrome session was not signed out. For independent guest-browser acceptance, use consenting accounts with deliverable email addresses and complete the normal OTP flow. Physical iPhone/Android camera, lock/reconnect, two-device early-end feedback and actual inbox delivery remain open.

## Next acceptance actions

1. Use two consenting guest accounts and a Host in independent normal browser sessions; book/check in only to an isolated test event.
2. Compare mutual acceptance and the same end time; test refresh, phone lock, early end, Find someone else and Leave networking on both screens.
3. Scan on real iPhone/Android; verify wrong-event, duplicate, revoked-helper and network-error recovery.
4. Complete consenting connection-request and provider/inbox checks; then run the 10–20 guest rehearsal.

No new SQL or Vercel settings are required. Phase 3 remains **in progress**.
