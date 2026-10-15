# Joining, Host decisions and email — 15 October 2026

## What Hosts can do

- **Start a Community → Who can join:** set Maximum members, or leave it blank for no limit. The limit includes the owner, moderators and reserved paid places. Pending applications and waiting-list entries do not reserve places.
- **Community → Host tools → Who can join:** change the limit, open/close the waiting list, approve or decline waiting members. A limit cannot be lowered below occupied places. No existing member is removed automatically.
- **Community → Host tools → Join requests:** approve or decline an application. A decline needs a short reason; it is shared privately with that applicant.
- **Event → Host tools → Guest requests:** approve or decline pending free-place requests. Approved guests receive their event-pass notification. Paid reviews, refunds and settlement remain Admin responsibilities.
- **Event waiting list:** a Host can send a place-available notice only after bookings reopen and a free place is actually available. A notice does not reserve a seat.
- **Host activity cards:** Members and Join requests open their sections on the same page. Posts, replies, unanswered questions and upcoming events load a compact in-place list. Opening a conversation to reply is an explicit choice. Safety cards explain the confidential safety-team process rather than exposing reporter details.

Host alerts use the existing notification jobs and Resend delivery worker. Delivery preferences, retry policy and provider idempotency remain authoritative; a queued message is not proof of inbox receipt.

## Images

The first Community/event creation step now shows an optional image/poster and preview. Upload type, size, dimensions and description checks remain active. Approved pilot Community creation images are reused in its directory card and room until a custom image replaces them. Removing the icon/cover in Host tools also suppresses that original fallback. A fresh upload can replace it later. Non-pilot images still follow approval rules.

## Database already applied

These migrations were executed successfully in the live project `gtzwqromwvzqytygebfc`. **Do not rerun them manually.** Direct SQL execution does not create Supabase migration-history entries; reconcile remote history separately before using CLI deployment workflows.

1. `20261015062516_joining_capacity_host_reviews.sql`
2. `20261015065255_scoped_event_host_admissions.sql`
3. `20261015065258_community_creation_images_and_host_activity.sql`
4. `20261015072442_community_creation_image_removal.sql`

`supabase/tests/057_joining_limits_and_host_reviews.sql` is a **test, not a migration**. It requires pre-existing tagged `.invalid` test accounts and rolls back all synthetic records, audit entries and notification jobs.

## Email templates

Application notifications now share one table-based Her Africa Table design, with readable text, one main action, a fallback address, policy links and a short getting-started section for welcome messages. It uses the existing Resend settings; no new Vercel variables are needed if those settings already work.

Supabase Auth templates are configured separately from application notifications:

| Dashboard template | Repository source |
| --- | --- |
| Authentication → Emails → Magic link or OTP | `docs/SUPABASE_OTP_TEMPLATE.html` |
| Authentication → Emails → Confirm sign up | `docs/SUPABASE_SIGNUP_OTP_TEMPLATE.html` |

Both show `{{ .Token }}`, not a sign-in link. Do not replace it with `{{ .ConfirmationURL }}` or hardcode a six/eight-digit instruction. The app accepts the configured code length.

The owner reported the OTP template saved. Edge displayed the new Confirm sign up source, correct branding, code token and a disabled Save changes button. Independent saved-state reload of both templates and an actual fresh inbox test are still required; native Edge interactions were unreliable. No SMTP credential was changed.

## Verification and remaining acceptance

Passed: full automated suite, TypeScript, production build, escaped email rendering and mocked Resend payload/idempotency; live rollback rehearsal of limits, full/waiting states, permission denial, free approval/pass creation, private Community/event decline reasons, Host queues and creation-image access/removal. Post-test synthetic Community/event counts were zero. No real email was sent by these tests.

Before calling this fully accepted:

- Receive a fresh login code and new-account code; verify the design and enter each on its originating screen. Never share the code.
- In two ordinary pilot accounts, request access to a test approval Community/event; the Host should receive the email, decide on the same page, and the applicant should receive the private result. Check spam as well as inbox.
- Create a disposable test Community with an image and small limit; verify preview, directory/room display, replacement and removal on phone and desktop.
- Populate Host activity and long waiting lists; check keyboard use, mobile scrolling and real members’ understanding.
- Run a separate simultaneous last-place stress test. Transaction locks enforce capacity, but this rehearsal was sequential.
- Repair the separately tracked historical migration ordering failure and rerun clean database CI. Existing legacy security-advisor findings also remain separate release work: [Supabase database linter](https://supabase.com/docs/guides/database/database-linter).

These checks do not enable creator payments, remove existing approval controls or declare the whole platform 100% production-ready.
