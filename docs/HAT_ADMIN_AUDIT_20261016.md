# Her Africa Table — Super Admin audit and implementation taskboard

Audit date: 16 October 2026, Africa/Nairobi. Application baseline: `74f0b55`. Live project: `gtzwqromwvzqytygebfc`. Scope: Her Africa Table, adapting the supplied DukaPilot audit framework to the modules that actually exist here.

Implementation follow-up: [Phase 1 handover and evidence](ADMIN_PHASE_ONE_HANDOVER_20261016.md). ADMIN-01–04 are implemented; the findings below remain the historical audit baseline. L3 acceptance stays open as documented.

This is an audit report. Application code, permissions, member records, settings, payments and notifications were not changed during the audit. Documentation is the deliverable. The current browser session is an ordinary member/Host session; live Super Admin visual and write acceptance remains open.

## Verdict

The Admin portal has substantial real implementation. The scoped inventory found **83 source files, 256 literal RPC call sites and 200 distinct RPC names**. All 200 names exist in the live database; inspected named argument keys match the live signatures. These are wiring/schema facts, not a claim that 200 operations work end to end. Dynamic helper calls, service internals and imported non-Admin components need their own review beyond this static inventory.

I would prioritise reliability and truthful operational feedback before another broad visual redesign. Confirmed source defects affect readiness calculations, query-error presentation, deletion recovery, provider-state persistence and expiry-aware permissions in some server routes. No P0 data exposure was established by the scoped checks. No overall working/readiness percentage is assigned.

## Current live facts

- `impactedgeinnovations@gmail.com` has the sole `super_admin` assignment, without an expiry. `epayments.elbrim@gmail.com` has no team role. Zero expired role rows existed at the audit snapshot.
- RLS is enabled on every ordinary/partitioned table found in `public`. This checks that RLS is enabled, not that every policy is correct.
- `is_admin()` checks `expires_at`; `can_manage_event()` checks either active Super Admin or active Event Staff with an event scope.
- Eleven sampled privileged reads denied an ordinary tagged member or returned zero privileged rows. No production-data write was used for those checks. The live browser also displayed “This email opens the member space” at `/admin`.
- Two published events use manual review. `event_automatic_checkout` and `event_guest_access` are off.
- Communities, referrals and Nia are on. Learning, paid memberships, circles, partner perks, creator commerce and Host self-service billing are off. A disabled module may still have real Admin implementation; disabled does not mean cosmetic.
- The email queue contained 76 `sent` records and no other states at the snapshot. Dispatch runs every five minutes; housekeeping runs daily. There were 289 successful cron SQL runs in the previous 24 hours. These facts do not independently prove HTTP-worker success or inbox delivery.
- 183 of the 200 inventoried RPCs have anonymous EXECUTE permission; 198 are security definer. Many have internal guards. Treat the grants as an access-review backlog, not as proof that anonymous callers can read or mutate protected data.

## Verification levels

Use [FEATURE_VERIFICATION_STANDARD.md](FEATURE_VERIFICATION_STANDARD.md).

| Level | Evidence in this audit | Limitation |
| --- | --- | --- |
| L1 — Code inspection | Route guards, handlers, named operations, SQL definitions for selected critical paths, error handling, metrics and navigation | Existing code is not proof of successful use |
| L2 — Integration | Live function/signature inventory, RLS and role definitions, aggregate operational snapshot, eleven ordinary-member read denials | Catalog presence is recorded separately from executed integration; mutating operations were not run |
| L3 — End-to-end | Observed ordinary-member denial at Admin entry only | Full Super Admin journeys, writes, reload, mobile/tablet use and error recovery remain untested in this audit |

Previously recorded featured-spot database rehearsals are in [FEATURED_SPOTS_HANDOVER_20261015.md](FEATURED_SPOTS_HANDOVER_20261015.md). They do not establish unrelated Admin workflows.

## Functional matrix

“Code-wired / untested” means a real handler and live operation exist, while the complete user outcome remains unverified. “Partially working” below refers to a concrete incomplete path identified in source; it does not claim an observed live failure unless explicitly stated.

