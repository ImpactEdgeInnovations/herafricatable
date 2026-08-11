# Member-proposed public events

This launch tier lets an active member propose a public event without first
owning a Community. A proposal is not an event and is never publicly visible.
Only Super Admin approval creates the canonical event.

## Member journey

1. Open **Events → Propose an event**.
2. Complete the guided purpose, place, hosting and follow-up steps.
3. Save a private draft or send the completed proposal for review.
4. Respond to review guidance when changes are requested.
5. After approval, share the canonical public event page. Her Africa Table keeps
   registration in Manual review for this launch tier.
6. After the event, apply separately to create a follow-up Community if there is
   a useful reason for the relationships to continue.

An approved event is free, public and capped at 500 guests. Paid member events
remain unavailable until refund, settlement, tax and dispute operations pass
acceptance.

## Community conversion boundary

Selecting **This event may grow into a Community** records an intention only.
Confirmed guests see a separate **Keep me informed** choice on the event page.

- Attendance never creates Community membership.
- The Host cannot read private attendee information from this preference.
- Admin sees only the interested count in the event review record.
- A follow-up Community still requires the normal Host application, Admin review,
  private setup, accountable Host and backup Moderator.
- Invitations may be sent only to guests who explicitly chose to hear about the
  follow-up, and each guest must still accept or request access.

## Release sequence

1. Apply `20260811230000_member_public_event_proposals.sql`.
2. Run `npm run ops:community:member-events-readiness`.
3. Use one active tagged member and one Super Admin to test Draft → Submitted →
   Changes requested → Resubmitted → Approved.
4. Confirm an anonymous visitor can see the approved canonical event but cannot
   read the proposal, private online link, safety phone number or Host note.
5. Confirm only a confirmed or attended guest can save the follow-up choice.
6. Confirm cancelling a proposal never cancels an already approved event.
7. Keep Manual review and the free price enforced at the database layer.

## Event page and related Community

Apply `20260812030000_community_admission_and_event_companion.sql` after the two
member-event migrations.

- Ticket choice, free-place requests, manual review and waitlisting happen on the
  canonical event page. Automatic card payment still opens Paystack because card
  details must never pass through Her Africa Table servers.
- After registration approval, the event page shows a direct **Open my event pass**
  action. The pass remains private and includes the existing QR/manual check-in code.
- A published event linked through `community_event_links` shows a calm related-
  Community card before and after the event.
- Event registration and Community membership are separate choices. Registering
  never joins a Community, and joining a Community never registers for an event.
- Public Communities may use immediate entry or Host approval. Private Communities
  always require approval. Hosts and moderators review requests; Super Admin can
  see and act across all Communities.

## Past-event archive

Apply `20260812010000_member_event_archives.sql` after the proposal migration.

- A public past event remains available through its canonical event page and the
  Past events archive.
- The approved Event Host may save a private recap and send it for Admin review.
- Admin approval publishes the recap into the canonical `event_recaps` record.
- The Host and confirmed or attended guests may offer up to six JPEG, PNG or
  WebP images each after the event ends.
- Every image requires a description and explicit sharing/subject-consent
  confirmation. The object and metadata stay private until Admin approval.
- Approved images enter a published event gallery. Rejected or withdrawn images
  never appear publicly.
- Attendee reflections use the existing private feedback and testimonial-consent
  journey. Guests cannot post directly onto the public event page.
- An approved recap may link one published Community led by the Event Host. This
  is a navigation link only and grants no Community membership.

## Incident and moderation ownership

Her Africa Table remains the publication, registration and safety operator for
this tier. Approval does not give the proposing member unrestricted Admin or
attendee-data access. Event staff access must be granted separately and scoped to
the canonical event using the existing event-staff workflow.
