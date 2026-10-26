# Host networking, guest arrival and delegated scanning

Updated: 26 October 2026. Implementation complete; independent physical-device acceptance remains open.

## Where to find it

Open your published in-person/hybrid event → Manage your event. **Networking** and **Guests & check-in** are visible preparation tabs, not hidden under More. Tabs wrap on phones. Other editing drafts are retained while moving between sections.

Networking → Set up networking / Edit schedule: start, finish, conversation length, changeover and meeting-point count. Table names are generated automatically; custom names and a conversation starter are optional. Save, then Start networking during the session window. Guests still opt in and need recorded check-in. Sessions remain limited to published in-person/hybrid events; this does not add draft-event networking or online video rooms.

Guests & check-in → Registered / Arrived / Still expected, search by name, filters, 25-person pages and a bounded scrollable guest list. Arrival times use the event timezone. The view refreshes quietly every 15 seconds while foregrounded; failed reads hide stale attendance rather than showing an all-clear. Hosts see names and arrival times, not guest email, payment or order data. Active Hosts retain attendance access after the event, without lifting the separate privacy thresholds for aggregate feedback/outcomes.

## Appointing a helper

1. Open Guests & check-in → Add or remove check-in helpers.
2. Enter a verified active member's sign-in email and press Add helper. Up to ten helpers per event.
3. The existing notification engine creates a private in-app notification and, subject to preferences, an email job. Delivery uses the existing Resend queue; it is not a promise of immediate inbox delivery. Nothing was sent to real people during verification.
4. Share the displayed event-specific check-in link if needed. The helper signs in with her own email. The link alone does not grant permission.
5. The helper opens the scanner, which names the event. She scans the guest's QR pass, or enters its private 10-character code when scanning/camera is unavailable. Browser BarcodeDetector support varies; physical iOS/Android acceptance remains required. No new scanning library was installed.
6. The server validates permission, event ID, pass validity, registration and check-in window. Successful scans record time, operator and method, and update the guest to attended. Repeat scans return Already checked in; the database uniqueness constraint prevents another active arrival record.

Only the active Host can add delegated helpers. A helper cannot delegate, browse the guest list, change the event, access payments or reverse attendance. Removing her grant takes effect on the next request, without waiting for a new JWT. A suspended/removed Host's grants stop working because the grantor's active Host assignment is checked on every scanner request. Existing Admin-appointed door staff remain separate; removing a Host delegation does not remove an independent Admin appointment. Super Admin keeps existing oversight and can remove delegated access. Revocation also works after an event; adding helpers requires an upcoming published event.

The helper needs a verified active platform account, but does **not** need to buy/register for the event to operate its scanner. Unknown emails are rejected; no account is silently created. If she is not yet a member, she completes normal registration first and the Host adds her afterward. Hosts do not need Super Admin approval to appoint/remove helpers or manage networking. Existing separate publication/payment/safety gates are unchanged. A Copy link button has a manual-copy fallback when browser clipboard permission is unavailable.

## Who checked in your guests?

Guests & check-in now includes a private **Who checked in your guests?** report. Each operator has a successful-arrival total, QR/code split, first/latest check-in times in the event timezone, and a separate undone count. The guest list identifies the operator and method beside each recorded arrival. Repeated scans return the existing record and do not inflate totals. Active totals include only current confirmed/attended guests and unreversed arrivals; reversed records are counted separately. Removing a helper does not erase her check-in history. Names reflect current profile names, not immutable identity snapshots. Hosts and Admin staff activity are included as well as helpers; the report is not a staff attendance/time-tracking system.

The report uses the existing Host-only event guard, including post-event access. Helpers and other event Hosts cannot read it. Search/filter do not alter event-wide operator totals. There are no guest emails, order data or QR tokens in the response. Foreground refresh is every 15 seconds, not instant push; manual Refresh remains available. Out-of-range guest pages clamp to the last populated page after the list shrinks. Helper instructions are above the guest list; editorial review status is hidden in the live-operation tabs to avoid implying these controls await Admin approval.

## Concurrent events