| Module / operation | Classification | Frontend / route | Backend and data evidence | Remaining verification |
| --- | --- | --- | --- | --- |
| Admin entry, team navigation, sign out | PARTIAL | `app/admin/page.tsx`, `components/admin/admin-header.tsx` | Auth `getUser`; `user_roles`; shared sign-out control; observed ordinary-member denial | Active/expired Super Admin, multi-role priority and sign-out in independent sessions |
| Today counts and attention queues | PARTIAL | `app/admin/page.tsx`, `admin-action-centre.tsx` | Real member/event/report/registration/refund queries | Error states and complete totals; A-03 |
| Member application approve/decline; suspend/restore | CODE-WIRED / UNTESTED | `member-command-centre.tsx`, `member-review.tsx` | `review_member`; membership application/profile data; targeted welcome worker call | Both decisions, access change, audit, reload and welcome delivery |
| Intake and timed pilot controls | CODE-WIRED / UNTESTED | `membership-intake-control.tsx`, `member-command-centre.tsx` | `set_membership_intake_mode`, pilot event/Community settings, invitations | Expiry/cohort/off-switch acceptance; plain copy matches effective mode |
| Community application approval/changes/decline | CODE-WIRED / UNTESTED | `community-command-centre.tsx`, `community-host-application-manager.tsx` | `review_community_host_application`; applications/Community owner creation | Real details/media, note delivery, reload and review recovery |
| Community lifecycle, members and joining | PARTIAL | `community-command-centre.tsx`, `community-manager.tsx` | `manage_community_lifecycle`, membership/joining RPCs; real health/member reads | Per-item failed reads currently become empty/zero; A-03/A-08 |
| Community media, video controls, moderation | CODE-WIRED / UNTESTED | `community-moderation.tsx`, `community-video-controls.tsx`, `community-photo-operations.tsx` | Safety/photo/video RPCs; protected Storage signing and cleanup API | Real files, reported evidence, removal, recovery and correct member permissions |
| Event proposals and Host assignment/review | CODE-WIRED / UNTESTED | `member-event-proposal-manager.tsx`, `community-event-proposal-manager.tsx`, `event-host-review-manager.tsx` | Proposal review, `assign_event_host`, `review_event_host_workspace`, Host status/safety RPCs | Separate Host/Admin decisions and refresh, pause/replacement; previous rehearsals are scoped |
| Event creation/editing and lifecycle | CODE-WIRED / UNTESTED | `event-manager.tsx`, `event-command-centre.tsx` | `save_event`, `manage_event_lifecycle`; scoped event tables/RPCs | Cancellation/suspension/reopen outcomes and notification claims; failure recovery |
| Tickets, free/manual registrations, waitlist | CODE-WIRED / UNTESTED | `registration-manager.tsx` | `save_ticket_type`, `review_manual_registration`, waiting-list notice | Authoritative seat/ticket totals, capacity, duplicate and refresh paths |
| Payment collection and refund decisions | PARTIAL | Registration controls; Paystack routes | Real order/payment/refund RPCs; signed webhook processing | Refund initiation absent from inspected path; manual approval marks complete; A-07 |
| Guest arrival and door-only access | CODE-WIRED / UNTESTED | `event-checkin-console.tsx`, `event-door-staff-control.tsx` | Check-in/reversal and scoped staff RPCs | Actual pass scan, duplicate/invalid pass, non-staff denial and persisted outcome |
| Programme, menu, sponsors, announcements | CODE-WIRED / UNTESTED | Event content/menu managers | Real save RPCs and related tables | Save/publish/refresh, time zones, media/link validation and selected-event context |
| Event photos, archive, recap, feedback, invitations | CODE-WIRED / UNTESTED | Gallery/archive/feedback/follow-up managers | Real media review, recap, feedback and invitation operations | Consent, private visibility, file delivery, approval notes and repeat actions |
| Featured event / Community requests | PARTIAL | Shared featured panel in Admin Events/Communities | Live request/review/expiry RPCs and RLS; tests 062/063 passed previously | Full committed UI Host → Admin → refresh acceptance remains open |
| Founding cohort activation | CODE-WIRED / UNTESTED | `app/admin/cohort/page.tsx`, `cohort-activation-manager.tsx` | Cohort configuration/invitation/health RPCs | Selected Community, current event/Host wording, failures and actual invite receipt |
| Safety and marketplace reports | CODE-WIRED / UNTESTED | Safety work area and moderation components | Real report-list/review operations | Correct scopes, evidence retention, moderation effect and complaint closure |
| Message delivery, retry, private test | PARTIAL | `notification-operations.tsx`; delivery APIs | Real queued jobs/provider/worker; sampled read denied non-Admin | Durable finish errors, provider acceptance vs delivery; A-05/A-06 |
| Member support | PARTIAL | `app/admin/support/page.tsx`, `support-inbox.tsx` | Real support list/messages/reply/manage; realtime channel | Thread read failure and drafts crossing selected tickets; A-09 |
| Privacy requests and deletion | PARTIAL | Privacy route/component/API | Guarded request review/anonymisation, Storage and Auth calls | Completion can precede downstream cleanup; retry and token revocation; A-02 |
| Nia settings / provider test | PARTIAL | `table-guide-control.tsx`, AI test API | Real feature flag/admin metrics/OpenAI test call | Expired-role check and fail-closed cooldown; A-01 |
| Creator plans, orders, billing, statements, settlement | CODE-WIRED / UNTESTED; currently off | Creator-commerce/billing/finance managers | Real save/review/reconcile/settlement operations | No money movement tested; provider approval, refunds, fee/legal/accounting acceptance needed |
| Learning, memberships, circles, partner perks | CODE-WIRED / UNTESTED; currently off | Programme managers | Live operations present; flags off | Separate module acceptance and entitlement enforcement before enabling |
| Referrals and invitation review | CODE-WIRED / UNTESTED | Referral/table-invitation managers | Real campaign, review, invitation and entitlement operations | Recipient/duplicate/expiry/revocation and delivery acceptance |
| Readiness / release gates / roadmap | PARTIAL | Analytics, launch/module/database gate components | Live gate/metric RPCs, recorded evidence and environment checks | Incomplete summary inputs and stale roadmap content; A-04/A-12 |
| Public-site countdown | CODE-WIRED / UNTESTED | `event-countdown-manager.tsx` | Real countdown table and published public event candidates | Save → public page, effective expiry/time zone and failed read/write |

## Prioritised findings

### A-01 — P1: expiry-aware permission checks are inconsistent

`app/api/admin/table-guide/test/route.ts:25` accepts an existing `super_admin` row without checking expiry before making a paid provider call. It also ignores the error from its cooldown count. `app/api/admin/test-users/route.ts:2` similarly checks row existence before using the service key to create an Auth user; the later marking operation has its own guard, but should not be the first definitive expiry check. Many page guards repeat this pattern. In contrast, `lib/notifications/admin-access.ts:12` correctly calls expiry-aware `is_admin()`.

The live role policy permits users to read their own role rows, including expired rows. Therefore row existence is not equivalent to active authority. Zero expired roles currently exist, so an expired-account exploit was not rehearsed. **Recommendation:** a shared active-role resolver/guard, deterministic role priority, origin validation for privileged POST endpoints, and fail-closed access/cooldown errors before any service/provider operation. Complexity medium; risk medium; benefit high. Do not broadly change RLS or create new Admin roles as part of a UI fix.

### A-02 — P1: account deletion can appear complete before cleanup succeeds

Live `execute_account_deletion()` marks `privacy_requests.status='completed'` and commits anonymisation before the API removes the avatar and disables/changes the Auth identity. `app/api/admin/privacy/delete/route.ts:6` can then return a cleanup failure. The UI offers the execute button only for approved requests in `components/admin/privacy-operations.tsx:210`; after refresh, a completed record no longer offers the retry the API error asks for. The execute fetch also lacks try/finally (`:122`), so a rejected request can leave the control busy.

The SQL supports a completed-request retry, but the workflow does not expose an operational cleanup stage. Current avatar paths match the deletion path; no avatar-path defect is claimed. Existing access tokens were not exercised, and banning/updating an Auth identity should not be treated as independent proof that issued JWTs are invalidated. **Recommendation:** explicit anonymisation/Storage/Auth cleanup stages, resumable cleanup, separate final completion, session-revocation review and a recoverable Admin UI. Complexity medium/high; implementation risk high; benefit high. Acceptance uses disposable isolated identities, never a real member deletion.

### A-03 — P1: failed reads can produce reassuring zero counts

`app/admin/page.tsx:152` replaces failed report/event reads with empty lists, and `:270` passes `count ?? 0` for refund/registration errors. `admin-action-centre.tsx:123` can say “All clear” while a non-member queue is unavailable. The member count already has a better readiness check. `app/admin/communities/page.tsx:99` drops per-Community member-read errors; `:107` replaces failed health reads with zero activity/counts.

