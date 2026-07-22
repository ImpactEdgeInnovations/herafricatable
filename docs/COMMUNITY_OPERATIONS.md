# Community operations

Communities are a controlled P1 module. Applying the migration does **not** expose
them to members: the `communities` feature flag starts disabled.

## Release sequence

1. Apply `supabase/migrations/20260725090000_communities_foundation.sql`.
2. Open the Admin command center and create at least one draft community.
3. Transfer ownership to the named host, assign a backup moderator, then test request, invitation, removal,
   posting, reporting, and blocking boundaries with non-production accounts.
4. Publish the approved community.
5. A Super Admin may select **Enable after sign-off** only when moderation coverage
   and the support escalation owner are confirmed.

Disabling the flag immediately removes member navigation and blocks feed/list/write
operations at the database layer. It does not delete memberships, posts, or reports.

## Privacy and moderation

- Official communities permit active members to join immediately; private communities
  require host approval or a targeted invitation.
- General platform moderators cannot browse private community feeds. A report captures
  an immutable evidence snapshot and the report queue operation records access.
- Community owners and moderators can manage membership, but the owner cannot be
  demoted or removed through the routine membership operation.
- Bilateral member blocks are honored in feed projections.
- Removing a post replaces its body and preserves the audit event. Moderation hiding
  preserves the report evidence for investigation.

Before enabling a third-party hosted or paid community, separately approve host
offboarding/export, billing, analytics, content ownership, and data-retention terms.
