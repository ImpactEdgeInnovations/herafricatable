# Community production acceptance

Last completed rehearsal: 9 August 2026
Community: Nairobi Founding Table  
Mode: controlled tagged-account rehearsal

Read-only production readiness was reconfirmed on 11 August 2026: the Community
event proposal tables and functions are present, unknown events remain private,
and signed-out visitors cannot read Host or Admin proposal projections.

Gathering-room production readiness was verified against live Supabase on 13 August
2026. The room tables and protected functions are deployed; signed-out visitors
cannot list rooms, send live text or read the Gathering safety queue, and an unknown
room returns no data. The four-account write rehearsal is prepared but requires the
reserved backup-moderator credential to be refreshed using the ignored local server
key before it can produce final live-window evidence.

Reminder delivery and standalone event-question readiness were verified later on
13 August 2026. The reminder scheduler is deployed and service-only. Event questions,
supports and report projections are private; signed-out visitors cannot list, submit,
support, answer, report or read the Admin queue. Positive member/Host/Admin writes
remain part of the credentialed multi-account rehearsal.

## Passed with live Supabase accounts

- Two ordinary members, one Community owner and one backup Moderator all hold
  active membership in the same room.
- Members can publish, reply, appreciate, follow and save a conversation.
- An ordinary member cannot publish an announcement or pin a conversation.
- The Moderator can pin a Host announcement and no more than three pins are
  permitted by the database contract.
- Blocking immediately removes the other member's conversations and directory
  entry, and unblocking safely restores permitted visibility.
- A signed-out visitor cannot read private Community conversations.
- A member can decline an invitation, cancel a join request, leave, request to
  rejoin after leaving, be removed by a Host and be approved again.
- The member finished the lifecycle rehearsal with active access restored.
- A private safety report increased the Host's count without exposing report
  evidence to the Host or Community Moderator.
- Reserved `.invalid` test recipients were suppressed from external email while
  their delivery jobs were completed safely.

## Evidence-producing commands

```bash
npm run ops:community:accept-test-invitations
npm run ops:community:accept-member-journeys
npm run ops:community:accept-membership-lifecycle
npm run ops:community:accept-safety
npm run ops:community:gathering-readiness
npm run ops:community:accept-gatherings
```

The full scale rehearsal uses:

```bash
HAT_COMMUNITY_SCALE_WRITE=1 npm run ops:community:accept-scale
```

It requires the tagged cohort credentials plus a Super Admin acceptance identity
in `.env.test.local`. The command does not print passwords or tokens.

## Remaining before declaring the module fully accepted

- Restore `SUPABASE_SECRET_KEY` in the ignored local `.env.local` file so the
  four reserved test identities can be refreshed without using a real account.
- Supply `HAT_ADMIN_TEST_EMAIL` and `HAT_ADMIN_TEST_PASSWORD` locally and run the
  five-role scale command.
- Confirm at least 45 conversations load across three stable cursor pages with
  no duplicates and with pins ordered first.
- Review and dismiss the controlled safety report from Admin → Safety after its
  evidence boundary has been inspected.
- Record Safari, Chrome, iPhone and Android results with two member sessions open
  at the same time.
- Complete the Nairobi release checklist in Admin and end acceptance mode before
  deciding whether to open Communities to real members.

No second chapter or automatic creator payout should open before these items are
recorded as passed.
