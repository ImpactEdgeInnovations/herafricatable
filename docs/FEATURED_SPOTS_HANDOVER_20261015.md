# Featured spots — 15 October 2026

Hosts can request a featured spot from Event Host extra tools or Community Host tools → Settings. Super Admin reviews requests inside Admin → Events or Admin → Communities. A short reason and a date period are required. Decline/removal requires a note. Requests and decisions are available in the panels; this feature does not send emails.

Only published public events, and published Communities with their existing public preview enabled, qualify. Featuring does not change joining, payment or content access. A period is at most 30 days; event placement must finish before the event ends. Approval supports up to three overlapping spots per module and rejects overlapping placements for the same item. Times in the forms are explicitly Nairobi time; storage uses UTC.

Placement appears above discovery results. The database enforces start-inclusive/end-exclusive visibility on every read. An already-open page removes expired cards within one second (browser timer permitting). Newly started or newly approved placements appear on refresh/re-entry. Early removal or loss of publication/public-preview eligibility takes effect on the next server read. Ordinary listing remains unchanged. Existing landing-page `events.is_featured` is a separate control.

## Verification record

Read [the three-level standard](FEATURE_VERIFICATION_STANDARD.md) before assigning a working/readiness label.

| Scope | L1 | L2 | L3 |
| --- | --- | --- | --- |
| Host request and Super Admin decision | Implemented; TypeScript and build pass | PASS: real live database, authenticated roles, isolated rollback fixtures; requests and decision read-back, duplicate/role/date denial | NOT TESTED: committed browser submission → Admin approval → reload with independent accounts |
| Scheduled/expired/removed placements | Render test passes active and exact expiry boundary; timer cleanup | PASS: future and expired rows hidden by RLS; early removal persisted; anonymous public-event read and request-table denial | NOT TESTED: full browser timing and refresh rehearsal |
| Three concurrent placement cap | Code inspected; serialized approval and overlap query | PASS: three simultaneous spots, fourth refusal, freed-slot reuse, adjacent and disjoint periods; actual competing sessions remain inconclusive | NOT TESTED |
| Notification delivery | N/A: not part of this feature | N/A: rehearsal verified no fixture notification jobs | N/A |

Commands: full `npm test`, `npm run build`, `npm run typecheck`, `npm run test:featured` passed. The new render test also runs automatically before `npm test`. Database test: `supabase/tests/062_featured_spots.sql` (**test only, not a migration**). Tested against project `gtzwqromwvzqytygebfc` on 15 October at approximately 20:10 EAT. Fixture failures initially caught missing required test-host/public-profile fields; fixtures were corrected without weakening product validation. The passing run rolled all synthetic Community, event, request and placement records back. A separate cleanup read confirmed zero remaining fixture events, Communities or requests. Security advisors returned no findings referencing the new featured-spot objects.

Migration `20261015170357_featured_spot_requests.sql` was applied directly to the live database. No owner SQL action is needed. Both new tables enforce RLS; functions are security invoker, with anonymous execution revoked. Request reasons and review notes live separately from publicly readable placement metadata. Existing unrelated security-advisor and historical migration-replay findings remain outside this change.

Next acceptance: use tagged Host and Admin browser sessions, submit one eligible fixture request, approve a short period, confirm authoritative values after refresh, decline a second request, remove a placement early, check expired cards, and exercise network failure recovery. Record L3 only after the actual user outcomes are observed. Do not publish test fixtures or send real emails as part of an unapproved rehearsal.

## 16 October follow-up

Applied `20261016033100_featured_spot_review_consistency.sql` live. Approve/decline now accepts only a pending request; removal accepts only an approved request. A stale Admin form receives “This request has changed. Refresh requests before deciding” rather than overwriting a completed decision. Approved dates are read-only in the panel. The capacity query now checks simultaneous occupancy at period boundaries: three separate booked periods may share capacity with a longer placement when at most three coincide. This corrects the previous conservative overlap count.

`supabase/tests/063_featured_spot_capacity.sql` passed against real authenticated database roles with eight synthetic rollback-only events. It verified the three-plus-one case, unchanged state after refusal, released-slot reuse, adjacent boundaries, disjoint intervals and stale approve/decline denial. Test 062 also passed again. Cleanup read confirmed zero fixture records or requests; advisors returned no findings for these feature objects.

The separate two-call advisory-lock probe was **inconclusive**: it did not establish overlapping database sessions, so actual simultaneous review acceptance is still open. It is not counted as passing concurrency evidence.

Admin now starts with an “Awaiting a decision” queue and can filter approved, declined, removed or all requests. Read errors disable decision/submission actions until refresh succeeds. A synchronous save lock prevents double submissions; stale responses cannot replace a newly selected queue. Confirmed save feedback is retained if the subsequent history refresh fails. `scripts/verify-featured-request-recovery.mjs` executes these error, retry, date conversion and race cases with controlled dependencies: **L1 evidence only**.

Live Host read-only browser check reached the actual request form for December Dubai Trip in the existing Seina session and loaded history without an error. No request, approval, publication or email was sent. This proves access/rendering only; it does not close the L3 write-and-refresh rehearsal. The currently available session is a Host session, not an independent Super Admin browser session.
