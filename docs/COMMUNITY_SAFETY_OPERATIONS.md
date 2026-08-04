# Community Safety Operations

Community safety uses one bounded Admin queue for reported posts, comments and
Quick Check-ins. Moderators receive only the evidence captured by a member's
report; they do not receive general access to a private Community or to member
Check-in answers.

## Production migration

Run `supabase/migrations/20260804050000_community_check_in_safety.sql` after all
earlier migrations. The application falls back to the existing post-report
queue until the unified functions are available.

## Member reporting

An active Community member can report another member's Quick Check-in from the
Check-in card. The confirmation explains exactly what is transmitted:

- the selected concern category;
- the member's 10–2,000 character explanation;
- the question and answer-choice labels as they existed at report time; and
- the content, Community and creator identifiers required for investigation.

The evidence snapshot never includes voter identities, individual answers or
response counts. A member cannot report her own Check-in or create duplicate
active reports for the same Check-in.

## Moderator workflow

Admin → Operations → Trust and safety shows post and Quick Check-in reports in
one queue. A Super Admin or Moderator can:

1. **Start review** to claim the report without changing content.
2. **Hide content** with a required reason. Posts become hidden and Check-ins
   become removed immediately.
3. **Dismiss** with a required reason when the evidence needs no action.

Every queue access and decision is audited. The launch-readiness open-safety
count includes Check-in reports.

## Acceptance

1. Report a Check-in from an active non-creator member account.
2. Confirm the creator, non-members and removed members cannot report it.
3. Confirm a duplicate active report is rejected.
4. Inspect the evidence JSON and verify it contains no response table data,
   voter identity, selected option or response count.
5. Start review, dismiss and hide from Moderator accounts; verify required
   reasons and audit records.
6. Confirm hiding removes the Check-in from the room but preserves evidence.
7. Confirm an event staff or sponsor role cannot open or decide reports.
8. Confirm the old post queue remains visible when the new migration is absent.
