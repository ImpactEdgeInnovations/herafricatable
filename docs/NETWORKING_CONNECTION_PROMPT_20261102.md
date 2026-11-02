# Stay connected after networking

Delivered: 2 November 2026.

## Member flow

After a mutually accepted conversation ends, a small **Enjoyed meeting Amina?** panel offers **Connect with Amina** or **Maybe later**. It appears during a break or after the session, not over a current introduction/conversation. Only the latest conversation is prompted; dismissing it does not cycle through a backlog.

Connect opens the existing confirmation dialog with an editable, optional note:

> I enjoyed our conversation at this event and would love to stay connected.

No request is sent until the member confirms. The recipient gets the existing real connection notification, with a link to the requester’s profile and private note. Email is queued through the existing Resend engine according to notification preferences and worker timing; inbox delivery is not guaranteed or instantaneous. Private messaging opens only after acceptance.

Maybe later is an account-specific database choice, not a local cosmetic dismissal. It survives refresh and sends no notification. It is not returned to the partner or exposed through Host/Admin tools. The person remains under **People you met → Stay connected**. No rating or reason for declining an introduction is shared.

## Correctness and privacy

- Early-ended conversations now count only when both people had accepted. Skipped/unanswered offers and current active conversations do not become follow-through opportunities.
- Shared matching, no-repeat, block, membership and consent rules remain in force. The connection write rechecks eligibility and uses the existing duplicate/rate-limit/notification engine.
- An uncertain or rejected send invalidates cached connection state before reconciliation, so an existing incoming/outgoing request is not treated as absent.
- History read failures hide the prompt and show retry, without interrupting the current networking session.
- History remains available for the existing 14-day event window. Accepted connections remain in Your connections.
- Only first name, profile photo and connection status are returned for a past conversation; no email, phone or private notes are exposed by the networking history getter.

## Database

Applied live: `20261102154259_networking_connection_prompt.sql`. No owner-run SQL or new environment variables required.

The private `hat_networking.followthrough_choices` table uses deny-all RLS and no client schema/table grants. Authenticated getter/deferral functions check the current member, event and mutual conversation. A terminal timestamp records completed/closed conversations without altering matching decisions. The existing Home networking reminder also recognises early-ended mutual conversations.

Security advisors found no additional anonymous executable functions. The deny-all private-table notice and two deliberately authenticated, guarded security-definer RPC notices are expected. Existing project-wide security/dependency alerts are not cleared by this feature.

## Evidence

| Level | What was verified |
| --- | --- |
| 1 — Actual component behaviour | Prompt visibility, prefilled note, cancelled confirmation sends nothing, explicit request, persistent server deferral state, duplicate-click lock, history retry, active-conversation suppression and after-event visibility. Existing networking regressions, full test suite, TypeScript and production build. |
| 2 — Database integration | 34 rollback assertions in `074_networking_connection_prompt.sql`: normal/early-ended vs skipped/active, timestamp ordering, no automatic connection, private/idempotent deferral, unrelated member/Host/Admin/anonymous denial, blocks, visibility, 14-day boundary, pending request/note, real in-app notification and queued email, messaging still closed before acceptance. |
| 2 — Related regressions | End notice (070), Host arrival (071) and Event day (073) rollback tests passed. Optional rerun of core SQL test 069 did not execute because its tool confirmation expired; no workaround was used. |
| 3 — Presentation | Actual component example-data markup inspected on desktop and 390 px mobile, with no horizontal overflow. Screenshots under `tmp/networking-followthrough-*.jpg`. |

No provider email or real member request was sent. Database fixtures/notifications rolled back. This is not an independent real-phone or inbox acceptance claim.

## Tester checks

1. Complete a mutual conversation or end it early after both accepted; verify the person appears in People you met and the prompt is visible during a break.
2. Choose Maybe later, refresh and confirm the prompt stays dismissed, the person remains connectable, and the partner receives nothing.
3. Choose Stay connected, edit or clear the note, then cancel the confirmation: nothing should send.
4. Confirm a request. Check recipient profile access, note, notification and pending state. A duplicate must not send another request.
5. Verify messages stay closed before acceptance. After acceptance, both accounts should show the existing connection and allow private messaging.
6. Skip an unanswered introduction: it must never be presented as a conversation you had.
