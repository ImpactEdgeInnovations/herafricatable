# Meet someone new — in-person networking

Updated: 27 October 2026. First release: pairs only, up to 200 participants per event.

## Latest acceptance — 27 October

The persistent multi-session API rehearsal passed **26 checks and three real timed rounds** using existing tagged accounts. Each of three guests completed two introductions, with no repeated pair; the late guest rotated into rounds two and three. Helper isolation, immediate revocation, saved arrival attribution, read-only reminders, shared match timing, Host help/resolve and finish passed. Both isolated test events were closed and verified afterwards. [Full evidence and next phase](NETWORKING_API_REHEARSAL_20261027.md).

This extends L2 beyond rollback tests; it does not complete physical-device/browser/inbox L3. Later delivery in release `8506127` also adds a foreground member-shell reminder and Home/Events follow-through; the dated descriptions below record earlier implementation stages, not current global-alert limitations. See [current operations](EVENT_OPERATIONS_POLISH_20261026.md).

## Live invitation and visual polish — 26 October

On the open event page, a server-confirmed checked-in guest who has not joined sees a compact green/ivory invitation when the Host starts. The first round says **Networking is starting**; later rounds say **Networking is live**. The strip includes the real session-end countdown, **Join networking** and **Not now**. It is inline, not a modal or global/background notification. No sound, location tracking or pre-opt-in searching animation is used.

Join opens a short introduction form; only submitting that form invokes the existing join RPC. Not now collapses the invitation to a quiet Join whenever you're ready row and makes no RPC write. Dismissal lasts for that mounted event-page visit and survives polling, not browser reloads or other devices. The member can reopen the form and join later. Leaving successfully closes the entry form and returns to the quiet state, so the invitation does not immediately nag her to rejoin. A pause, disable, finish, failed refresh or missing check-in cannot show a live invitation. Existing server eligibility and matching rules remain authoritative.

The waiting dial is smaller, the match title and person remain the focus, and the meeting point and timer are separated for scanning. Entry wording is shorter and offers a Not now action. Full tests, TypeScript and production build passed; actual-component checks cover dismissal without writes, polling persistence, deliberate form submission, leave/reopen behaviour, late rounds, offline state and unavailable-session states. Example-data browser checks at 320px/390px show no horizontal overflow and 46px invitation buttons; desktop checked separately. Screenshots: `tmp/networking-invitation-example.png`, `tmp/networking-waiting-polished-example.png`, `tmp/networking-person-polished-example.png`. These are controlled UI previews, not a new L3 multi-device acceptance. No new migration or Vercel setting is required. The previous migration's history comment was moved inside its transaction solely to satisfy the repository's begin-first convention; no SQL behaviour changed.

## Early endings — 26 October

Ending a mutually accepted conversation now asks for confirmation. Both guests receive the same discreet, durable in-page notice: **This conversation has ended**. A skipped, unavailable or interrupted offer says **This introduction has ended** instead. No actor, reason or contact detail is included. Matching pauses for each guest independently until she chooses **Find someone else** or **Leave networking**; Get help remains available. The old portrait and timer disappear. A normal completed timed round still rotates automatically.

The notice survives refresh and reconnection. It is not an email, push notification or promise of immediate delivery while offline; foreground polling remains five seconds. Leaving networking also ends the current pairing and gives the remaining guest the choice. Host pause/Admin disable prevent continuation, and cancelled registration fails the eligibility check. A notice-specific acknowledgement prevents stale tabs from clearing a later interruption. Early-ended introductions still do not enter People you met; no retention policy changed.

Migration `20261026063649_event_networking_private_end_notice.sql` applied live, with local filename aligned to the recorded Management API version. No local database runtime is available, so SQL was rehearsed in rollback-only transactions using the live project's tagged fake fixtures, then applied once. Both 34-assertion test 069 and 23-assertion test 070 passed before and after application; no test data or outbound emails were retained. Test 069 now explicitly acknowledges interruptions and advances fake offer deadlines with its synthetic clock.

Actual-component L1 tests cover actor ending, peer notice, refresh-loaded notice, failed/duplicate continuation, no stale portrait/timer, pause and eligibility. TypeScript, full tests and production build passed. At 320px/390px the example-data notice has no horizontal overflow and controls are at least 44px tall (`tmp/networking-ended-example.png`). This is not a two-device L3 rehearsal; that acceptance remains open. Advisors retain the existing deny-all private-table notices; the new authenticated SECURITY DEFINER warning is the intentional own-notice RPC, protected by authentication, eligibility, notice ownership and the session lock. Existing unrelated advisories remain outside this change.

### When guests see networking

Registration alone does not permit participation. A confirmed guest can open the event and see its scheduled countdown, but must check in before joining. A checked-in guest sees the in-page Join networking option; once the Host starts, the panel shows Live now and updates while open. Physically attending without recorded check-in is insufficient. There is no site-wide alert, automatic email/push prompt, automatic opt-in or location tracking. Merely reaching the start time does not start a Host-controlled session.

## What is implemented

