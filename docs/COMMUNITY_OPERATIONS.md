# Community operations

Communities are a controlled P1 module. Applying the migration does **not** expose
them to members: the `communities` feature flag starts disabled.

## Release sequence

1. Apply `supabase/migrations/20260725090000_communities_foundation.sql`.
2. Apply `supabase/migrations/20260730230000_community_hub_foundation.sql` to
   enable the privacy-safe member roster inside each room.
3. Apply
   `supabase/migrations/20260731010000_structured_community_conversations.sql`
   to enable conversation categories, comments, appreciation, private saves,
   thread following and host pinning.
4. Apply
   `supabase/migrations/20260731050000_community_programming_and_host_health.sql`
   to add host-curated Gatherings and Resources plus privacy-safe Host health
   signals.
5. Apply
   `supabase/migrations/20260731100000_community_notification_preferences_and_briefings.sql`
   to add per-room delivery choices and the aggregate weekly briefing.
6. Apply
   `supabase/migrations/20260731130000_community_continuity_and_outcome_signals.sql`
   to add the privacy-thresholded Host continuity view and gentle introduction
   follow-ups.
7. Open the Admin command center and create at least one draft community.
8. Transfer ownership to the named host, assign a backup moderator, then test request, invitation, removal,
   posting, reporting, and blocking boundaries with non-production accounts.
9. Publish the approved community.
10. From the community room, the owner or moderator opens **Host** and links only
   the published events and learning resources relevant to that room.
11. A Super Admin may select **Enable after sign-off** only when moderation coverage
   and the support escalation owner are confirmed.

Disabling the flag immediately removes member navigation and blocks feed/list/write
operations at the database layer. It does not delete memberships, posts, or reports.

## Privacy and moderation

- Official communities permit active members to join immediately; private communities
  require host approval or a targeted invitation.
- General platform moderators cannot browse private community feeds. A report captures
  an immutable evidence snapshot for either a post or comment, and the report
  queue operation records access.
- Community owners and moderators can manage membership, but the owner cannot be
  demoted or removed through the routine membership operation.
- Bilateral member blocks are honored in feed projections.
- Removing a post or comment replaces its body and preserves the audit event.
  Moderation hiding preserves the report evidence for investigation.
- Saved posts are private to the member. Hosts and analytics cannot read an
  individual's saved list.
- Following a conversation is voluntary. Creating a comment follows that
  conversation until the member turns notifications off.
- Host health is aggregate-only. It excludes tagged test accounts and never reads
  private saved conversations or exposes conversation bodies.
- A safety count tells a host that escalation exists, but report evidence remains
  in the permission-gated platform moderation workflow.
- Room reply and weekly briefing emails default off. Members can independently
  choose Activity replies, reply email, weekly briefing and weekly briefing email
  for each room.
- Weekly briefings contain counts only. They exclude test accounts, respect
  bilateral blocks, never include post bodies or member names, and are not queued
  when there was no new room activity and no gathering is imminent.
- The continuity view counts a member as participating when she posts, replies,
  appreciates a contribution, or updates her published introduction in the last
  30 days. It does not assign individual engagement scores.
- The 30-day continuity rate is hidden until at least five established members
  have been in the room for 30 days. It never produces a ranked list of members
  who have not participated.
- Outcome categories count only accepted connections where both people are active
  real members of the room. A category appears only after at least three different
  members choose anonymous sharing; names and private outcome details are never
  projected.
- Hosts may see the names of members missing the objective room-introduction step.
  A gentle reminder can be recorded once per seven days, uses in-app delivery
  only, and respects the member's global Activity preference.

## Host operating rhythm

The Host workspace is deliberately narrow:

1. Review admission requests and outstanding invitations.
2. Notice unanswered Asks and help the right members respond without exposing
   private contact details.
3. Escalate open safety signals through the platform moderation owner.
4. Link a small number of relevant Gatherings and Resources; use **Host pick**
   only for the clearest current priority.
5. Review seven-day conversation and reply signals as context, never as a member
   performance score.
6. Review the continuity panel monthly. Help members complete introductions, read
   aggregate return signals as room-design feedback, and never pursue an individual
   because she has not posted.
7. Treat anonymous outcome trends as evidence of collective value, not a quota.
   Categories below the three-sharer threshold must remain private.

Before enabling a third-party hosted or paid community, separately approve host
offboarding/export, billing, analytics, content ownership, and data-retention terms.