**Recommendation:** `{value, status}` for each independent count/queue; show “Could not check” and retry rather than zero; preserve successful neighbouring results. Add authoritative aggregate totals. Complexity medium; risk low/medium; benefit high. Failed-read behaviour is confirmed in source; no live outage was induced.

### A-04 — P1: launch summary omits the activity metrics it claims to combine

`app/admin/operations/page.tsx:645` loads readiness metrics and analytics only for `loadPeople`. `LaunchReadinessSummary` renders only in `loadRelease` (`:1461`), where those results are substituted with `{data:[],error:null}`. The summary is nevertheless told reporting is ready (`:1479`), so it silently drops that part of the denominator. `launch-readiness-summary.tsx:134` calculates a percentage over the remaining items. The People area separately shows a different readiness percentage in `analytics-readiness.tsx:135`.

The calculation is real, but its input coverage and meaning are inconsistent. Configuration presence is also included beside operational acceptance. **Recommendation:** load the correct summary inputs, explicitly label Setup, Real-use checks and Member activity, show unavailable groups, and avoid presenting one number as product-completion percentage. Complexity small/medium; risk low; benefit high. Do not manufacture a new readiness percentage in this report.

### A-05 — P1: email worker ignores durable completion errors

`lib/notifications/worker.ts:209` awaits `finish_notification_job` but ignores its returned error, then increments `sent`. The failure branch similarly ignores persistence errors. Supabase can return an error without throwing. Provider acceptance can therefore be counted as a successful completed job even if the queue update failed. The provider request has a job-id idempotency key (`lib/notifications/email.ts:86`), which helps retries but does not make the database write succeed.

**Recommendation:** validate every completion result, expose “provider accepted / record update needs recovery”, retain safe retry/idempotency and report persistence failure honestly. Complexity medium; risk medium; benefit high. No live email or failure was triggered during this audit.

### A-06 — P2: provider acceptance and configuration are described too strongly

`notification-operations.tsx:128` says “messages delivered”; its source is the application queue. `app/admin/notifications/page.tsx:34` calls configuration present when environment values exist, and the UI says “Email service is ready”. `registration-manager.tsx:303` similarly says “Paystack is ready” based on configuration presence. Event cancellation/reopen feedback says guests “were informed” after the database operation returns, without recipient-delivery evidence.

**Recommendation:** plain but exact labels: “Email configured”, “Accepted by email provider”, “Message queued”, “Payment connection configured — test still needed”. Confirm inbox/bounce status separately; do not demand a broader Resend key just to improve wording. Complexity small; risk low; benefit high.

### A-07 — P1 before paid launch: refund approval is not a complete payment-provider workflow

Live `review_refund_request()` marks manual-review orders refunded immediately on approval. For automatic payments it changes the request to approved and order to refund_pending; the inspected application/SQL path contains webhook reconciliation but no Paystack refund-initiation request. Yet `registration-manager.tsx:236` says the request “will be sent to Paystack”. No financial transaction was tested. Current automatic checkout is off, reducing immediate exposure but not resolving the workflow.

**Recommendation:** separate approval, external/manual transfer confirmation and provider submission/reconciliation. Require a clear external reference when recording a manual refund; until integration acceptance is complete, explain the required provider-dashboard step rather than implying automatic submission. Complexity medium/high; risk high; benefit high before paid use. Keep money movement out of automated production audit tests.

### A-08 — P2: Community oversight performs two per-Community queries and eager media signing

`app/admin/communities/page.tsx:83` requests every Community's member roster and health in parallel, plus signs branding/application media. That creates at least two additional RPCs per Community even before the Admin selects one. The Programme work area repeats Community-member and course/circle queries across collections. `list_admin_members_v3()` and `list_admin_support_tickets()` return unbounded lists; client filtering cannot prevent database/API response caps.

**Recommendation:** a paged aggregate overview; load roster, activity and signed media for the selected item; explicit cursors and total counts. Keep existing selected-event reads in Events. Complexity medium/high; risk medium; benefit grows with use. No 1,000/10,000-member load result is claimed.

### A-09 — P1/P2: support thread failures and draft context need protection

`app/admin/support/page.tsx:53` ignores the support-message read error, making a failed thread look empty. `support-inbox.tsx:51` resets status/priority/assignee for a new selected ticket, but keeps the existing reply and note drafts. A draft intended for one member can remain when the selected ticket changes. Reply/manage handlers lack guaranteed cleanup on a thrown error. The actual send is guarded by the backend; recipient intent still needs a UI safeguard.

**Recommendation:** distinguish empty versus unavailable, store drafts by ticket or confirm/discard on selection, disable submit until context is verified, and show the recipient beside Send. Complexity medium; risk medium; benefit high. Do not send any real support response in acceptance.

### A-10 — P1/P2: action recovery is inconsistent across Admin

The static inventory flags 130 async functions containing an RPC/POST and no `finally`. This is a review list, **not 130 confirmed broken buttons**. Many normal Supabase failures return an error and are handled. However, thrown exceptions, date conversion errors and rejected fetches can bypass busy cleanup in selected handlers. Concrete examples include privacy execution, support reply/manage, registration review and member/Community lifecycle controls. Some disable only the current item, allowing another operation to replace a shared busy state.

**Recommendation:** reusable operation handling with synchronous in-flight prevention, try/catch/finally, saved-versus-refresh-failed distinction and retained drafts. Start with access, lifecycle, registration, refund and privacy decisions. Complexity medium; risk medium; benefit high. Reuse the featured-panel recovery approach without an unrelated framework rewrite.

### A-11 — P2: overlapping workspaces duplicate decision surfaces

Member review exists under Members and Work areas → People. Community/application controls exist under Communities and Programme work areas; Events retains content/ticket tools also present under Work areas → Events. The aliases `/admin/programs`, `/admin/release`, `/admin/safety` are implemented redirects, not dead pages. Some redirected areas still load many unrelated forms.

**Recommendation:** keep Today, Members, Communities, Events, Safety as daily destinations; use Work areas for less-frequent settings/programmes/operations. Link to the canonical selected record and preserve filters. Remove duplicate actionable forms only after confirming equivalent capability. Complexity medium; risk medium; benefit high for non-technical administrators.

### A-12 — P2: roadmap and diagnostic wording is stale or technical

