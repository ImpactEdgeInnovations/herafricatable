# Event tickets and confirmation emails

28 October 2026 (Africa/Nairobi).

## Delivered

- Confirmed guests can download a one-page green/ivory PDF from their private pass page or **Profile → My tickets**. The paginated list also offers View ticket, with honest empty/error states and past-event labels.
- Ticket fields: guest name, ticket type, canonical booking reference, event name/date/time/timezone, venue, shared Host name and optional company/organisation. An optional saved networking time appears too.
- The PDF and online pass share the same event-bound QR token and 10-character manual code. Downloading does not issue a second ticket, change attendance or bypass current cancellation/refund checks. A saved file cannot be recalled from an inbox; the scanner checks current eligibility, not the printed Confirmed label.
- Host → More → Host details has an optional company/organisation field and explicit sharing guidance. Only opted-in details from the currently active Host are copied. No private Auth email, phone or profile-private contact is used as a fallback. If no Host name is shared, the ticket says Event organising team.
- Future event-confirmation jobs attach the PDF through the existing single-message Resend engine. The standard email greets **Hello [guest name]**, thanks her for registering, and shows a compact details table, published arrival instructions and optional saved networking time. It does not guess Miss/Mrs, invent arrival instructions or claim networking starts automatically.
- The branded email accent now matches the green platform theme. Non-event messages keep the same existing template behaviour; course/membership order confirmations do not get event attachments.

## Email delivery boundaries

The existing queue and Vercel Hobby schedule are unchanged. Automatic attachment means attached **when the confirmation job is processed**, not guaranteed immediate inbox delivery. Previously sent confirmations are not resent automatically; existing eligible guests can download from My tickets now.

Only a claimed, processing confirmation job with its canonical fulfilled event order can fetch an attachment. Recipient email is checked against the current Auth email; current registration/order/event eligibility and credential revocation are checked on each attempt. A stale confirmation is suppressed, not sent with an invalid ticket. Temporary database/PDF/provider failures remain retryable and do not become false successes.

Private job-scoped ticket snapshots make PDF bytes stable across provider retries, retaining the original shared event details. The email directs guests to the live event page for updates. Snapshot rows are inaccessible to browser roles, cascade with their parent job/account and expire 30 days after the event; expired rows are purged in bounded batches during subsequent ticket-email processing. No PDF is put in a public Storage bucket or fetched by Resend from a public pass URL.

## Verification

- L1: real PDF creation, one-page/size checks, Unicode/long-field cases, byte-stable retries, correct QR prefix, private HTTP route 200/401/404/503 behaviour, provider attachment payload/base64/idempotency and escaped personalised email, unchanged non-event commerce, profile pagination/empty/error rendering, suppression persistence/failure handling. Full suite, TypeScript and production build pass before release.
- L2: **30 rollback-only SQL assertions** passed before and after applying the migration: own-account/other-event/other-member boundaries, shared name/company consent, canonical ticket/order, same online-pass credential, published-only arrival notes, saved networking time, private helper/email-RPC grants, claim/recipient checks, stable snapshots, refund/revocation and anonymous denial. All fixture users/records/messages rolled back; no external email was sent.
- PDF visual review: rendered the actual generated sample with Poppler and checked the PNG; no overlaps, clipped fields or broken words. Example only: `output/pdf/her-africa-table-sample-ticket.pdf`, not valid for entry.
- L3 remains separate: real iPhone/Android camera scanning, installed PWA and actual consenting recipient Inbox/Spam acceptance. Mock provider acceptance is not proof of delivery.

Live HTTPS fixture-download rehearsal results are recorded after deployment; the tool explicitly requires `HAT_CONFIRM_TICKET_REHEARSAL=yes` and existing tagged credentials. It creates only a fresh private closed event and zero-value test records, sends no provider mail, then cancels via the audited lifecycle. No passwords, roles or existing real events are changed.

## Database / configuration

Applied live: `supabase/migrations/20261028072336_event_ticket_documents.sql` (Management API history version aligned locally). **No owner SQL or new Vercel variable is needed.** `supabase/tests/072_event_ticket_documents.sql` is a rollback test, not a migration.

The additive private schema has deny-all RLS and no client usage grants. Two own-account authenticated entry points and one service-only delivery entry point use explicit guards and empty search paths. Advisor differences are the intentional scoped definer entry points; pre-existing advisories remain. Pinned `pdf-lib`/fontkit are server-side; the Noto font is bundled into the deployment with its licence. No remote fonts, photographs or URLs are fetched when rendering a ticket.

Dependency audit also reports existing Next.js, sharp and transitive dependency advisories, including a critical Next.js advisory. These are not newly introduced PDF-library findings and require a separate tested upgrade pass; this feature is not a project-wide security clearance.

References: [Resend attachments](https://resend.com/docs/dashboard/emails/attachments), [PDF-LIB](https://pdf-lib.js.org/), [Noto font source](https://github.com/notofonts/noto-fonts/tree/main/hinted/ttf/NotoSans).
