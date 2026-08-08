# Community operations

Communities are a controlled P1 module. Applying the migration does **not** expose
them to members: the `communities` feature flag starts disabled.

## Controlled test rehearsal

Apply `supabase/migrations/20260805010000_community_acceptance_mode.sql`, then
open **Admin → Programmes → Communities** and select **Start test rehearsal**.
This does not enable Communities for real members. It extends the database access
boundary only to active profiles explicitly tagged as test accounts, allowing the
two-member, host and backup-moderator cohort to complete release acceptance before
the public feature flag can be enabled.

End rehearsal after each acceptance session. Memberships, test posts and audit
evidence remain preserved, while tagged test accounts immediately lose room access.
Never remove the test-account tag to increase product-readiness totals.

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
7. Apply
   `supabase/migrations/20260731160000_community_member_start_path.sql`
   to add the private, member-scoped recommended start path inside each room.
8. Apply
   `supabase/migrations/20260731190000_community_release_acceptance.sql`
   to add database-enforced community publication acceptance.
9. Open the Admin command center and create at least one draft community.
10. Transfer ownership to the named host, assign a backup moderator, then test request, invitation, removal,
   posting, reporting, and blocking boundaries with non-production accounts.
11. Record all eight checks in **Admin → Founding cohort → Nairobi release
    acceptance**.
12. Publish the approved community from that acceptance panel.
13. From the community room, the owner or moderator opens **Host** and links only
   the published events and learning resources relevant to that room.
14. A Super Admin may select **Enable after sign-off** only when moderation coverage
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
- The member start path reads only the signed-in member's own introduction,
  contribution, accepted connection and confirmed upcoming gathering state. It
  exposes no comparison, score, streak or other member's private activity.

## Member room rhythm

The first screen recommends one useful next action instead of presenting a dense
feature menu:

1. Add a guided introduction when the room has an active hosted cohort.
2. Share one focused Ask, Offer, resource or thoughtful reply.
3. Build one mutually accepted relationship with another active room member.
4. Consider the next host-selected gathering when one is available.

These are orientation cues, not participation requirements. When the path is
established, the room explicitly says there is no activity quota. Members may
return only when they have useful context, a clear ask or a relationship to nurture.

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

## Nairobi publication acceptance

Community publication and global member availability are separate controls:

- Preparing the founding room creates or updates a controlled cohort. It no
  longer enables Communities or publishes a new room automatically.
- New communities must begin as Draft. Direct publication is rejected by the
  database until all eight checks pass.
- Publication requires exactly one active owner and at least one active backup
  moderator.
- Enabling the global Communities feature is rejected when any published
  community has incomplete acceptance.
- Applying the release-acceptance migration fails closed: if Communities is
  already enabled while a published room has incomplete checks, global member
  access is returned to controlled/off and the change is recorded in the audit
  log.
- A Super Admin may return a published community to Draft without deleting its
  memberships, conversations or audit history.

The eight checks cover host coverage, consent/admission, conversations and
blocking, safety escalation, member notification choices, privacy thresholds,
non-technical usability and the Host operating rehearsal. Evidence notes must
describe outcomes only—never credentials, OTPs, private member content or secret
configuration.

Before enabling a third-party hosted or paid community, separately approve host
offboarding/export, billing, analytics, content ownership, and data-retention terms.

## Member departure and rejoining

- A member may decline an invitation, cancel a pending request or leave an active
  Community without contacting support.
- Leaving immediately removes room access and stops Community briefings and event
  reminders. It does not delete prior contributions or create an automatic refund.
- A departed member may ask to rejoin. An unexpired paid access period is honoured
  and must not create a second charge; a private Community still requires host approval.
- Owners and moderators must hand over their role before leaving so a room cannot
  silently lose accountable stewardship.

## Host continuity and offboarding

The Super Admin lifecycle control is the safety boundary for an unavailable host:

1. **Pause** returns the Community to Draft, stops ordinary member access and
   suspends the owner while preserving the backup moderator's transition access.
2. **Replace host** appoints an existing reviewed member or moderator and removes
   the previous owner's host controls without moving or deleting content.
3. **Reopen** restores preserved memberships only when release acceptance, an
   active owner and an active backup moderator all pass.
4. **Close and preserve** archives the room and suspends activity while retaining
   content, financial records, membership history and audit evidence.

Every transition requires a reason, informs affected members, and creates both a
dedicated lifecycle record and a platform audit event.

## Scale-test identities

Use two ordinary members, one host candidate and one backup moderator with reserved
`.invalid` addresses. Create them from Admin → Programmes → Membership operations,
or run `npm run ops:provision-community-test-cohort` when the ignored local test
environment and server key are available. Every identity must remain tagged as a test
account so activity is separated from live member analytics.