`roadmap-overview.tsx:25` still refers to onboarding Seina and an earlier private-pilot workflow; the authorised Host/event context has changed. Labels elsewhere include “reconcile”, “append-only”, “entitlements”, “migration”, “configuration” and internal status codes. Some query failures recommend applying migrations even though this audit found all inventoried RPCs present.

**Recommendation:** current dates/owners from records; “Check payment records”, “Access”, “Record a correction”, “Could not load — try again”. Keep technical diagnostics in an expandable Admin detail, not the main action copy. Complexity small/medium; risk low; benefit high.

### A-13 — P2: email metrics are a partial 250-row window

Live `list_admin_notification_jobs()` sorts failures/processing/queued first and limits to 250. Client totals in `notification-operations.tsx:111` count only returned rows, without clearly identifying the window or offering full history pagination. A quiet current queue does not make these lifetime delivery totals.

**Recommendation:** authoritative status aggregates and a bounded paged job list, labelled timeframe, search by recipient/reference, selected-job diagnosis. Complexity medium; risk low/medium; benefit operational.

### A-14 — P2: audit evidence is recorded but difficult to inspect centrally

Critical SQL functions write `audit_events`, and the table is Super Admin protected. No dedicated general audit-history route appears in the Admin route inventory; many forms say actions are audited without offering a nearby decision-history view. The featured workflow retains the latest reviewer/note rather than a separate immutable decision history.

**Recommendation:** a small selected-member/event/Community “Activity” view with actor, action, reason, time and outcome. Keep private notes restricted. Add a paged general log under Work areas only if daily operations need it. Complexity medium; risk medium; benefit useful, after reliability fixes.

### A-15 — P2: legacy RPC grants and operational acceptance need a dedicated pass

183 inventoried functions are anonymously executable. Eleven sampled read operations denied an ordinary member, and selected critical functions contain real permission checks. This does not establish every function's effective permission boundary. The earlier migration replay-order issue remains a separate recorded gap; no new replay/restore evidence was obtained here.

**Recommendation:** function-by-function least-privilege review, anon/member/Host/Event Staff/moderator/Admin negative tests, expiring-role acceptance, clean database replay and backup restore. Avoid revoking grants in bulk without mapping legitimate public consumers. Complexity high; risk high if done carelessly; benefit high. No confirmed unauthorised data disclosure is asserted.

## Cosmetic / disconnected controls and metrics

No missing live RPC or obvious no-op button was established in the scoped inventory. Real APIs and SQL exist for the major visible modules. The important gaps are partial operations and misleading success/readiness claims:

1. Paystack refund submission is implied by wording without an initiation step in the inspected execution path (A-07).
2. The launch summary omits a data group while presenting a combined score (A-04).
3. Error fallbacks can make queues look empty or clear (A-03/A-09).
4. Configured provider badges and queue `sent` records are not evidence of final delivery/payment readiness (A-05/A-06).
5. Generic “audited” feedback has limited nearby evidence visibility (A-14).

Disabled commerce/programme flags are real saved controls; full entitlement enforcement remains unverified. Static roadmap prose is informational, not operational status evidence. This section must not be interpreted as proof that every other button has passed L3.

## UI/UX recommendations

| Current pattern | Recommended experience | Outcome |
| --- | --- | --- |
| Multiple readiness percentages | Separate Setup, Real-use tests, Member activity; one explained overview | Fewer misleading numbers |
| Large repeated managers | One selected record with Overview, People/Guests, Decisions and Settings | Less scrolling and duplicated work |
| Failed counts become zero | “Could not check” beside the affected queue | Honest attention priorities |
| Every optional programme shown together | Collapse/off-state programmes with a clear “Not open to members” label | Calmer daily workspace |
| Technical success messages | “Saved”, “Message queued”, “Check payment records”, “Try again” | Plain language without losing precision |
| History hidden behind auditing claims | Contextual Activity panel | Decisions easier to investigate |
| Navigation loses current event/filter | Links preserve selected record and view | Fewer back-and-forth steps |
| Shared busy state across forms | Disable only a clearly scoped operation with reliable completion | Fewer ambiguous clicks |

Keep existing wine/cream identity, readable interface typography, Member/Admin separation and task-first navigation. Reduce duplicate slogans/cards before changing the colour scheme. The full Admin responsive/contrast/keyboard audit needs an actual Super Admin UI session; source structure alone cannot establish visual acceptance.

## What to keep, simplify, merge, remove or reposition

- **Keep:** real role/RLS guards, scoped Event Staff access, manual-payment fallback, review notes, private drafts, decision confirmations, protected media, targeted notification jobs and feature controls.
- **Simplify:** provider/readiness labels, lifecycle dialogs, health summaries and error recovery.
- **Merge:** duplicate member/Community/event decision forms into canonical workspaces, preserving existing capabilities.
- **Remove:** unsupported claims of delivery, readiness or automatic refund submission; stale roadmap names/dates.
- **Reposition:** optional programme/commerce controls and deep technical diagnostics under Work areas; show pending proposals and failures in Today.
- **Add where useful:** selected-record activity, resumable cleanup, authoritative queue counts and pagination. A larger dashboard is not required.

## Implementation phases and monitorable tasks

| Task | Phase | Priority | Status / acceptance |
| --- | --- | --- | --- |
| ADMIN-01 active-role guards | 1 — permission and critical operations | P1 | IMPLEMENTED: L1 and live role-resolution L2 pass; browser expiry/revocation acceptance open |
| ADMIN-02 resumable privacy cleanup | 1 | P1 | IMPLEMENTED: L1 service-failure mocks and live SQL checkpoint/retry pass; real disposable-account acceptance open |
| ADMIN-03 durable email-worker outcomes | 1 | P1 | IMPLEMENTED: controlled persistence/provider failure tests pass; real external failure acceptance open |
| ADMIN-04 truthful refund workflow | 1, required before paid use | P1 | IMPLEMENTED: separate manual completion/reference and live state checks pass; Paystack initiation remains an external dashboard step |
| ADMIN-05 safe action recovery | 2 — reliable decisions | P1/P2 | IMPLEMENTED: synchronous locks, finally recovery, retained decision notes and saved/unknown feedback; controlled L1 pass; live recovery acceptance open |
| ADMIN-06 support thread/draft context | 2 | P1/P2 | IMPLEMENTED: failed-read gating, recipient-scoped drafts and stale-response isolation; controlled L1 pass; real thread/inbox/browser acceptance open |
| ADMIN-07 trustworthy counts | 3 — accurate operational data | P1 | IN PROGRESS: Today failure/truncation states implemented 25 October; aggregate queries, wider oversight and operational acceptance open |
| ADMIN-08 readiness inputs and meaning | 3 | P1 | IN PROGRESS: release target loading and incomplete-group percentage suppression implemented 25 October; complete catalog/group acceptance open |
| ADMIN-09 daily workspace simplification | 4 — plain language and navigation | P2 | QUEUED: canonical record tools, preserved context, fewer repeated forms |
| ADMIN-10 current roadmap / delivery labels | 4 | P2 | QUEUED: current owners/context and accurate delivery/setup copy |
| ADMIN-11 paged oversight / activity | 5 — scale and investigation | P2 | QUEUED: aggregate overview, selected rosters/media, paged jobs/support/members/history |
| ADMIN-12 permission and release acceptance | 5 | P1/P2 | OPEN: 200-operation inventory is catalog checked; per-operation permission/write/refresh cases, concurrent users and clean replay remain |

