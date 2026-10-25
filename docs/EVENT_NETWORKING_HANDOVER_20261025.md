# Meet someone new — in-person networking

Updated: 25 October 2026. First release: pairs only, up to 200 participants per event.

## What is implemented

Visual follow-up: an in-page countdown strip introduces the scheduled session, a gentle green radar appears only while a joined guest waits, and a portrait card replaces it when matched. No simulated match percentage or automatic sounds. Reduced-motion preferences and a local Pause animation control are supported; pausing animation never pauses the actual session. See [members’ club UI handover](MEMBERS_CLUB_UI_HANDOVER_20261025.md).

- A Host schedules one networking session within a published in-person or hybrid event: start/finish, 2–15 minute conversations, 30–180 second changeover, 1–30 distinct meeting points, optional conversation starter. Default proposal is a 30-minute session.
- Host starts at or after the scheduled time, pauses, resumes or finishes. Pausing freezes the round, but never extends the event/session's hard finish. Super Admin can disable/re-enable the feature for that event; a Host cannot override this.
- Guests take part on the event page, without navigation. Joining requires explicit consent, a checked-in (`attended`) valid place, a visible active/pending profile and a valid associated order if present. Free approved orders and paid/fulfilled orders qualify. Cancelled/refunded orders do not.
- Only the assigned partner sees first name, existing profile photo and a short introduction. Joining does not disclose email/phone, grant membership, create a connection or open messaging. Introductions reject contact details/links.
- Each offer has a 30-second acceptance window; both people accept before a conversation is active. All conversations in a round share its server end time, so acceptance uses part of the round rather than starting a new full-length timer.
- Every offered pairing is recorded uniquely for the event, including declined/expired offers. Those pairs never repeat in this session. Matching prioritises guests with fewer conversations, then those waiting longest. An uneven pool may have a fair break; constrained matching is not a promise to meet every guest.
- Refresh preserves assignments. Foreground state polls every five seconds, uses server time plus a monotonic elapsed clock, resynchronises on focus/online, hides stale matches on failure, and pauses heartbeat while hidden. This is not Supabase Realtime.
- Only present, opted-in guests receive new offers. Locking a phone does not terminate an already mutually accepted **in-person** conversation. On explicit departure, cancellation, refund, block or profile ineligibility, the pairing closes on the next authorised tick. Late arrivals can join if at least a minute remains; otherwise they wait for the next round. An unanswered offer expires; a responding partner can return to the pool.
- Leaving a round is distinct from leaving networking. Skips are discreet; no reason is disclosed to the other person. Guests can also leave while paused/disabled.
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
- [ ] Host pause/resume, Super Admin disable, Host denied resume, Admin enable and Host finish. End time remains authoritative.
- [ ] Send help and mark it handled on the Host panel. Verify another event's Host cannot read it.
- [ ] After a completed introduction, send an explicit connection request, inspect the pending request on the recipient account and accept/decline; verify messaging still needs acceptance.
- [ ] Confirm error recovery on physical iOS/Android PWA and keyboard/screen-reader use; no real connection notification should be sent without tester consent.

## Deliberately not included

Groups of three, native video/temporary online text rooms, AI matching, cross-event “already met” inference, automatic contact exchange and emergency dispatch. The first release is an in-person pairs flow, not a promise to provide those modes.
