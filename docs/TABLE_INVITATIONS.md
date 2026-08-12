# Personal Community and event invitations

## Member journey

Community Hosts invite from their existing Host workspace. Approved event Hosts
invite from the event itself. The form asks for one email and an optional personal
note; Her Africa Table never imports or stores a member's address book.

An existing active member receives the message immediately through the normal
notification queue. A new or not-yet-active email waits for Super Admin review.
No message is sent to that address before approval.

The recipient opens the invitation, signs in with the same email and accepts on the
same page. If she is not a member, the destination follows her through the membership
request and profile journey. Once membership is active:

- an open, free Community may admit her;
- a private or approval-based Community creates a Host request;
- a paid Community still requires its approved payment journey;
- an event still requires ticket choice or a seat request on the event page.

## Delivery and security

- Database function: `create_table_invitation`
- Admin queue: `/admin/invitations`
- Admin decision: `review_table_invitation`
- Email outbox template: `table_invitation`
- Provider: the existing protected notification worker and Resend sender
- Link lifetime: 30 days
- Link storage: SHA-256 token hash only
- Claim boundary: authenticated account email must match the invited email
- Rate limit: 20 non-rejected invitations per Host in 24 hours
- Audit actions: create, approve, reject and revoke

Applying `supabase/migrations/20260812150000_destination_aware_table_invitations.sql`
is required before the screens become live.

## Production acceptance

Use separate real inboxes and accounts for these checks:

1. Invite an active member and confirm a queued job becomes a delivered Resend email.
2. Invite a new address and confirm no email exists before Admin approval.
3. Approve it, process the queue and confirm the invitation opens the correct page.
4. Sign in with a different email and confirm the claim is refused.
5. Sign in with the invited email, submit membership, approve it and complete the
   profile; confirm the original destination resumes.
6. Repeat for an approval-only Community and confirm the Host request is still needed.
7. Repeat for an event and confirm no ticket or payment is created by the invitation.
8. Revoke an unused link and confirm it no longer previews or claims.
