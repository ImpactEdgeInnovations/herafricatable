# Event communications — controlled acceptance

Updated: 4 October 2026. This is the evidence sheet for `COMMS-01` in the [Events taskboard](./UX_EVENTS_IMPLEMENTATION_TASKBOARD.md). Code and a successful build are not proof that a guest received an email.

## What was added

- A confirmed attendee of a standalone event can explicitly request or remove one reminder from her private event pass. A Community gathering keeps its existing reminder system.
- The reminder is scheduled one day before the event. The current Vercel cron runs daily at 08:00 Nairobi, so delivery is **before** the event, not guaranteed at an exact hour. If a more precise service level is required, change the scheduler only after the Vercel plan or an approved external scheduler supports it.
- The existing notification preferences control whether the reminder also becomes an email. Turning off Event emails prevents the email; in-app updates follow the separate in-app preference.
- Cancellation, loss of a confirmed place, event pause and rescheduling suppress stale queued reminders. The delivery worker checks eligibility again before calling Resend. The message links to the protected pass and never contains the private online joining URL.
- Publishing a new Admin event announcement now requires a deliberate confirmation; the existing notification trigger queues its guest notice. Editing an already-published announcement does not send a second email. For a material change, prepare and publish a new update.

## Deployment sequence

1. Apply [20261004090000_standalone_event_reminders.sql](../supabase/migrations/20261004090000_standalone_event_reminders.sql) to the **same Supabase project used by production**. This migration adds a private reminder table and RPCs; it does not create reminders or send email by itself.
2. Deploy the matching Git commit to Vercel. No new environment variable is required; the existing `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL` and `CRON_SECRET` must remain correctly configured. Supabase Auth OTP uses its separate SMTP setup.
3. Verify the table and functions exist in Supabase SQL Editor with a read-only query:

   ```sql
   select
     to_regclass('public.standalone_event_reminders') as reminder_table,
     to_regprocedure('public.set_my_standalone_event_reminder(uuid,boolean)') as choice_function,
     to_regprocedure('public.queue_due_standalone_event_reminders(timestamptz)') as queue_function,
     to_regprocedure('public.check_standalone_event_reminder_job(uuid)') as delivery_guard;
   ```

4. Keep the rescheduled 9 October private pilot unpublished until its separate launch gates pass. Do not enable guest access or automatic payment for this communications test.

## Real-account acceptance record

Use an approved, controlled attendee account and a controlled inbox on a published test event more than one day in the future. Do not create or publish a replacement for the named pilot. Record times in EAT; never paste OTPs, API keys, private joining links or guest messages into this sheet.

| Check | Expected evidence | Result/date/role/device |
| --- | --- | --- |
| Opt-in | Confirmed attendee sees “Remind me”; pending/anonymous attendee cannot reach the control or private pass | Not run |
| Preference | Event email off yields in-app only; Event email on permits one queued email | Not run |
| Due delivery | A due reminder is queued by the signed cron or Admin queue action; provider ID and controlled inbox arrival agree | Not run |
| Duplicate prevention | Repeated worker call does not send a second email for the same reminder revision | Not run |
| Withdrawal | Removing a not-yet-sent reminder suppresses its queued email | Not run |
| Lost place | Cancelling the confirmed place suppresses the queued reminder | Not run |
| Material change | Rescheduling or pausing the event suppresses the stale reminder; a reviewed new Admin update informs affected guests | Not run |
| Admin publication | Publishing a new announcement requires confirmation and sends one notice; draft and cosmetic edits do not send one | Not run |
| Recovery | A failed provider attempt appears in Admin Notifications and can be retried without duplicate delivery | Not run |

Only mark `COMMS-01` Done after the relevant rows have dated evidence from separate accounts and the Admin release gate has been recorded independently. A Resend API acceptance response is not the same as an email arriving in the inbox.
