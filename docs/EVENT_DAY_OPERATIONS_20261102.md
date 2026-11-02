# Event day — delivery and acceptance

Updated: 2 November 2026.

## What changed

Hosts of published in-person/hybrid events now open on **Event day**. Event details, Poster, Schedule, Networking and Guests & check-in remain available. The selected section still survives refresh without repeated page redirects.

Admin → Events → **Event day** provides the same event-scoped attendance overview. Choose one event at a time; simultaneous events are never combined. Existing check-in reversal and staff controls remain under **Check-in corrections and Admin tools**.

The overview shows confirmed guests, checked in and not checked in. Check-in is an arrival record, not a count of people currently inside. Guests who report running late or not attending remain a subset of not checked in until they arrive. The system does not label them no-shows.

Networking separates **In conversations**, **Awaiting acceptance** and **Ready to meet**. These count people, not pairs. Both participants must accept before a conversation counts; a phone going to sleep does not erase an accepted conversation. Breaks, absence from the app and choosing what to do next are separate. Scheduled, paused, disabled and ended sessions do not display invented live zeros.

Hosts retain the existing independent scanner and Guests & check-in tools for assigning helpers, recorded operator activity and private CSV export. Scanning access remains event-bound. A helper does not gain roster, private attendance-note, finance or networking-management access.

## Guest attendance updates

On **My tickets → View ticket**, an eligible guest can choose **I’m running late** or **I can’t attend**, add an optional 280-character note and send it to the Host. They can return to attending as planned. Updates close after check-in, the event ends, or event/registration access is withdrawn.

Notes are accessible only to that guest, the event’s active Hosts and authorised event Admin. They are not copied into scanner responses, emails or CSV exports. Existing event staff with authorised event-management scope can view the overview; an ordinary scanning-helper assignment cannot.

An attendance intention is **not a cancellation**: it does not release capacity, revoke a pass, alter payment state or request a refund. The form explains this before sending and points guests to Manage my place for booking changes. Hosts see updates through foreground refresh; this slice does not send an extra email for every attendance update.

## Freshness and failure states

The new overview refreshes every 10 seconds while visible, with a refresh-age label and manual Refresh. Reads have a 15-second timeout; old search responses cannot replace newer results. Offline, failed and more-than-45-second-stale reads hide the figures instead of showing zero. Returning to the app requests fresh data. Guest plan reads use the same recovery behaviour. Scanner access remains independent of a dashboard read failure.

The standalone networking management panel uses the same canonical count calculation. Its count display expires if a refresh stalls; existing mutual consent, blocked-pair checks, shared schedule and private end notices are unchanged.

## Database and configuration

Applied live: `20261102134607_event_day_operations.sql`.

New private table: `hat_event_ops.attendance_plans`, RLS enabled with no client schema/table access. Four authenticated RPCs have explicit account/event checks, empty search paths and anonymous execution revoked. Private networking summary is read-only: it neither heartbeats members, joins the Host nor advances rounds.

No new Vercel environment variables or owner-run SQL are required. `supabase/tests/073_event_day_operations.sql` is a rollback-only test, **not a migration**.

Security advisors before/after: no new anonymous function grants. The private table’s deny-all RLS notice and four deliberately authenticated, guarded security-definer RPC notices are expected. Existing project-wide function-grant notices, disabled leaked-password protection and previously reported dependency alerts remain separate security work; this release is not project-wide security clearance.

## Verification levels

| Level | Evidence | Result |
| --- | --- | --- |
| 1 — Code and component behaviour | Actual polling hook and components exercised: visibility/offline/stale reads, abort/query races, paging/search, failed-save draft preservation, duplicate-write lock, safe rendering and control visibility. Existing networking/Host/ticket regressions, complete test suite, TypeScript and production build. | Passed |
| 2 — Database and integration | 51 rollback SQL assertions: private note access, helper/member/anonymous denial, event isolation, 31-guest paging, arrival subsets, accepted vs offered counts, read-only monitoring, suspended/invalid-place denial, unchanged pass/booking/payment and no private notes in exports. | Passed |
| 2 — Independent real Auth/API sessions | 13 checks through Supabase API: save/read in a fresh session, Host and Super Admin visibility, helper/unrelated-member denial, absent/late subsets, unchanged pass and order, clear update and scheduled-count state. One private registration-closed tagged fixture, audited closure verified, zero provider emails. | Passed |
| 3 — Visual presentation | Actual component markup with clearly labelled example data inspected in browser at desktop and 390 px mobile. Mobile document width equalled viewport width; no horizontal overflow. | Passed for example-data presentation only |
| 3 — Real event rehearsal | Physical phones/PWA, venue connectivity, simultaneous helper scans, Host monitoring while guests accept/end rounds, and independent member browser interactions. | Still required |

Evidence files are local under `tmp/event-day-api-rehearsal-*.json`, `tmp/event-day-mobile.jpg` and `tmp/event-day-desktop.jpg`; they contain no credentials. The fixture was closed and SQL-test accounts/events were confirmed absent after rollback.

## Short tester handover

1. Host opens an in-person event → Manage your event → Event day. Check the totals and event name; changing events must not show the previous event’s private notes.
2. A confirmed guest opens their ticket, sends a late update and refreshes. Host sees it within a foreground refresh; another member/helper must not see it.
3. Guest sends can’t attend. Confirm the existing ticket and booking remain valid. Clear the update; it disappears from the absence subset.
4. Assigned helper signs in on a phone, opens the event-specific scanner and checks the guest in. Verify Host sees arrival time/operator and that late/absence totals no longer include that checked-in guest. A pass for another simultaneous event must fail.
5. Host starts networking. Offer one introduction: those two guests are awaiting acceptance, not talking. After both accept, they move to In conversations. Ending the round removes them from that count without sharing a reason.
6. Pause networking, background the app and briefly disconnect. No old live counts or false zero totals should be presented as current; reconnect/refresh restores verified figures.

Do not use real guest records to test cancellations, refunds or destructive actions. Physical-device acceptance remains an explicit launch operation, not something code inspection can certify.
