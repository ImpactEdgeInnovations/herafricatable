# Admin audit — Phase 3, first reliability slice

25 October 2026, Africa/Nairobi. ADMIN-07/08 are **in progress**, not fully accepted. No migration, new permission, role change or payment action is required.

## Delivered

- Today distinguishes known zero from failed, missing or known-truncated queue data. Exact-count metadata is requested with the existing authorised list RPCs. A returned list shorter than that count cannot claim a complete queue.
- Events, drafts, registrations, refunds, Community proposals and safety queues carry unavailable states into the action centre. Known work remains visible, but an incomplete collection cannot say All clear. Member test-account filtering and existing active-role checks remain.
- Safety combines the existing member, marketplace, Community post/check-in, meetup, event-question and photo-report sources. A failed source or a photo page with more results makes the combined count unavailable rather than silently undercounting it.
- Failed joining-settings reads no longer guess that manual review is active. Automatic joining is described without promising eligibility outside the configured pilot limits.
- The legacy member-list fallback lacks application status. It can no longer imply that there are zero requests waiting when the current application-aware source fails.
- Release tools actually load the activity-target RPC used by their summary. They do not require the unrelated 30-day analytics list just to display those targets.
- The readiness summary withholds its percentage if any required input group fails or is empty. Conflicting checks within a feature cannot be treated as complete by selecting only its first row. Checklist progress is explicitly distinguished from code completion and permission to go live.
- Activity targets are labelled separately. Empty/failed database, feature and launch reads explain recovery without incorrectly telling the owner to rerun migrations.

## Verification levels

| Level | Result | Scope |
| --- | --- | --- |
| L1 — controlled execution | PASS | Actual Admin Today server-page rendering under denied/signed-out, empty, returned-error, test-tag failure, truncated list and partial photo-page fixtures. Actual queue and readiness components rendered under each missing input group, conflicting feature evidence and legitimate zero. Full tests/typecheck/build run for this slice. |
| L2 — real integration | Selected read-only evidence | Live SQL catalog confirmed the existing RPCs, report return fields and photo-page arguments/shape. Production has 10 activity-target records; an authoritative aggregate reported 5 non-test active members at inspection. A real public-key SDK request returned exact zero count metadata for unsigned event-management access, and the Admin readiness RPC denied that unsigned caller. These are not a signed-in Admin session. No record, sign-off, membership, notification or permission was changed for these checks. |
| L3 — observed UI | Layout only; operational acceptance OPEN | Isolated real-component fixture checked on desktop and 390 px phone with no horizontal document overflow. It contains example data and cannot submit live actions. No independent Super Admin save/reload or forced live network-failure rehearsal is claimed. |

Supabase guidance kept the work on existing role-guarded reads and prevented a read error from being misdiagnosed as a missing migration. Exact-count behaviour was checked against the current JavaScript reference: https://supabase.com/docs/reference/javascript/rpc .

## Still open in Phase 3

1. Replace broad list-derived Today reads with purpose-built authorised aggregates for large installations; this release detects known truncation instead of claiming a complete total.
2. Carry the same complete/partial/failed treatment through Community oversight and every specialised operations summary.
3. Verify complete source/catalog coverage and group denominators against independent Super Admin API reads; do not infer completeness merely from a nonempty group.
4. Run an authorised Super Admin browser rehearsal: successful read → reload, expired/revoked session, failed dependency, paged safety queue and independent role boundaries.
5. Record the actual release decision separately. No launch percentage or acceptance gate has been increased by these engineering checks.