Phase-1 and phase-2 implementation statuses have scoped handovers. [Phase 2 evidence and tester checklist](ADMIN_PHASE_TWO_HANDOVER_20261016.md) distinguish implementation from live acceptance. Featured-spot work has its own evidence sheet. Phase 1 acceptance should precede expanding paid features; phase 3 is next for everyday free-pilot reliability. Visual polish follows verified workflows.

## Standalone implementation briefs

**Phase 1 brief:** Implement ADMIN-01 through ADMIN-04 from findings A-01/A-02/A-05/A-07. Reuse existing expiry-aware `is_admin` and notification-access conventions; fix the Nia/test-user guard before service calls; add staged idempotent privacy cleanup and recoverable outcomes; validate notification completion errors; make refund approval/recording/submission claims match the actual flow. Preserve current live feature flags and ordinary member access. Do not grant roles, delete real accounts, send real messages, initiate refunds or change provider settings. Use isolated fixtures/mocks first, then separately authorised acceptance. Require authoritative persistence/error/denial evidence; no L3 claim from compile alone.

**Phase 2 brief:** Implement ADMIN-05/06 for member/Community/event decisions, registration/privacy/support and invitation controls. Use scoped synchronous save locks, try/catch/finally, retained drafts and distinct save-versus-refresh errors. Key support drafts to ticket identity; display read failures and recipient context. Keep backend business decisions authoritative. Test thrown errors, normal RPC errors, duplicate clicks, stale responses and selected-record changes. No unrelated refactor or real outbound communication.

**Phase 3 brief:** Implement ADMIN-07/08 in Admin Today, Community oversight, operations release and launch summary. Fix loadPeople/loadRelease metric mismatch, query only required aggregates and expose each group's unavailable status. Do not substitute failed queries with zero or silently omit denominator groups. Explain setup, operational evidence and activity separately. Verify calculated results against live/staging authoritative reads and failure fixtures; retain existing permission gates.

**Phase 4 brief:** Implement ADMIN-09/10 after functional fixes. Consolidate duplicate entry points into the Members, Communities and selected Events workspaces; preserve selected record/search/view in navigation; update stale roadmap ownership and technical labels. Keep rare settings/programmes behind Work areas. Review actual Super Admin desktop/mobile/keyboard views and keep evidence of any remaining inaccessible/dense surfaces. Do not remove a capability before proving its replacement.

**Phase 5 brief:** Implement ADMIN-11 and execute ADMIN-12. Replace unbounded/N+1 oversight with paged aggregate reads and selected-item details; label job-history windows and add contextual activity. Review effective permissions for the 183 anonymous-executable functions individually, test revoked/expired roles and direct invocation, and repair/rehearse migration replay and backup restore. Record L1/L2/L3 per operation with exact environment, actor, result and cleanup. No mass grant revocation or production load tests without a controlled scope.

## Tester handover and final acceptance

For each important operation, record: actor/role, record ID, input, actual button, RPC/API, authoritative before/after, fresh reload, audit entry, notification stage, error recovery, denial for other roles and cleanup. Keep provider accepted, inbox delivered, financial approved and financially completed as separate states.

Test groups: member approve/decline/suspend/restore; intake/pilot expiry; Community approval/changes/lifecycle/member review; event proposal/Host/draft/publish/suspend/cancel; free/manual registration/capacity/waitlist/pass/check-in; file/media review and report removal; invitation/referral claim/revocation; support recipient/drafts; staged privacy cleanup; notification retry/provider/persistence; readiness counts; feature toggle enforcement; finance/entitlements in a non-financial rehearsal.

Use at least an ordinary member, Community owner, Event Host, moderator, scoped Event Staff and independent Super Admin. Only one live Super Admin exists now. The audit did not create another role or publish test events. Required security-sensitive operations, deletion and real money/email acceptance must be separately scoped. Existing global release evidence remains authoritative.

**Final assessment:** real implementation exists across the core modules; current checks support catalog/wiring confidence and selected read-permission confidence. The portal is not yet fully operationally verified. The top five immediate improvements are active permission checks, resumable critical operations, trustworthy counts/readiness, reliable action recovery and clearer canonical workspaces. Complete those before calling the entire Super Admin portal production-accepted.

## Appendix — complete scoped source wiring inventory

Each row below records literal operations found in source. The 200 unique RPC names were matched to live database definitions and named arguments on 16 October. This is catalog verification only; `CODE-WIRED / UNTESTED` remains the default for unobserved writes. A presentational file with no direct operation can delegate to a real child component and is not automatically cosmetic.

