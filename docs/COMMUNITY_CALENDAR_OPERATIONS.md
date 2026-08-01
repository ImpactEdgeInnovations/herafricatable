# Community Calendar and Reminder Operations

Community calendars use the existing platform event catalogue. A Community
owner or moderator chooses which published events appear; members can view the
exact event time, download a standard calendar file and choose a personal
reminder. A reminder does not register a member or reserve a seat.

## Production migration

Run `supabase/migrations/20260803170000_community_event_reminders.sql` after all
earlier migrations. The release is fail-soft: before the migration, events and
calendar downloads continue to work while reminder controls stay hidden.

The migration adds member-owned reminder records, event-reschedule syncing and
the service-role-only `queue_due_community_event_reminders()` worker function.

## Worker

`/api/cron/notifications` queues due reminders before claiming notification
jobs. Keep the worker on the production schedule described in
`NOTIFICATIONS_SETUP.md`. Delivery uses existing global in-app and event-email
preferences, retries and deduplication.

## Member acceptance

1. Open a Community with a future linked event.
2. Confirm the card shows the date, time and timezone.
3. Download **Add to calendar** and open the `.ics` file in Apple, Google or
   Outlook Calendar.
4. Choose **One day before**, reload and confirm the choice remains.
5. Change to **One hour before**, then remove the reminder.
6. Confirm none of these actions changes event registration or seat status.
7. Confirm past events have no reminder control.

## Boundary acceptance

- A member cannot read or update another member's reminder.
- A member cannot schedule a reminder for an unlinked event or a Community she
  has not joined.
- Removing an event from a Community deletes its reminder records.
- Rescheduling an event recalculates pending reminders and increments their
  delivery revision.
- The queue ignores test accounts, inactive members, Draft Communities,
  unpublished events and events that have started.
- Repeated worker calls do not queue the same reminder revision twice.
