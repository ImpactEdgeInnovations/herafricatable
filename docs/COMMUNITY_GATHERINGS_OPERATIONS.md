# Community Gatherings operations

Community Gatherings turn an approved Community event into a focused member room without mixing temporary live chat into the permanent Community feed.

## Member journey

1. A published or completed event linked to a Community receives a Gathering room automatically.
2. Active Community members open **Gatherings** from the Community’s local navigation.
3. A member chooses **I’m going** and separately decides whether other attendees may see her.
4. Questions open seven days before the event. Members support an existing question instead of repeating it.
5. Live text opens 30 minutes before the start and remains writable until 24 hours after the event ends.
6. The room then becomes read-only. The Host publishes a short reviewed recap into permanent Community Conversations.

The global member navigation remains unchanged. Overview, Conversations, Gatherings and People are local to the Community currently being viewed.

## Online meeting boundaries

- Calls use Google Meet, Zoom, Microsoft Teams or another HTTPS link; video is not embedded.
- Hosts may see and update the private link at any time.
- Ordinary members receive the link only when they have RSVP’d **going**, from 30 minutes before the event until one hour after it ends.
- The link opens in a new tab with `noopener noreferrer`.
- A reminder or Community RSVP does not bypass the authoritative event registration or payment flow.

## Host controls

Hosts and Community moderators can:

- choose the Gathering style;
- add or replace the private meeting link;
- use open, slow, Hosts-only or closed conversation mode;
- mark submitted questions answered or hide them;
- pin up to three useful messages;
- remove a message with an audit entry;
- publish or update the permanent recap.

Hosts do not receive unrestricted Admin safety access. Members can report a Gathering message privately; the evidence snapshot appears in the existing Admin safety workspace and can be reviewed, hidden or dismissed by a Super Admin or moderator.

## Database rollout

Apply [`20260812170000_community_gathering_rooms.sql`](../supabase/migrations/20260812170000_community_gathering_rooms.sql) once in the Supabase SQL editor. It backfills rooms for existing linked events and seeds future rooms automatically.

Then apply [`20260813100000_community_gathering_reminder_delivery.sql`](../supabase/migrations/20260813100000_community_gathering_reminder_delivery.sql). It keeps reminders inside the existing notification outbox and Resend worker, sends members back to the protected Gathering room, alerts Hosts to new pre-event questions and announces a newly published recap. Delivery remains consent-led; choosing **I’m going** does not automatically subscribe a member to email.

After applying it, verify:

```sql
select
  to_regclass('public.community_gathering_rooms') as rooms,
  to_regprocedure('public.list_community_gathering_cards(uuid)') as cards,
  to_regprocedure('public.send_community_gathering_message(uuid,text)') as live_text,
  to_regprocedure('public.publish_community_gathering_recap(uuid,text)') as recap;
```

## Production rehearsal

Use one Host, one backup moderator, two ordinary members and one Super Admin.

- Confirm a non-member cannot open the room or call its RPCs.
- Confirm an RSVP-hidden attendee does not appear to another member.
- Confirm an eligible online link is hidden outside its joining window.
- Submit, support, answer and hide questions.
- Exercise open, slow, Hosts-only and closed conversation modes.
- Confirm non-attendees cannot post live text.
- Pin three messages and confirm a fourth pin is rejected.
- Report a message and finish its Admin safety review.
- Move the event past the close time and confirm the room is read-only.
- Publish a recap and confirm only that recap enters permanent Conversations.
- Check keyboard, VoiceOver/TalkBack and 360 px mobile layout.

Automated evidence commands:

```bash
npm run ops:community:gathering-readiness
npm run ops:community:accept-gatherings
```

The first command is read-only and verifies the deployed schema and signed-out boundaries. The second uses only the four reserved `.invalid` test identities. If a test credential has drifted, restore `SUPABASE_SECRET_KEY` locally and run `npm run ops:provision-community-test-cohort` before retrying. No key or password is printed.

Do not enable member-created paid Gatherings or automatic Host settlements until commerce, refund and payout acceptance is separately complete.

## Questions on standalone events

Events without a linked Community use a focused **Questions for the Host** area on
the event page. It is not a general social feed. Active members may ask before the
event, support an existing question and privately report a concern. The approved
event proposer or Admin can answer or hide a question. Reports expose only the
captured question to the Admin safety workspace.

Apply `20260813110000_event_host_questions.sql` after the Gathering reminder
migration. Community-linked events continue to use their protected Gathering room;
the event page takes active Community members there instead of creating a second,
fragmented question queue.