The scanner is bound to one explicit event ID. Helper grants are keyed by event and account. QR payloads include the event ID; QR tokens and manual codes are looked up within that same event. The scanner does not infer an event from the current time or venue. A pass for Event B is rejected at Event A even when both start together. Only staff assigned to both may open both scanners, and each screen remains bound to its own event. The Host has not been added to can_manage_event: no new finance, refund, Admin-role or publishing access is implied.

## Networking times before arrival

The saved networking schedule now appears in the visible event Programme and the guest's private pass, using the event timezone. The public schedule follows existing event visibility rules; drafts and hidden audiences are not made public. It exposes only start/finish, duration and status—not participants, meeting points or conversation prompts. A failed read shows an unavailable message instead of inventing a time.

Future event-confirmation email jobs include the schedule if one exists when the email is queued. This is a queue-time snapshot, not a rewrite of sent messages: a later schedule change is reflected on the event page/pass but does not automatically resend earlier emails. Existing event-calendar exports still represent the whole event, not a separate networking calendar entry. No automatic pre-session push notification was added.

## Database changes and security

Applied live, with local CLI-created filenames aligned to Management API history:

- `20261026071404_event_host_arrival_and_networking_schedule.sql`
- `20261026072143_event_host_helper_offboarding.sql`
- `20261026112916_event_host_checkin_activity.sql`

No owner SQL or Vercel environment update is needed. No real event, helper assignment, registration or role was modified. Local database runtime is unavailable, so changes were rehearsed against the real project's functions in rollback-only transactions before being applied once.

Host delegations live in unexposed `hat_event_ops`, deny-all RLS and no client schema/table/helper-function grants. Authenticated RPCs enforce event ownership; the intentionally public schedule RPC applies existing event visibility checks. Empty search paths and explicit grants are retained. Assignment/revocation uses the event row lock; scanner idempotence uses the existing unique active-check-in constraint. Auth-user foreign keys cascade delegation rows, rather than blocking account deletion. No service key reaches the browser.

Supabase skill guidance influenced the least-privilege split and runtime permission checks. Advisors reviewed before/after: the private RLS-without-policy notice and scoped SECURITY DEFINER RPC notices are intentional, not a claim the whole project is advisory-free. [Function security](https://supabase.com/docs/guides/database/functions), [RLS advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Verification levels

- **L1:** Actual-component tests for helper assignment and duplicate-submit lock, failure cleanup, stale attendance hiding, filters/paging, foreground refresh, event-scoped scanner calls and scanner thrown-request recovery. Actual schedule rendering verifies Nairobi times. Host tabs render from the real workspace component in example-data previews. Full tests, TypeScript and production build passed.
- **L2:** `supabase/tests/071_host_event_arrival.sql` now contains 47 rollback-only assertions. Covers two simultaneous events, wrong-event QR/manual rejection, correct QR/code entry, duplicate scan, operator attribution/totals/reversals, history after helper removal, unknown email rejection, clamped pagination, Host-only roster, helper-only scanner, no finance permission, removal, Host suspension, public schedule privacy, queue-time email enrichment, a 31-person paginated list, cancelled pass, post-event attendance and post-event revocation. Re-run after application passed. No tagged fixture users were retained and no test email jobs committed.
- **L3:** Not complete. Browser checks used actual components with explicit example data—not a signed-in production Host/helper performing camera scans. 320px/390px layouts showed no horizontal page overflow; all five Host tabs were visible and the guest list scrolled within 440px. Example screenshots: `tmp/host-workspace-arrival-example.png`, `tmp/host-arrival-example.png`, `tmp/host-helper-team-example.png`.

## Pilot acceptance still required

- [ ] Host appoints a consenting helper, who opens the notification/link using her own account.
- [ ] On physical Android/iOS devices, validate a genuine test pass, manual fallback, repeat scan and a second simultaneous event's pass.
- [ ] Confirm the Host sees the saved arrival after refresh and that other Hosts/helpers cannot read this guest list.
- [ ] Remove the helper while her scanner stays open; the next scan must be denied. Repeat after the event ends.
- [ ] Verify real Resend delivery and Spam behaviour for an opted-in helper and a new booking confirmation; no inbox delivery was inferred from a queued job.
- [ ] Host sets/edits networking times; verify public Programme, private pass, timezone and first-event-page guest prompt. Existing sent emails must not be presented as automatically updated.
