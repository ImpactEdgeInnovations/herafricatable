# Community production acceptance

Last completed rehearsal: 13 August 2026
Community: Nairobi Founding Table  
Mode: controlled tagged-account rehearsal

Read-only production readiness was reconfirmed on 11 August 2026: the Community
event proposal tables and functions are present, unknown events remain private,
and signed-out visitors cannot read Host or Admin proposal projections.

Gathering-room production readiness and positive writes were verified against live
Supabase on 13 August 2026. The isolated event passed attendee privacy, questions,
support, Host answers, open live text, Moderator pinning and blocked-pair visibility,
then its event and Community fixtures were cancelled and archived.

Reminder delivery and standalone event-question readiness were verified later on
13 August 2026. The reminder scheduler is deployed and service-only. Event questions,
supports and report projections are private; signed-out visitors cannot list, submit,
support, answer, report or read the Admin queue. Positive member, Host and Super
Admin event writes also passed in the credentialed multi-account rehearsal.

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
- Forty-five conversations load without duplication across three cursor pages.
- The platform Community module has four of four release checks passed and the
  global feature flag is enabled after an audited data-preserving pause and restore.
- The Nairobi Founding Table has four of eight publication checks passed and remains
  a private draft until its final operational and human checks are complete.

## Evidence-producing commands

```bash
npm run ops:community:accept-test-invitations
npm run ops:community:accept-member-journeys
npm run ops:community:accept-membership-lifecycle
npm run ops:community:accept-safety
npm run ops:community:accept-events
npm run ops:community:gathering-readiness
npm run ops:community:accept-gatherings
npm run ops:community:accept-release
```

The full scale rehearsal uses:

```bash
HAT_COMMUNITY_SCALE_WRITE=1 npm run ops:community:accept-scale
```

It requires the tagged cohort credentials plus a Super Admin acceptance identity
in `.env.test.local`. The command does not print passwords or tokens.

## Remaining before publishing the Nairobi Founding Table

- Verify Community notification preferences, weekly briefing deduplication and
  delivery retry with the production email provider.
- Verify private contacts, test-account exclusions, retention thresholds and the
  three-person anonymous outcome threshold with separate member sessions.
- Record Safari, Chrome, iPhone and Android results with two member sessions open
  at the same time.
- Rehearse programming changes, unanswered-Ask follow-up, read-only closure and
  ownership handover, then complete the remaining Nairobi checks in Admin Release.

No second chapter, unrestricted public campaign or automatic creator payout should
open before these items are recorded as passed.