| Source | Direct RPC / API / table or bucket calls |
| --- | --- |
| [app/admin/cohort/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/cohort/page.tsx) | `from: user_roles`; `rpc: list_managed_events`; `rpc: list_cohort_overview`; `rpc: list_communities`; `rpc: list_cohort_health`; `rpc: list_community_release_checks` |
| [app/admin/communities/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/communities/page.tsx) | `from: user_roles`; `rpc: list_communities`; `rpc: list_community_host_applications_admin`; `rpc: list_community_joining_settings`; `rpc: list_community_brand_identities`; `rpc: list_admin_application_proposal_media`; `rpc: get_community_pilot_admin`; `rpc: list_community_gathering_video_controls`; `from: community-media`; `from: proposal-media`; `rpc: list_community_members`; `rpc: get_community_host_health` |
| [app/admin/error.tsx](/Users/macbook/Desktop/herafricatable/app/admin/error.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [app/admin/events/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/events/page.tsx) | `from: user_roles`; `from: feature_flags`; `rpc: event_registration_notification_ready`; `rpc: event_single_seat_guard_ready`; `rpc: event_capacity_guard_ready`; `rpc: event_registration_end_guard_ready`; `rpc: event_automatic_checkout_guard_ready`; `rpc: list_managed_events`; `rpc: list_event_lifecycle_admin`; `from: events`; `from: event_hosts`; `from: event_safety_contacts`; `rpc: event_publication_sequence_ready`; `rpc: event_arrival_details_guard_ready`; `from: ticket_types`; `from: event_host_workspaces`; `from: event_staff_scopes`; `from: orders`; `from: event_door_staff`; `from: profiles`; `rpc: list_admin_event_host_workspaces`; `rpc: event_host_lifecycle_ready`; `rpc: event_safety_contact_ready`; `from: event_host_covers`; `from: event-host-covers`; `rpc: list_event_work_counts`; `rpc: list_event_registrations`; `rpc: list_event_refund_requests`; `rpc: list_event_waitlist`; `rpc: list_admin_member_event_proposals`; `rpc: list_member_event_proposal_communities`; `rpc: list_admin_community_event_proposals`; `rpc: list_admin_application_proposal_media`; `rpc: member_event_host_handoff_ready`; `from: proposal-media`; `from: payment_attempts`; `rpc: list_event_door_staff`; `rpc: list_event_checkins`; `rpc: list_admin_member_event_archives`; `rpc: list_admin_event_media_submissions`; `from: event-media`; `rpc: list_event_follow_up_candidates_admin`; `rpc: list_pilot_event_cancellations` |
| [app/admin/invitations/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/invitations/page.tsx) | `from: user_roles`; `rpc: list_admin_table_invitations` |
| [app/admin/loading.tsx](/Users/macbook/Desktop/herafricatable/app/admin/loading.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [app/admin/members/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/members/page.tsx) | `from: user_roles`; `rpc: list_admin_members_v3`; `rpc: get_membership_intake_admin`; `rpc: get_membership_pilot_window`; `from: beta_invites`; `rpc: get_invited_pilot_event_setting`; `rpc: get_pilot_free_event_setting`; `rpc: get_community_pilot_admin`; `rpc: list_admin_members_v2`; `from: profiles` |
| [app/admin/notifications/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/notifications/page.tsx) | `from: user_roles`; `rpc: list_admin_notification_jobs`; `rpc: list_community_briefing_batches` |
| [app/admin/operations/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/operations/page.tsx) | `from: user_roles`; `from: site_event_countdown`; `from: events`; `rpc: list_admin_members_v3`; `rpc: get_membership_intake_admin`; `rpc: list_managed_events`; `rpc: list_admin_community_event_proposals`; `rpc: list_admin_member_event_proposals`; `rpc: member_event_host_handoff_ready`; `rpc: list_member_event_proposal_communities`; `rpc: list_admin_member_event_archives`; `rpc: list_admin_event_media_submissions`; `rpc: list_admin_members_v2`; `rpc: get_table_guide_admin`; `rpc: get_table_guide_feedback_admin`; `from: profiles`; `from: event-media`; `rpc: list_member_reports`; `rpc: list_marketplace_reports`; `rpc: list_community_safety_reports`; `rpc: list_communities`; `rpc: list_community_host_applications_admin`; `from: feature_flags`; `rpc: list_community_host_plans`; `rpc: list_community_commerce_admin`; `rpc: list_community_orders_admin`; `rpc: get_community_host_billing_admin`; `rpc: list_community_host_plan_orders_admin`; `rpc: list_community_finance_admin`; `rpc: list_community_financial_cases_admin`; `rpc: list_community_settlements_admin`; `rpc: list_courses`; `rpc: list_course_orders`; `from: referral_campaigns`; `rpc: list_referrals_admin`; `from: membership_plans`; `rpc: list_memberships_admin`; `rpc: list_membership_orders`; `rpc: list_circle_cycles`; `from: partners`; `rpc: list_partner_perks`; `rpc: list_perk_redemptions_admin`; `rpc: get_launch_readiness_metrics`; `rpc: get_product_analytics`; `rpc: list_launch_gate_checks`; `rpc: list_database_release_readiness`; `rpc: list_module_release_acceptance`; `rpc: list_curated_introductions_admin`; `rpc: list_connection_availability_admin`; `rpc: get_connection_outcome_summary`; `rpc: list_community_joining_settings`; `rpc: list_community_members`; `from: course_lessons`; `rpc: list_circle_participants_admin`; `from: event_hosts`; `from: event_safety_contacts`; `rpc: event_publication_sequence_ready`; `rpc: event_automatic_checkout_guard_ready`; `from: programme_sessions`; `from: event_announcements`; `from: event_sponsors`; `from: session_speakers`; `from: event_menus`; `from: menu_courses`; `from: menu_items`; `from: menu_item_feedback`; `from: gallery_albums`; `from: media_assets`; `from: ticket_types`; `rpc: list_event_registrations`; `rpc: list_event_waitlist`; `from: payment_attempts`; `rpc: list_event_refund_requests`; `rpc: list_event_checkins`; `rpc: list_event_feedback_admin`; `rpc: get_event_feedback_summary`; `rpc: get_event_host_outcomes`; `from: event_recaps`; `rpc: list_community_reports`; `rpc: list_community_gathering_reports`; `rpc: list_event_question_reports`; `rpc: list_community_photo_reports_page` |
| [app/admin/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/page.tsx) | `from: user_roles`; `rpc: list_admin_members_v3`; `rpc: list_managed_events`; `rpc: list_member_reports`; `rpc: list_marketplace_reports`; `rpc: list_community_safety_reports`; `rpc: get_membership_intake_admin`; `rpc: list_community_host_applications_admin`; `rpc: list_admin_members_v2`; `from: profiles`; `from: registration_requests`; `from: refund_requests`; `rpc: list_community_reports` |
| [app/admin/privacy/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/privacy/page.tsx) | `from: user_roles`; `rpc: list_admin_privacy_requests` |
| [app/admin/programs/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/programs/page.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [app/admin/release/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/release/page.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [app/admin/safety/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/safety/page.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [app/admin/sign-in/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/sign-in/page.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [app/admin/support/page.tsx](/Users/macbook/Desktop/herafricatable/app/admin/support/page.tsx) | `from: user_roles`; `rpc: list_admin_support_tickets`; `from: support_messages` |
| [app/api/admin/community/photos/cleanup/route.ts](/Users/macbook/Desktop/herafricatable/app/api/admin/community/photos/cleanup/route.ts) | `rpc: get_admin_community_photo_operations` |
| [app/api/admin/notifications/process/route.ts](/Users/macbook/Desktop/herafricatable/app/api/admin/notifications/process/route.ts) | Shell/presentation/delegated controls; inspect linked child components |
| [app/api/admin/notifications/test/route.ts](/Users/macbook/Desktop/herafricatable/app/api/admin/notifications/test/route.ts) | `from: audit_events` |
| [app/api/admin/privacy/delete/route.ts](/Users/macbook/Desktop/herafricatable/app/api/admin/privacy/delete/route.ts) | `from: user_roles`; `rpc: execute_account_deletion`; `from: avatars` |
| [app/api/admin/table-guide/test/route.ts](/Users/macbook/Desktop/herafricatable/app/api/admin/table-guide/test/route.ts) | `from: user_roles`; `from: audit_events` |
| [app/api/admin/test-users/route.ts](/Users/macbook/Desktop/herafricatable/app/api/admin/test-users/route.ts) | `from: user_roles`; `rpc: mark_test_account` |
| [components/admin/admin-action-centre.tsx](/Users/macbook/Desktop/herafricatable/components/admin/admin-action-centre.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/admin/admin-header.tsx](/Users/macbook/Desktop/herafricatable/components/admin/admin-header.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/admin/admin-work-group.tsx](/Users/macbook/Desktop/herafricatable/components/admin/admin-work-group.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/admin/analytics-readiness.tsx](/Users/macbook/Desktop/herafricatable/components/admin/analytics-readiness.tsx) | `rpc: save_launch_readiness_target` |
| [components/admin/application-image-review.tsx](/Users/macbook/Desktop/herafricatable/components/admin/application-image-review.tsx) | `rpc: review_application_proposal_media` |
| [components/admin/circle-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/circle-manager.tsx) | `rpc: set_feature_flag`; `rpc: save_circle_cycle`; `rpc: run_circle_matching`; `rpc: publish_circle_cycle`; `rpc: publish_circle_prompt` |
| [components/admin/cohort-activation-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/cohort-activation-manager.tsx) | `rpc: ensure_founding_cohort`; `rpc: sync_cohort_invitations`; `rpc: save_cohort_configuration` |
| [components/admin/community-command-centre.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-command-centre.tsx) | `rpc: set_community_pilot_setting`; `rpc: review_community_host_application`; `rpc: manage_community_lifecycle` |
| [components/admin/community-creator-commerce-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-creator-commerce-manager.tsx) | `rpc: set_feature_flag`; `rpc: save_community_host_plan`; `rpc: grant_community_host_plan`; `rpc: review_community_host_payout`; `rpc: review_community_order` |
| [components/admin/community-event-proposal-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-event-proposal-manager.tsx) | `rpc: review_community_event_proposal` |
| [components/admin/community-finance-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-finance-manager.tsx) | `rpc: record_community_financial_adjustment`; `rpc: open_community_financial_case`; `rpc: review_community_financial_case`; `rpc: create_community_settlement_batch`; `rpc: review_community_settlement_batch`; `rpc: mark_community_settlement_paid` |
| [components/admin/community-host-application-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-host-application-manager.tsx) | `rpc: review_community_host_application` |
| [components/admin/community-host-billing-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-host-billing-manager.tsx) | `rpc: set_community_host_billing_configuration`; `rpc: reconcile_community_host_subscriptions`; `rpc: review_community_host_plan_order` |
| [components/admin/community-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-manager.tsx) | `rpc: set_feature_flag`; `rpc: save_community`; `rpc: save_community_joining_mode`; `rpc: invite_community_member`; `rpc: review_community_membership`; `rpc: manage_community_lifecycle` |
| [components/admin/community-moderation.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-moderation.tsx) | `rpc: review_community_photo_report`; `rpc: review_event_question_report`; `rpc: review_community_gathering_report`; `rpc: review_community_safety_report`; `rpc: review_community_report` |
| [components/admin/community-outcome-summary.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-outcome-summary.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/admin/community-photo-operations.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-photo-operations.tsx) | `rpc: get_admin_community_photo_operations_page`; `fetch: /api/admin/community/photos/cleanup` |
| [components/admin/community-release-gate.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-release-gate.tsx) | `rpc: save_community_release_check`; `rpc: publish_community_after_acceptance` |
| [components/admin/community-video-controls.tsx](/Users/macbook/Desktop/herafricatable/components/admin/community-video-controls.tsx) | `rpc: pause_community_gathering_video` |
| [components/admin/curated-introduction-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/curated-introduction-manager.tsx) | `rpc: create_curated_introduction`; `rpc: cancel_curated_introduction` |
| [components/admin/database-readiness-panel.tsx](/Users/macbook/Desktop/herafricatable/components/admin/database-readiness-panel.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/admin/event-automatic-checkout-control.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-automatic-checkout-control.tsx) | `rpc: set_feature_flag` |
| [components/admin/event-checkin-console.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-checkin-console.tsx) | `rpc: list_event_checkins`; `rpc: check_in_event_member`; `rpc: reverse_event_checkin` |
| [components/admin/event-command-centre.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-command-centre.tsx) | `rpc: manage_event_lifecycle` |
| [components/admin/event-content-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-content-manager.tsx) | `rpc: list_event_staff`; `rpc: save_programme_session`; `rpc: save_event_announcement`; `rpc: save_event_sponsor`; `rpc: manage_event_staff` |
| [components/admin/event-countdown-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-countdown-manager.tsx) | `from: site_event_countdown`; `from: events` |
| [components/admin/event-door-staff-control.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-door-staff-control.tsx) | `rpc: manage_event_door_staff` |
| [components/admin/event-feedback-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-feedback-manager.tsx) | `rpc: save_event_recap`; `rpc: review_event_feedback` |
| [components/admin/event-follow-up-invitations.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-follow-up-invitations.tsx) | `rpc: invite_event_follow_up_guest`; `fetch: /api/admin/notifications/process` |
| [components/admin/event-gallery-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-gallery-manager.tsx) | `rpc: save_gallery_album`; `from: event-media`; `rpc: save_media_asset` |
| [components/admin/event-guest-access-control.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-guest-access-control.tsx) | `rpc: event_registration_notification_ready`; `rpc: event_single_seat_guard_ready`; `rpc: event_capacity_guard_ready`; `rpc: event_registration_end_guard_ready`; `rpc: set_feature_flag` |
| [components/admin/event-host-review-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-host-review-manager.tsx) | `rpc: assign_event_host`; `rpc: review_event_host_workspace`; `rpc: save_event_safety_contact`; `rpc: set_event_host_status` |
| [components/admin/event-intro-safety.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-intro-safety.tsx) | `rpc: list_admin_event_intro_cards`; `rpc: get_event_intro_enabled`; `rpc: set_event_intro_enabled`; `rpc: restore_event_intro_card`; `rpc: close_event_intro_card` |
| [components/admin/event-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-manager.tsx) | `rpc: save_event_safety_contact`; `rpc: save_event` |
| [components/admin/event-menu-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-menu-manager.tsx) | `rpc: save_event_menu`; `rpc: save_menu_item`; `rpc: moderate_menu_feedback` |
| [components/admin/event-round-review.tsx](/Users/macbook/Desktop/herafricatable/components/admin/event-round-review.tsx) | `rpc: get_event_round_enabled`; `rpc: get_event_round_plan`; `rpc: set_event_round_enabled`; `rpc: review_event_round` |
| [components/admin/launch-gate-control.tsx](/Users/macbook/Desktop/herafricatable/components/admin/launch-gate-control.tsx) | `rpc: save_launch_gate_check` |
| [components/admin/launch-readiness-summary.tsx](/Users/macbook/Desktop/herafricatable/components/admin/launch-readiness-summary.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/admin/learning-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/learning-manager.tsx) | `rpc: set_feature_flag`; `rpc: save_course`; `from: course-assets`; `rpc: save_course_lesson`; `rpc: grant_course_access`; `rpc: review_course_order` |
| [components/admin/marketplace-moderation.tsx](/Users/macbook/Desktop/herafricatable/components/admin/marketplace-moderation.tsx) | `rpc: review_marketplace_report` |
| [components/admin/member-command-centre.tsx](/Users/macbook/Desktop/herafricatable/components/admin/member-command-centre.tsx) | `rpc: review_member`; `fetch: /api/admin/notifications/process`; `rpc: set_membership_intake_mode`; `rpc: invite_pilot_member`; `rpc: set_invited_pilot_event_setting`; `rpc: set_pilot_free_event_setting`; `rpc: set_community_pilot_setting`; `rpc: revoke_pilot_member_invitation` |
| [components/admin/member-event-archive-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/member-event-archive-manager.tsx) | `rpc: review_member_event_archive`; `rpc: review_event_media_submission` |
| [components/admin/member-event-proposal-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/member-event-proposal-manager.tsx) | `rpc: review_member_event_proposal` |
| [components/admin/member-review.tsx](/Users/macbook/Desktop/herafricatable/components/admin/member-review.tsx) | `rpc: review_member`; `fetch: /api/admin/notifications/process` |
| [components/admin/membership-intake-control.tsx](/Users/macbook/Desktop/herafricatable/components/admin/membership-intake-control.tsx) | `rpc: get_membership_pilot_window`; `rpc: set_membership_intake_mode` |
| [components/admin/membership-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/membership-manager.tsx) | `rpc: set_feature_flag`; `rpc: save_membership_plan`; `rpc: review_membership_order`; `rpc: grant_membership`; `rpc: reconcile_membership_periods`; `fetch: /api/admin/test-users` |
| [components/admin/moderation-queue.tsx](/Users/macbook/Desktop/herafricatable/components/admin/moderation-queue.tsx) | `rpc: review_member_report` |
| [components/admin/module-release-gate.tsx](/Users/macbook/Desktop/herafricatable/components/admin/module-release-gate.tsx) | `rpc: save_module_release_check` |
| [components/admin/notification-operations.tsx](/Users/macbook/Desktop/herafricatable/components/admin/notification-operations.tsx) | `fetch: /api/admin/notifications/test`; `fetch: /api/admin/notifications/process`; `rpc: retry_notification_job` |
| [components/admin/operational-health-panel.tsx](/Users/macbook/Desktop/herafricatable/components/admin/operational-health-panel.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/admin/perks-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/perks-manager.tsx) | `rpc: set_feature_flag`; `rpc: save_partner`; `rpc: save_partner_perk`; `rpc: review_perk_redemption`; `rpc: expire_perk_redemptions` |
| [components/admin/privacy-operations.tsx](/Users/macbook/Desktop/herafricatable/components/admin/privacy-operations.tsx) | `rpc: manage_privacy_request`; `fetch: /api/admin/privacy/delete` |
| [components/admin/referral-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/referral-manager.tsx) | `rpc: set_feature_flag`; `rpc: save_referral_campaign`; `rpc: review_vouched_referral`; `fetch: /api/admin/notifications/process` |
| [components/admin/registration-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/registration-manager.tsx) | `rpc: save_ticket_type`; `rpc: review_manual_registration`; `rpc: notify_waitlisted_event_guest`; `rpc: review_refund_request` |
| [components/admin/roadmap-overview.tsx](/Users/macbook/Desktop/herafricatable/components/admin/roadmap-overview.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/admin/support-inbox.tsx](/Users/macbook/Desktop/herafricatable/components/admin/support-inbox.tsx) | `rpc: reply_support_ticket`; `rpc: manage_support_ticket` |
| [components/admin/table-guide-control.tsx](/Users/macbook/Desktop/herafricatable/components/admin/table-guide-control.tsx) | `rpc: set_feature_flag`; `fetch: /api/admin/table-guide/test` |
| [components/admin/table-invitation-manager.tsx](/Users/macbook/Desktop/herafricatable/components/admin/table-invitation-manager.tsx) | `rpc: review_table_invitation`; `fetch: /api/admin/notifications/process` |
| [components/featured/featured-request-panel.tsx](/Users/macbook/Desktop/herafricatable/components/featured/featured-request-panel.tsx) | `from: featured_spot_requests`; `rpc: review_featured_spot`; `rpc: request_featured_spot` |
| [components/featured/featured-spot-links.tsx](/Users/macbook/Desktop/herafricatable/components/featured/featured-spot-links.tsx) | Shell/presentation/delegated controls; inspect linked child components |
| [components/featured/featured-spots.tsx](/Users/macbook/Desktop/herafricatable/components/featured/featured-spots.tsx) | `from: featured_spot_placements` |
