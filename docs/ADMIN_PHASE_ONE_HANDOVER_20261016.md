# Admin audit — Phase 1 handover

16 October 2026, Africa/Nairobi. Tasks ADMIN-01–04 implemented. This closes implementation work for phase 1, not the full Admin operational-acceptance track.

## Changes

- All ten Admin data pages now resolve an active role through a database-time, expiry-aware operation with deterministic Super Admin → Event Staff → moderator priority. A failed check denies entry. Privileged Nia/test-user/privacy APIs use the existing shared active-Super-Admin and origin check before service calls. Nia's cooldown fails closed on a read error.
- Account anonymisation enters `processing`, retaining its timestamp. Auth blocking and avatar removal have durable checkpoints. A failure preserves completed steps; Admin can refresh and choose **Retry cleanup**. Only both recorded steps complete the request and emit the final cleanup audit event. The UI recovers from a failed request and refreshes partial outcomes. Earlier completed legacy requests are not automatically reopened by this migration; none existed at the audit snapshot.
- The notification worker validates queue-completion results. `providerAccepted` and durably recorded `sent` counts are separate; failed persistence returns a recoverable 503 instead of a false successful count. Existing job-id provider idempotency and scoped invitation dispatch remain. No live email was sent for acceptance.
- Refund approval now records approval and `refund_pending` for both payment methods. Manual completion requires a separate confirmed external transfer reference, then updates the order, access and audit history once. Paystack wording directs Admin to arrange the refund in the provider dashboard; this release does not initiate a provider refund or move money. Automatic checkout remains off.

## Evidence

| Task | L1 — code/controlled execution | L2 — real integration | L3 — operational outcome |
| --- | --- | --- | --- |
| ADMIN-01 active permission guards | PASS: shared guard denial, provider/test-user denial before service use, failed cooldown and role-resolver errors; full tests/typecheck/build | PASS: expired/active role resolution in live rollback SQL | OPEN: independent browser role/expiry/revocation rehearsal |
| ADMIN-02 resumable cleanup | PASS: denied, Auth/Storage/checkpoint failures, thrown request and checkpoint reuse with mocked services | PASS: actual anonymisation/processing, failed-step checkpoint, retry/final completion and one final audit, all rolled back | OPEN: disposable account + real Storage/Auth failure/retry/reload acceptance |
| ADMIN-03 durable email outcomes | PASS: returned/thrown completion errors, provider failure, accepted-versus-saved totals; no external sends | Existing queue APIs are live; new failure recovery not exercised against the real provider/database outage | OPEN: controlled provider/persistence failure and recovery |
| ADMIN-04 refund workflow | PASS: wired separate completion, reference guidance, truthful provider/manual copy | PASS: approval remains pending, missing reference refused, completion persisted/idempotent and ordinary-member denial, all rolled back | OPEN: scoped Admin browser workflow; no money transfer performed |

`npm test`, `npm run build`, `npm run test:admin-phase-one` and focused worker tests passed. Test `supabase/tests/064_admin_phase_one_recovery.sql` ran successfully against project `gtzwqromwvzqytygebfc`; it used tagged identities, synthetic event/order/refund/privacy records and transaction rollback. It is **a test, not a migration**. The first connector attempt lost its request state; no passing result was claimed until a repeat produced the explicit PASS. Cleanup query confirmed zero fixture events, temporary tagged-account roles or processing cleanup records.

Migration `20261016035557_admin_phase_one_recovery.sql` is applied live. No owner SQL action is needed. Anonymous execution is revoked for the new/changed privileged APIs. Security advisors flag four intentionally authenticated security-definer operations: cleanup execution/checkpoints and refund review/completion. Each checks active privilege or event scope, has a fixed empty search path and was covered by denial/state checks. These are intentional bounded privileged operations, not unguarded public grants. Other pre-existing advisor findings remain separate.

## Limits and next work

Auth banning blocks new sign-in; it is not presented as proof that an already-issued JWT instantly becomes invalid. Actual token/session acceptance and all protected-content boundaries still require the phase-5 security rehearsal. External cleanup does not run inside the database transaction, which is why steps are durable and retryable. Do not mark the full privacy feature L3-verified from the rollback test.

Phase 2 is next: reliable decision handlers, retained drafts, support-recipient context and empty-versus-unavailable threads. Phases 3–5 remain queued: trustworthy counts/readiness, navigation/wording simplification, pagination/activity and full acceptance. The [audit and taskboard](HAT_ADMIN_AUDIT_20261016.md) retain the original findings and now link to this implementation evidence.
