# Event-first guest booking — 4 November 2026

## The two journeys

**Host:** join HAT and complete the existing Host eligibility/approval process → create an event → share its public link. This release does not grant new hosting or publication rights.

**Guest:** open the shared public event page → read details, Host, date, venue and price → add name and email, accept booking terms → enter the emailed one-time code on that same page → choose a ticket and confirm/request the place. No HAT membership application or member profile completion is required for event-only booking.

Free instant confirmation is an event Host setting, not membership auto-approval. It is no longer tied to the membership pilot’s expiry. One-person, ticket inventory and total event capacity limits still apply. Reviewed events stay reviewed; paid events do not confirm from a typed payment reference.

After confirmation, the private web ticket, PDF and branded confirmation offer optional next steps. HAT membership remains a separate request. A linked Community is offered only when its public preview is allowed or the guest is already authorised to see it. Its admission rules remain unchanged; nobody is automatically joined or connected.

## Delivery and verification

| Level | Evidence | Status |
| --- | --- | --- |
| 1 — Code and controlled behaviour | Actual form tests cover consent, OTP, resend cooldown, duplicate-submit lock, failed-code retry, verified-email/save failure and returning identities. Actual event-page renders cover anonymous/open/paused/new/returning/failed-details/Host-preview states. PDF annotations and email links verified. Full `npm test`, TypeScript and production build passed. | Passed locally |
| 2 — Live installation | `20261104071725_event_first_guest_booking.sql` applied and migration history/RPC/table installation confirmed in `gtzwqromwvzqytygebfc`. | Confirmed |
| 2 — Real email identity | Approved new Gmail alias received an OTP. User supplied it; Supabase verification succeeded. Profile remained `pending`. No membership application was submitted, no ticket sent and no original member account changed. | Passed |
| 2 — Complete booking/database rehearsal | Rollback-only test 077 exercised booking/payment/capacity/permission paths but stopped at the synthetic Community’s existing publication gate. Fixture was corrected to satisfy that gate transaction-locally; full rerun is still required. Further live-service calls were blocked by the tool approval system’s usage limit. | Open — not a passed suite |
| 3 — Real guest browser/inbox journey | Inline booking, refreshed ticket, PDF attachment in the real inbox and optional Community/member journeys, on mobile and desktop. | Open |

`event_guest_access` remains **off**. No release checks were marked passed in production. The migration does not enable the flag. This is implemented and locally verified work, not a declaration that public guest entry is live.

## Database boundaries

- Event-only name and consent live in private `hat_event_ops.guest_details`, keyed by event and current Auth identity. No direct client table access.
- Public RPCs require a verified email, eligible account status and the signed-in identity. Consent is event-specific.
- No profile access promotion, member role, membership application, pilot-cohort entry or Community join is created by booking.
- Private, closed, ended and suspended-account paths retain denial. Existing registration/payment/fulfilment, cancellation, entitlement, ticket and queue engines are reused.
- Pausing guest entry blocks new guest bookings without cancelling existing confirmed tickets.

## Finish before opening public guest entry

1. Rerun `supabase/tests/077_event_first_guest_booking.sql` (a **test**, not a migration) in a rollback-only session. Confirm fixture absence afterward and that `event_guest_access` is still off. Rerun ticket test 072 and updated guest test 002 in their proper test harness; 002 requires pgTAP/search-path setup.
2. Run security advisors and review only new findings against the recorded baseline. The earlier dependency-security work remains separate and open.
3. Use an explicitly authorised, clearly labelled test event and independent Host/guest sessions. Do not publish a real event or open the global flag merely to avoid the launch gate.
4. Verify real free booking, duplicate/full/error/retry, refresh, cancellation, reviewed and paid boundaries. Confirm no membership/pilot/Community access changes.
5. Verify the real PDF confirmation reaches the approved inbox and matches the online pass; never share its QR or backup code publicly.
6. Complete Admin Release evidence truthfully, then Super Admin can open guest entry in Admin → Events. Hosts choose the free-confirmation setting in Host tools → Booking settings. New Vercel variables are not required; existing Supabase and Resend configuration is reused.

## Rollback

Super Admin pauses new guest entry with the existing switch. Existing tickets remain available subject to current booking/cancellation rules. Hosts can turn instant free confirmation off independently. Do not drop booking data or rewrite applied migrations to roll back product availability.

## Files and operator notes

The migration was already applied; do **not** rerun it manually. The new 077 file and legacy 002 are tests, not owner migrations. Generated sample ticket uses example identities and is not valid for entry. Unrelated pre-existing local migration edits and documents were not included in this release.
