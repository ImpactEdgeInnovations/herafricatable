# Event check-in runbook

The check-in system keeps ticket purchase and attendance separate. A fulfilled order
creates a confirmed `event_memberships` row. Presenting a valid private pass creates an
immutable `event_checkins` row and changes that membership to `attended`.

## One-time deployment

1. Apply `supabase/migrations/20260724130000_event_checkin_operations.sql` in the
   Supabase SQL editor. Run the complete file once; it includes its own transaction.
2. Confirm the migration completes without an error.
3. Confirm each door operator has the `event_staff` role and an
   `event_staff_scopes` row for the correct event. Do not share a Super Admin login.
4. Deploy the matching application commit through `main` and Vercel.

The application remains safe if code deploys first: Admin displays a migration-required
state and member pass requests do not expose data. Do not begin live check-in until both
the database migration and application deployment are complete.

## Before doors open

- Confirm every expected guest has a fulfilled order and a `confirmed` event membership.
- Open one member pass from a real test account and verify both QR and manual code.
- Use the exact phones/tablets and browsers assigned to the door team.
- Test camera permission granted and denied. Manual entry must remain available.
- Verify the selected event in Admin before every scanning session.
- Perform a test scan, duplicate scan and reversal; retain the audit record.
- Confirm device time, internet connectivity, charging and a backup hotspot.

Check-in opens eight hours before the event start and closes twelve hours after its end.
An invalid or wrong-event credential returns no attendee identity. A duplicate returns
the original attendance time and creates no second attendance row.

## Door workflow

1. Sign in through Admin using the operator's own scoped account.
2. Open **Check-in**, select the event and confirm the title aloud.
3. Ask the member to present the QR pass. Start the camera only with permission.
4. If camera access or decoding fails, enter the ten-character manual code.
5. Admit only after the console shows the attendee name and **Check-in confirmed** or
   **Already checked in**. Escalate `not recognized` results without guessing identity.
6. If the wrong member was scanned, use **Reverse**, provide a meaningful reason, then
   scan the correct pass. Never edit or delete attendance directly in Supabase.

## Incident handling

- Stop scanning if the console is pointed at the wrong event, staff scope appears wider
  than expected, or names appear for invalid credentials.
- Preserve the time, operator email, event, visible result and device type. Never copy a
  QR token or manual code into support tickets, chat, analytics or screenshots.
- A Super Admin may remove the staff event scope immediately. Existing attendance and
  audit rows remain preserved.
- If connectivity fails, keep a controlled paper arrival list and reconcile it through
  the normal scoped console after service returns. Do not insert database rows manually.

## Post-event reconciliation

Compare fulfilled orders, confirmed memberships and active check-ins. Investigate every
fulfilled attendee without a check-in and every reversal. Export only the minimum fields
needed for operations and follow the platform retention policy.