Visual follow-up: an in-page countdown strip introduces the scheduled session, a gentle green radar appears only while a joined guest waits, and a portrait card replaces it when matched. No simulated match percentage or automatic sounds. Reduced-motion preferences and a local Pause animation control are supported; pausing animation never pauses the actual session. See [members’ club UI handover](MEMBERS_CLUB_UI_HANDOVER_20261025.md).

### Research-led design revision — 25 October

The first radar panel was too tall and explanatory. The revision uses a restrained editorial header, a single round timer inside a subtle animated dial, short waiting copy and expandable Why might I wait? guidance. Once matched, the actual member portrait/initial, first name, introduction, meeting point and clock become the focal information. There are no invented attendee portraits or match percentages. Failed portrait loading reveals the initial fallback; a new match remounts its portrait so a previous image failure does not carry over.

Alignment with the owner's two visual references is **directional, not a literal replica**: the first contributes warm ivory, an editorial event feel and human photography; the second contributes clear app structure, portrait-led introductions and explicit actions. The approved green identity remains. Neither the poster's dense ornamental layout nor the mockup's full black/gold palette is copied. Real member photography still depends on members uploading a profile photo.

Research informed the emphasis on clear participants, time, place and explicit consent—not the visual palette:

- [Brella on-site meetings](https://help-attendees.brella.io/en/articles/189148-understand-1-1-brella-meetings) — acceptance and a clear meeting location/table.
- [Swapcard meeting flow](https://help-attendees.swapcard.com/en/articles/8185472-how-to-book-meetings-with-other-attendees) — a prominent next action and a distinction between meetings and connection requests.
- [W3C Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide) — retain a separate motion pause control and reduced-motion support; pausing the visual never freezes real session time.

Completed networking opens People you met automatically and explains the current 14-day event-history window. Accepted connections remain under People → Your connections; the refinement does **not** create a permanent unconnected-introduction archive. A lasting personal history would require a separate retention/access design and is a suggested follow-up, not an already-delivered feature.

UI verification: actual-component tests cover the new completed-history state as well as prior recovery, consent and timer states. Browser example-data checks at 320px and 390px showed no horizontal page overflow; the waiting view has exactly one timer. Desktop layout checked separately. Evidence: `tmp/networking-match-refined-example.png`, `tmp/networking-radar-refined-example.png`. These are UI fixtures, not live matches or a full multi-device rehearsal. No SQL, matching algorithm, registration, payment or membership rule changed.

- A Host schedules one networking session within a published in-person or hybrid event: start/finish, 2–15 minute conversations, 30–180 second changeover, 1–30 distinct meeting points, optional conversation starter. Default proposal is a 30-minute session.
- Host starts at or after the scheduled time, pauses, resumes or finishes. Pausing freezes the round, but never extends the event/session's hard finish. Super Admin can disable/re-enable the feature for that event; a Host cannot override this.
- Guests take part on the event page, without navigation. Joining requires explicit consent, a checked-in (`attended`) valid place, a visible active/pending profile and a valid associated order if present. Free approved orders and paid/fulfilled orders qualify. Cancelled/refunded orders do not.
- Only the assigned partner sees first name, existing profile photo and a short introduction. Joining does not disclose email/phone, grant membership, create a connection or open messaging. Introductions reject contact details/links.
- Each offer has a 30-second acceptance window; both people accept before a conversation is active. All conversations in a round share its server end time, so acceptance uses part of the round rather than starting a new full-length timer.
- Every offered pairing is recorded uniquely for the event, including declined/expired offers. Those pairs never repeat in this session. Matching prioritises guests with fewer conversations, then those waiting longest. An uneven pool may have a fair break; constrained matching is not a promise to meet every guest.
- Refresh preserves assignments. Foreground state polls every five seconds, uses server time plus a monotonic elapsed clock, resynchronises on focus/online, hides stale matches on failure, and pauses heartbeat while hidden. This is not Supabase Realtime.
- Only present, opted-in guests receive new offers. Locking a phone does not terminate an already mutually accepted **in-person** conversation. On explicit departure, cancellation, refund, block or profile ineligibility, the pairing closes on the next authorised tick. Late arrivals can join if at least a minute remains; otherwise they wait for the next round. An unanswered offer expires; guests choose whether to return to the pool after an early interruption.
- Ending a conversation is distinct from leaving networking. Skips are discreet; no reason is disclosed to the other person. Guests can also leave while paused/disabled.
- Completed mutual introductions appear under People you met. Stay connected requires another explicit confirmation and uses the existing connection-request function, including its active-member, block, cooldown and notification rules. Event-only guests do not gain member messaging.
- Get help writes a private request to the selected event's Host/Admin networking panel. One outstanding request per guest. It is not an emergency service or an email/push alert; the Host must monitor the panel and guests should speak to the venue team if urgent.
- Host attendance is limited to joined names/readiness/pairing state, not a private conversation feed. Reads that fail do not show an all-clear or stale ready counts.

## Where to find it

**Host:** published in-person event → Host tools → Networking rounds → Schedule networking. Save the schedule, then Start networking during its time window. No per-pair Admin review is needed.

**Guest:** open the booked event → Meet someone new. Check in at the door, add a short introduction and press Join networking. Keep the panel open between rounds. A valid free place works too.

**Super Admin:** Events → selected published in-person event → Live networking · Host session and safety controls. Disable is independent of the older manually reviewed Table conversations tool.

## Database and security

Migration `supabase/migrations/20261025060849_event_networking_pairs.sql` **applied live**, history name `event_networking_pairs`, version `20261025060849`. Local CLI-created filename was aligned to the Management API's recorded version after application. No existing event was scheduled/enabled and no real booking, payment or role changed. No Vercel environment variable, cron or AI key is required.

Follow-up `supabase/migrations/20261025061732_event_networking_account_cleanup.sql` also applied live. All six new Auth-user foreign keys now cascade personal rows or null the actor reference, rather than introducing account-deletion blockers. The Host action log keeps its non-personal event/action/time data. Verified via a rollback rehearsal and the applied live constraint catalogue; this does not claim a full end-to-end account-deletion rehearsal.

Tables and internal helpers are in unexposed `hat_networking`, with RLS and no client schema/table/function grants. Public authenticated RPCs use explicit role/guest checks and an empty search path. Session-row locks serialize mutation and matching; pair uniqueness prevents duplicate event introductions. Private helpers are not callable by anonymous or authenticated users. The skill-guided database design uses least privilege and short transactional locks; existing table plans, publishing gates, payment processing and messaging are unchanged.

Supabase advisors were checked before and after. New RLS-without-policy notices are intentional deny-all private tables, not a missing member-read policy. Authenticated `SECURITY DEFINER` notices are intentional scoped RPC entry points, not a claim that every signed-in user is authorised. Do not silence them with broad table grants. Existing unrelated project advisories were not changed. Background: [Supabase function security](https://supabase.com/docs/guides/database/functions), [advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Verification — keep the levels distinct

| Level | Evidence | Limits |
| --- | --- | --- |
| L1 — Code and controlled execution | `npm run test:event-networking` executes clock/phase boundaries and the actual member/Host component with controlled failures: mutual-offer UI, double-click lock, rejected-write cleanup, stale-read hiding, reconnect, hidden-page heartbeat, Host commands and check-in guidance. Integrated into `npm test`. | Mocks are not a real multi-device session. |
| L2 — Database integration | 34 assertions in `supabase/tests/069_event_networking_pairs.sql` exercised against the live project's real existing auth/profile/order/connection functions in rollback-only transactions, before and after application. Covers scoped permissions, free/paid checked-in guests, mutual accept, odd numbers, fresh pairing, block invalidation, skip, timeout, phone lock, explicit connection, Host help, Admin disable and revoked guests. Live schema/grants inspected after application: no real sessions, no retained tagged fixture accounts; anon RPC execution and client private-schema usage both false. | Rollback is not a persistent browser rehearsal; real parallel-device contention has not been demonstrated. |
| L3 — Human/browser outcome | Actual component rendered at desktop and 390px; no horizontal overflow. Example-data screenshots: `tmp/networking-desktop-example.png`, `tmp/networking-mobile-example.png`. | Static example preview only. Independent Host + 10–20 checked-in guests over several real timed rounds, device lock/reconnect, persistent refresh and notifications still require acceptance. Not marked production acceptance complete. |

Full local test suite, TypeScript and production build passed. No real outbound email was sent during the rollback fixture.

## Pilot acceptance checklist

- [ ] Use a dedicated test event and explicitly opted-in test guests, not unsuspecting real attendees.
- [ ] Check in at least five guests, including a free-ticket and a paid-ticket guest; leave one confirmed but not checked in.
- [ ] Host starts; two devices accept the same introduction and show the same meeting point/end time. A single acceptance must not start it.
- [ ] Refresh, lock/unlock a phone, briefly disconnect, then reconnect. The shared clock must not restart; an accepted face-to-face conversation survives the phone lock.
- [ ] Run at least three rounds. Nobody appears twice, waiting guests rotate and a late arrival joins safely.
- [ ] Skip, fail to respond, leave a round, leave networking, block someone and revoke an event place. Verify the other device's discreet feedback and no stale match after the next update.
- [ ] End an accepted conversation early. Both devices show the generic notice, no old timer/portrait and no new match until each guest chooses. Refresh one device; its notice remains. Find someone else must not repeat the ended pair; leaving must not alter the event booking. Verify no email/push is sent for ending.
- [ ] Host pause/resume, Super Admin disable, Host denied resume, Admin enable and Host finish. End time remains authoritative.
- [ ] Send help and mark it handled on the Host panel. Verify another event's Host cannot read it.
- [ ] After a completed introduction, send an explicit connection request, inspect the pending request on the recipient account and accept/decline; verify messaging still needs acceptance.
- [ ] Confirm error recovery on physical iOS/Android PWA and keyboard/screen-reader use; no real connection notification should be sent without tester consent.

## Deliberately not included

Groups of three, native video/temporary online text rooms, AI matching, cross-event “already met” inference, automatic contact exchange and emergency dispatch. The first release is an in-person pairs flow, not a promise to provide those modes.
