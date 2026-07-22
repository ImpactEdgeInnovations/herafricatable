# Post-event feedback operations

Past Events and feedback close the event lifecycle without turning private member
reflections into public marketing by default.

## Deployment

Apply `supabase/migrations/20260724210000_post_event_feedback.sql` after all earlier
migrations, then deploy the matching application commit. The member and Admin surfaces
display a migration-required state if application code arrives first.

## Eligibility and privacy

- Feedback opens only after the stored event end time.
- The member must have a `confirmed` or `attended` event membership.
- Each member has one editable response per event.
- Ratings, highlights, improvements and follow-up notes are private to that member and
  an explicitly scoped event administrator.
- Aggregates are calculated through a scoped database operation; browsers cannot query
  all feedback directly.

## Testimonial consent

The member chooses one of three states: private, publish anonymously, or publish with
their member name. Anonymous or named permission records consent version `2026-07-22`
and places the quote into a pending review state. The quote is public only after an
event administrator approves it.

Members can withdraw permission from the feedback form. Withdrawal removes the quote
and attribution from the public projection while retaining the underlying private
event feedback and audit event. A reviewer must never copy a quote into a page, deck,
email or social post outside this controlled workflow.

## Event team workflow

1. Confirm the event end time and attendance records.
2. Open **Admin → Feedback** and select the correct event.
3. Review aggregate ratings separately from individual comments.
4. Use internal follow-up for a concern requiring member contact; never place private
   details in the note.
5. Approve a testimonial only when its permission and wording are unambiguous.
6. Create the public recap with factual, verified highlights and publish it separately.

## Launch acceptance

Test with an attendee, a non-attendee, scoped event staff and Super Admin. Verify early
submission denial, private ownership, cross-event staff denial, aggregate calculations,
recap draft/publish, named and anonymous attribution, rejection, and withdrawal.
