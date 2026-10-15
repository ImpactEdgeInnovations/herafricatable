# Feature verification standard

Applies to Her Africa Table feature delivery and review. Record evidence per operation, role and environment; a visible control, passing build or successful deployment alone does not establish a working feature. This standard defines acceptance requirements, not a report that the checks below have passed.

## Three verification levels

| Level | Question | Minimum evidence |
| --- | --- | --- |
| **L1 — Code and operation** | Does the control invoke the intended implemented operation? | Source references tracing control → handler → operation; focused executable tests for inputs, loading, success and failure states; relevant test/build results with command, date and revision. Labels, placeholder handlers and mocked success alone are insufficient. |
| **L2 — Integration** | Does that operation correctly reach its database, API, service and any required notification path? | Real integration evidence in a named environment: authenticated actor/role, request and response, authoritative read-back, server-side authorization, validation and error propagation. Identify deployed schema/service versions. For notifications, distinguish job creation, worker processing, provider acceptance and recipient delivery. Mocks prove only the tested contract, not the real integration. |
| **L3 — Observed behavior** | Does the intended user outcome actually occur and remain correct? | An authorized end-to-end rehearsal from the actual UI, authoritative read-back and fresh reload/re-entry; relevant independent roles; denial, retry and error recovery; time-bound behavior and the operational outcome. Record screenshots/logs, fixture identifiers, expected versus observed results, and cleanup verification. A read-only view of old data does not prove a new write. |

Levels are cumulative for a complete operation. Report the highest fully evidenced level **within its stated scope**, alongside each level's status. A feature with unverified required operations is not fully verified. Local/staging acceptance is not production acceptance; responsive browser emulation is not physical-device acceptance.

## Honest classifications and evidence record

Use `PASS`, `FAIL`, `NOT TESTED`, `BLOCKED` or `N/A` for each level. `N/A` requires a reason and must not bypass an actual dependency. Label incomplete work `PARTIAL`, with the passed cases and remaining cases named. `BLOCKED` records the missing access, authorization or prerequisite; it never means passed.

- **Implemented / L1 verified:** code and specified tests pass; real integration or behavior remains open.
- **Integrated / L2 verified:** real connections and guarded operations pass; end-to-end acceptance remains open.
- **Operationally verified / L3 verified:** all required scoped outcomes pass, including persistence, failure and permission cases.
- **Queued / not implemented:** requirements exist without the complete workflow; no operational claim.

Every evidence entry records timestamp/time zone, commit/deployment, environment, actor role (without credentials), sanitized fixture IDs, action, expected result, observed result, evidence path or test output, side effects, cleanup and unresolved limits. Preserve failed results and retest history. Deployment, notification enqueueing, provider acceptance and inbox receipt are separate facts. Existing global release gates remain authoritative; feature acceptance does not override them.

### Verification matrix template

| Feature / operation | Actor and environment | L1 status + evidence | L2 status + evidence | L3 status + evidence | Outcome, gaps and next authorized check |
| --- | --- | --- | --- | --- | --- |
| Example: submit request | Host; staging; revision/date | NOT TESTED | NOT TESTED | NOT TESTED | Define expected state, fixture, refresh and denial cases before testing. |

## Featured-spot acceptance cases

Scope: the shared Host request → Admin review → timed placement workflow for Events and Communities. The [taskboard](UX_EVENTS_IMPLEMENTATION_TASKBOARD.md) and [feature handover](FEATURED_SPOTS_HANDOVER_20261015.md) record its implementation and remaining acceptance; an existing event `is_featured` field does not prove it. Existing documented featured-event authority is Super Admin: confirm and enforce the intended privileged reviewer role rather than silently broadening it to every Admin.

| Case | Required acceptance evidence |
| --- | --- |
| Host request | Authorized Host submits a short reason and requested dates for her own eligible Event/Community. Validate required/invalid inputs; save a pending request once despite retries; refresh and re-entry recover authoritative status. Requesting must not itself grant placement. |
| Admin review and dates | Only the explicitly permitted reviewer can approve/decline with a note, choose valid start/end dates and remove placement early. Persist reviewer, decision and audit evidence; Host sees the resulting status after refresh. Reject reversed/equal/invalid windows server-side. State the scheduling time zone and test conversion/boundaries. |
| Timed discovery and expiry | Future approvals stay absent until start; currently approved eligible items appear above ordinary results, at most three, with a documented stable selection order. Define the active interval (recommended: start inclusive, end exclusive). Test exact start/end, expiry without manual edits, fresh reads and the declared cache/update behavior of an already-open page. Early removal and loss of eligibility suppress placement. |
| Denied roles and ownership | Anonymous users, ordinary members, another Host and unauthorized Admin roles cannot submit for another owner or review/alter requests, including direct API calls and tampered IDs. Revoked authority stops working in the same session. Denied operations leave data unchanged. |
| Visibility and privacy | Featuring never bypasses publication, discovery, membership, payment or private-content restrictions. Public cards/responses reveal no private request reasons, review notes, contacts, meeting links or protected media. Host/reviewer access is scoped; test authorized and unauthorized reads as well as writes. |
| Persistence and failures | Real UI submission/decision survives reload and a fresh session; authoritative values match. Rejected writes, unavailable services, stale responses and repeat clicks show honest feedback, recover busy state and do not create duplicate requests or false success. Test competing review decisions under the defined conflict policy. |
| Notifications, if required | Verify intended recipient, privacy-safe content, preferences, deduplication and retry/error handling. Record queue/worker/provider/delivery evidence separately. If notifications are out of scope, state that explicitly rather than treating silence as successful delivery. |

Run the cases for both Events and Communities; record any intentionally different eligibility rules. Isolated transaction rollback can prove database integration but cannot substitute for a committed persistence/reload rehearsal.

## Rehearsal safety

Prefer isolated local/staging fixtures. Production writes, role changes, publication and other external effects require task-specific authorization. Define fixtures, expected effects and cleanup before an authorized rehearsal; do not modify unrelated member data or expand privileges to make tests pass.

**Do not send, resend or trigger real emails without explicit user authorization.** This includes background jobs indirectly created by a test. Use a controlled non-delivering test transport or suppress delivery in an isolated environment; record that real delivery remains unverified. A rollback does not undo an external email. Keep secrets and private recipient details out of evidence, and verify fixture/job cleanup without deleting unrelated records.
