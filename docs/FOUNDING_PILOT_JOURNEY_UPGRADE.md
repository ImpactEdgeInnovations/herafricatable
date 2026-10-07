# Founding pilot journey upgrade — 7 October 2026

## Completed

- [x] Repair event invitation RPCs using `canonical_event_id`.
- [x] Exclude tagged test accounts from member discovery and recommendations.
- [x] Open the first free Community automatically for eligible founding members.
- [x] Preserve open / Host approval / invitation-only joining choices.
- [x] Let an invited member join an invitation-only Community securely.
- [x] Let eligible pilot Hosts publish event content, programme and images without Admin review.
- [x] Queue invitations to new emails automatically for eligible pilot destinations.
- [x] Add immediate, sender-authorised delivery through the existing Resend worker.
- [x] Bring membership, event and Community pilot controls into Admin → Members.
- [x] Retain global pause, individual suspension and audit records.
- [x] Make Host sections switch in place and member browsing open by default.
- [x] Reduce member Home and Community introductory spacing.
- [x] Distinguish failed event loading from a genuinely missing event.
- [x] Replace contradictory review wording in the main pilot journeys.
- [x] Make instant booking labels respect pilot expiry.
- [x] Exclude rehearsal accounts from the 20 real-member allocation count.

## Live database verification (all test writes rolled back)

| Test | Result |
|---|---|
| Founding member creates open Community | Published, open joining, public preview enabled |
| Founding member creates invitation-only Community | Published, public preview disabled |
| Invited active member joins invitation-only Community | Active membership |
| Host publishes event summary/programme | Approved workspace, live summary and programme |
| Host invites a new email | Sent invitation state, recipient-specific email job queued |
| Host lists event invitations | Query succeeds; obsolete-column failure removed |
| Admin pauses event/Community creator switches | Both eligibility checks become false |

Queued is not the same as delivered. The interface confirms “emailed” only when the provider worker reports a send. A real inbox receipt, OTP round trip, mobile visual acceptance and full capacity/cancellation rehearsal remain operational acceptance checks—not claims of completion from source-code tests.

## Migration order

The four CLI-created migration files were ordered after the existing 09:00 joining-policy migration so clean installations retain the final policies:

1. `20261007100000_module_journey_audit_fixes.sql`
2. `20261007100100_founding_pilot_self_service.sql`
3. `20261007100200_pilot_invitation_and_publication_completion.sql`
4. `20261007100300_pilot_control_consistency.sql`

All four were applied through the connected Supabase migration tool to project `gtzwqromwvzqytygebfc`. Do not rerun them manually; they include function renames. Existing user-edited historical migrations were preserved.

## Deliberate boundaries

The open membership pilot is timed; the real first-20 cohort receives creator privileges. Each eligible member gets one automatic free Community and the existing free-event limits. Paid creator commerce does not bypass approval. Turning off automatic creator controls stops new automatic openings, updates and pilot invitations; it does not silently cancel existing memberships or bookings. Use individual suspension for an existing member, event or Community.

## Remaining acceptance

- [ ] Verify deployed member and Host screens on desktop and mobile.
- [ ] Confirm a real invitation reaches an inbox and returns to its destination after OTP/onboarding.
- [ ] Rehearse full capacity, last-place competition, cancellation and rejoining with separate accounts.
- [ ] Test reporting, Host removal and Admin suspension with an opened pilot Community.
- [ ] Review historic database security-advisor findings separately; this upgrade does not certify every legacy RPC.
