# After-event thank-you emails

Delivered: 3 November 2026. Database migration applied on 2 November.

## What guests receive

A green-and-ivory Her Africa Table email with a first-name greeting, the event name/date, the published Host or organisation name, and an optional short message from the Host. It links to the published recap, or back to the event if no recap exists. Secondary links offer feedback, actual networking history when present, and a linked Community only when that recipient may see it.

It does not attach another ticket, share contact details, create a connection or join a Community automatically. Online-only events are excluded: buying a ticket is not evidence that someone attended an online session.

## Host controls

Open the event's Host page and find **After the event — A thank-you from your table** below the main workspace.

- Switch automatic thank-yous on or off and press **Save changes**.
- Add an optional message, up to 600 characters.
- **Preview email** shows an example for Amina without sending anything. Preview links are disabled.
- **Refresh status** reloads delivery counts without discarding an unsaved message.
- Once recipient jobs are prepared, the message is locked to keep retries consistent. The switch can still stop unclaimed messages. An email already being sent or accepted cannot be recalled.

Access is limited to the event's active Host and existing authorised event managers. A door-scanning helper does not gain access to these settings or recipient content.

## Timing and delivery boundaries

Emails become due at **08:00 the day after the event ends, in that event's timezone**. The existing Supabase dispatcher was verified active on a five-minute schedule; the daily Vercel cron remains a fallback. This is a due time, not an exact inbox-delivery promise. Queue backlog, worker failures and the provider can delay delivery.

Only published/completed in-person or hybrid events ending after the rollout timestamp are considered. No retrospective campaign runs for earlier events. Preparation stops three days after an event ends.

Each recipient must have a confirmed/attended registration, a current recorded check-in, a verified email, eligible account access and event emails enabled. Any associated order must be in an accepted payment state. The delivery service checks eligibility again immediately before preparing content, including Host opt-out, preference changes, reversed attendance, refunds and event cancellation.

The database keeps one event/recipient delivery record and one deduplicated notification job; provider retries use that same job's idempotency key. Prepared content is snapshotted for consistent retries. This reuses the existing Resend engine rather than introducing a separate sender. Provider acceptance is not proof of inbox delivery, and distributed email delivery is not an absolute exactly-once guarantee.

## Verification

| Level | Evidence | Still open |
| --- | --- | --- |
| 1 — Implemented behaviour | Actual renderer, delivery guard, provider payload and Host component executed with controlled dependencies. Escaping, conditional links, preview-without-send, explicit save, duplicate-click prevention, locked message, error recovery and retained drafts passed. Full repository tests, TypeScript and production build passed. | Physical accessibility and mail-client checks. |
| 2 — Database integration | Migration applied. All nine live installation/privilege checks passed. **32 rollback SQL assertions** passed for eligibility, Host settings, limits, deduplication, stop/resume, locked content, claimed-job checks, snapshots and pre-send revocation. Fixture cancellation used the audited lifecycle. Follow-up queries confirmed zero remaining test users, events or jobs. | Independent authenticated browser write/refresh rehearsal. |
| 3 — End to end | Desktop and 390 px example-data layouts inspected in a browser using the actual rendered component/email. This proves presentation only. | A consenting test inbox, actual dispatcher-to-Resend delivery, Spam/Promotions, Gmail/Outlook/iOS rendering, saved Host controls in an independent real browser session, and operational retry monitoring. |

The first rollback attempts did not pass: earlier tool confirmations expired, then fixture setup encountered existing registration-notification/lifecycle guards. The fixture was corrected to use complete free orders and the audited cancellation operation; the final complete run passed. No production guard was disabled and no real guest was emailed.

### Database and configuration

Applied migration: `supabase/migrations/20261102161456_event_thank_you_emails.sql`. **Do not run it again.** No new Vercel variables are needed; existing Resend, site-address, service-key and dispatcher configuration are reused.

`supabase/tests/075_event_thank_you_emails.sql` is a rollback-only developer test, **not a migration**. Do not stage it as a production migration.

Security advisor review showed three expected new private, RLS-enabled/no-policy tables (direct client access denied) and two explicitly guarded authenticated RPCs. Anonymous privileged-function exposure did not increase. Existing project-wide security findings remain, including leaked-password protection being off; this feature is not project-wide security clearance. [Supabase advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Short inbox acceptance checklist

1. Use a private test event and consenting test recipients; do not send a broad retrospective campaign.
2. Save a short Host message, refresh, and confirm it persists. Verify an unrelated member/scanning helper cannot change it.
3. Include one recorded arrival, one non-attendee and one opted-out recipient. Only the eligible arrival should receive the thank-you.
4. Confirm greeting, event/Host details, personal note and authorised links in both HTML and plain text. Check Spam/Promotions too.
5. Verify the same event/recipient has one delivery job after a repeat worker run. Check failed/suppressed/accepted counts without equating provider acceptance to inbox delivery.
6. Verify late preference withdrawal and Host switch-off stop emails that have not started sending.

Networking invitations are unchanged: checked-in guests see **Join networking / Not now** inside the open event page when the Host starts the session. Registration alone does not opt anyone in. These are not background push alerts or site-wide popups.
