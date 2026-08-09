# Notification and email delivery setup

Her Africa Table stores in-app notifications and transactional email work in Supabase.
Business actions only enqueue delivery jobs. A protected worker claims jobs with row
locks, sends them through Resend, records each attempt, and retries failures with
exponential backoff. Provider keys and recipient data stay server-side.

The same worker also reconciles community host subscriptions before starting the
idempotent weekly Community briefing batch. Host reconciliation promotes one
scheduled renewal, starts grace, expires lapsed plans, pauses unsafe paid offers
and queues deduplicated owner reminders. The briefing creates an in-app update and
optional email only for members who permit it and only when a room had new
conversations or replies in the preceding seven days, or has a linked gathering in
the next seven days. It contains aggregate counts, never post bodies, member names,
private saved state or test-account activity. Community reply and briefing email
both default off until the member enables them inside that room.

## Required Vercel environment variables

Add these to **Production** and the appropriate Preview environment only:

- `RESEND_API_KEY`: restricted Resend API key for sending email
- `EMAIL_FROM`: verified sender. Production temporarily uses
  `Her Africa Table <community@caseready.africa>` until the Her Africa Table
  domain is verified.
- `CRON_SECRET`: a random value of at least 32 characters
- `NEXT_PUBLIC_SITE_URL`: canonical HTTPS production URL
- `SUPABASE_SECRET_KEY`: existing server-only Supabase secret key

Never add these values to Git or prefix secrets with `NEXT_PUBLIC_`.

## Resend

1. Add and verify the sending domain in Resend.
2. Publish SPF and DKIM records and wait for verification.
3. Create a sending-only API key and add it to Vercel as `RESEND_API_KEY`.
4. Set `EMAIL_FROM` to an address on the verified domain.
5. Send to an internal address first and verify inbox, spam placement, links, and
   the delivery record in `/admin/notifications`.

The Super Admin delivery screen includes **Send private test**. It sends only to
the signed-in Super Admin, limits tests to one per minute and records success or
failure in the audit trail. A configured badge is not delivery proof; the test
must be accepted by Resend and confirmed in the receiving inbox.

The same screen now shows five plain-language readiness checks for the provider,
sender, scheduled worker, production links and private Supabase connection. A
green checklist confirms configuration only; the inbox test remains the final
delivery proof.

`caseready.africa` is a temporary launch sender, not a permanent Her Africa Table
identity. After the Her Africa Table domain is verified, rotate the domain-scoped
Resend key and change `EMAIL_FROM`; no code change is required.

The worker uses `POST https://api.resend.com/emails`, a bearer API key and a unique
idempotency header per outbox job.
Reserved `.invalid` test-account recipients are completed as suppressed deliveries
and never sent to the provider.

## Scheduled processing

The worker route is `GET /api/cron/notifications`. Vercel automatically sends
`CRON_SECRET` as a bearer authorization header when invoking a configured cron.
The first authenticated worker call in each Nairobi calendar week creates that
week's Community briefing batch. Subsequent calls are no-ops for the batch while
continuing to reconcile host plans, queue due member-controlled Community event
reminders and process ordinary delivery jobs.

`vercel.json` runs the worker daily at 05:00 UTC (08:00 Nairobi) as the maximum
automatic safety net supported by the current Hobby plan. A Super Admin can use
**Process queue now** from `/admin/notifications` after time-sensitive registration
or support activity. Before public scale, upgrade to Pro and change the schedule to
`*/5 * * * *`, or use an approved external scheduler that sends the same bearer
header. The manual control is an operational fallback, not the long-term scheduler.

## Operational acceptance

- Confirm duplicate event delivery cannot create duplicate emails.
- Confirm repeated worker calls create only one Community briefing batch per week.
- Confirm repeated worker calls cannot promote more than one host renewal or send
  duplicate expiry reminders.
- Confirm repeated worker calls queue each Community event reminder revision once,
  and that changing an event time recalculates a still-pending reminder.
- Confirm a quiet Community creates no member briefing and reply email defaults off.
- Confirm room preferences, global Activity preferences and bilateral member blocks
  are all respected.
- Confirm Community briefing payloads contain counts and a room link only.
- Force a provider failure and verify queued retries, attempt records, and final failure.
- Confirm member preferences suppress only network, event and support email; account,
  payment and privacy messages remain transactional.
- Confirm `/api/health` reports `ok` without exposing credentials or personal data.
- Alert an operator when failed jobs remain non-zero or the oldest queued job exceeds
  ten minutes.
