# Community Quick Check-ins Operations

Quick Check-ins help a Community make a small decision or understand a current
need without exposing individual answers. They are deliberately lighter than a
survey and do not create points, rankings or engagement scores.

## Production migration

Run `supabase/migrations/20260803210000_community_check_ins.sql` after all
earlier migrations. Until it is applied, the Check-ins navigation and section
remain hidden and the rest of the Community continues normally.

## Member behavior

- Any active member of the Community can ask one 10–220 character question.
- A check-in has two to six distinct choices and can remain open for 3, 7, 14
  or 30 days, or until its creator closes it.
- One member can create no more than three check-ins in seven days.
- A member has one answer and may change it while the check-in is open.
- Results show counts and percentages only after at least three members answer.
- The creator and Hosts never receive a voter list.

## Host behavior

A Community owner or moderator can close an open check-in. Closing prevents new
or changed answers but keeps the identity-private totals visible. The creator or
a Host can remove a check-in from the room while retaining its audit record.
Closing and removal are audited; individual answers are not.

## Acceptance

1. Create a check-in with two choices and confirm it appears first.
2. Answer from three Community member accounts and confirm results remain hidden
   for the first two responses, then appear as totals after the third.
3. Change one answer and confirm totals update without creating a second vote.
4. Confirm no UI or RPC returns voter identities.
5. Confirm a non-member cannot list, create or answer a check-in.
6. Confirm a blocked creator's check-in is excluded from that member's list.
7. Close and remove as the creator and as a Host; confirm an unrelated member
   can do neither.
8. Confirm expired check-ins reject answers even if their stored status is open.
9. Inspect `audit_events`: creation and closure are present, individual answers
   and choice identifiers are absent.

## Safety boundary

Check-in questions remain Community content and are subject to the Community
guidelines. Hosts can close a problematic check-in immediately and escalate the
content to platform safety. A future moderation release may add a dedicated
report action; it must preserve the same no-voter-identity boundary.
