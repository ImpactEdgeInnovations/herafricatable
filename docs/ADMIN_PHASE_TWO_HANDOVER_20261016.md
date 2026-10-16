# Admin audit — Phase 2 handover

16 October 2026, Africa/Nairobi. ADMIN-05/06 implementation complete; operational acceptance remains open. No database migration or owner configuration is required.

## Changes

- Membership decisions and intake/pilot controls, Community applications/lifecycle/membership controls, event lifecycle/proposal/Host controls, invitations, registration/refund reviews and privacy decisions now share a synchronous operation lock. It covers confirmation as well as saving, prevents competing clicks before React rerenders, and releases controls in `finally` after thrown failures. Inputs cannot change underneath a pending decision. Backend permissions and business rules remain authoritative and unchanged.
- The handler records when a database operation actually succeeded. A subsequent thrown refresh error is not presented as a failed save. An unconfirmed network outcome asks Admin to refresh and check the saved record before retrying. No mutation is retried automatically. A Community details save followed by a failed joining-setting save is explicitly identified as partial.
- Confirmed decision notes are kept in component memory by record **and action** after a failed save. A confirmed success clears that draft. Notes cannot move from one applicant/invitation/refund to another. This is not browser/device storage and does not survive a full reload or closing the page; cancelling an unsubmitted dialog is still cancellation. Each newly opened dialog gets fresh form state.
- Support replies and member-visible action notes are keyed to the selected request. The recipient's name/email is shown immediately above the reply. Switching requests preserves each unsent draft separately. Late responses update only the original request; they cannot erase a different recipient's draft. A full-page exit warns about unsent reply/note text. Clear draft is explicit.
- Support conversation read failures show **Replies could not be loaded**, with an in-page retry. They are not shown as **No replies yet**. Reply and management actions remain disabled until the conversation can be read. Saved replies are distinguished from email delivery; membership/invitation/lifecycle feedback no longer treats a queued message as proof of inbox receipt.

Coverage includes the canonical Members, Communities and Events workspaces and their older Work areas decision components. This does not claim every specialised programme/media/billing control in the 83-file audit has been rewritten; those retain their own acceptance work.

## Verification

| Level | Evidence | Status |
| --- | --- | --- |
| L1 — code and controlled execution | `scripts/verify-admin-phase-two.mjs`: synchronous duplicate lock, cancelled/returned-error/thrown-error decision paths, saved-versus-refresh failure, record/action-scoped retained notes, wrong-recipient isolation, support failed reads/sends, late completion and normal success. Executes the actual shared hook, dialog hook, event decision handler, Support component and Support server page with mocked services. Full repository tests, TypeScript and production build also pass. | PASS |
| L2 — real integration | Existing RPC names, arguments, role guards and notification services are reused. This phase did not perform a live Admin mutation, send email, change roles or alter money/account records. The earlier audit/catalog and Phase 1 SQL evidence do not prove these new UI failure paths. | OPEN for new recovery paths |
| L3 — operational outcome | Independent Super Admin browser save → reload, expired/revoked session, disconnect during save, two requests with drafts, controlled reply/inbox receipt, keyboard and mobile checks. | OPEN |

`npm test` initially caught old contracts tied to “email was sent” copy and a direct error-helper import. Those contracts now accept the shared safe recovery helper and require the more precise accepted-for-delivery/status guidance; the new executable recovery tests remain required by `pretest`.

## Tester handover

Use tagged accounts/records only. Do not suspend a real member, delete a real account or send a real support reply for rehearsal.

1. Open two test support requests. Draft a different reply in each; switch between them and confirm the correct text and recipient each time.
2. Fail a conversation read. Confirm the warning/retry is visible and no reply can be submitted. Restore the read and check the draft is still present.
3. Fail a decision save or disconnect. Confirm controls recover and the same record/action note is restored when its dialog is reopened. Check authoritative saved status before retrying an uncertain request.
4. Click twice rapidly. Confirm only one decision/notification/audit event, then reload and verify the intended state.
5. Save successfully but fail the subsequent read. Confirm the saved result is not labelled a failed mutation; retry only the read.
6. Send a test reply with explicit authorisation; verify the correct private thread after reload and separately verify provider/inbox delivery. A queued or provider-accepted job is not inbox evidence.
7. Check desktop/mobile keyboard focus, recipient wrapping, disabled controls and readable support status labels. Record device, role, request ID, expected/actual result and the three verification levels separately.

Next: Phase 3, ADMIN-07/08 — trustworthy Admin counts and readiness inputs. Phases 4/5 remain navigation/plain language and scale/security/release acceptance. No launch-readiness percentage or acceptance gate is increased from these code checks alone.
