# Notification and email delivery setup

Her Africa Table stores in-app notifications and transactional email work in Supabase.
Business actions only enqueue delivery jobs. A protected worker claims jobs with row
locks, sends them through Resend, records each attempt, and retries failures with
exponential backoff. Provider keys and recipient data stay server-side.

## Required Vercel environment variables

Add these to **Production** and the appropriate Preview environment only:

- `RESEND_API_KEY`: restricted Resend API key for sending email
- `EMAIL_FROM`: verified sender, for example `Her Africa Table <hello@herafricatable.com>`
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

The worker uses `POST https://api.resend.com/emails`, a bearer API key and a unique
idempotency header per outbox job.

## Scheduled processing

The worker route is `GET /api/cron/notifications`. Vercel automatically sends
`CRON_SECRET` as a bearer authorization header when invoking a configured cron.

Do not add a frequent `vercel.json` schedule until the Vercel plan is confirmed:

- Pro or Enterprise: use `*/5 * * * *` for five-minute processing.
- Hobby: Vercel currently permits only one run per day, which is unsuitable for
  time-sensitive registration and support email. Upgrade or use an approved external
  scheduler that sends the same bearer header.

## Operational acceptance

- Confirm duplicate event delivery cannot create duplicate emails.
- Force a provider failure and verify queued retries, attempt records, and final failure.
- Confirm member preferences suppress only network, event and support email; account,
  payment and privacy messages remain transactional.
- Confirm `/api/health` reports `ok` without exposing credentials or personal data.
- Alert an operator when failed jobs remain non-zero or the oldest queued job exceeds
  ten minutes.
