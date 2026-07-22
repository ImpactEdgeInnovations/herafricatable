# Asks & Offers operations

Asks & Offers gives active members a focused exchange for needs, skills,
introductions and opportunities between events. It is not an anonymous classifieds
board and must not be used to bypass event payments or expose confidential data.

## Deployment

Apply `supabase/migrations/20260724170000_marketplace_asks_offers.sql` after all
earlier migrations, then deploy the matching application commit. Until the migration
is applied, member and Admin pages display a migration-required state instead of
attempting unprotected writes.

## Policy boundaries

- Only active members can publish, discover, respond or report.
- Paused, suspended, dormant and deleted profiles are excluded from discovery.
- A block in either direction immediately removes mutual marketplace visibility.
- A private response is readable only by its responder and the post owner.
- Members may publish at most five posts and send twenty responses per 24 hours.
- Duplicate responses are prevented; declined or withdrawn responses may be revised.
- Post and response lifecycle changes create audit events.

## Moderation

Moderators work from **Admin → Marketplace**. Each report contains the post snapshot
captured when the member submitted it. Moderators do not receive general marketplace
table access.

- **Start review** assigns the report without changing public visibility.
- **Hide post** removes it from member discovery and records the reason.
- **Dismiss** closes an unsupported report and records the reason.

Never copy report details or post bodies into external chat. Preserve the report,
decision, reviewer and audit event for the retention period defined by legal review.

## Launch acceptance

Use two active member accounts, one moderator and one unrelated event-staff account.
Confirm creation, filtering, private response, acceptance, closing, blocking, reporting,
moderator hiding and event-staff denial. Verify in-app notification links without using
real confidential or commercial information in the test content.
