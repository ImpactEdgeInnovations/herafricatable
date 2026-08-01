# Table Journey and Community Welcome Operations

The Table Journey helps a member move from sign-in to one useful, continued
relationship. It is private guidance. It is not a compliance score, engagement
quota, leaderboard or input to membership approval.

## Production migration

Run `supabase/migrations/20260803130000_table_journey_and_host_welcome.sql` in
the production Supabase SQL editor after all earlier migrations.

The migration adds:

- `get_my_table_journey()` — the signed-in member's own five journey signals;
- `community_member_welcomes` — one idempotent welcome record per Community
  member;
- `list_community_welcome_queue()` — a Host-only, Community-scoped list of
  recent members; and
- `send_community_member_welcome()` — an audited, rate-limited welcome that
  respects the member's notification preferences.

If the migration has not been applied, Member Home falls back to the earlier
activation journey and the Host welcome panel remains hidden. Existing member
and Community access continues to work.

## Member acceptance

Use an active member account and verify:

1. Home shows “Your Table Journey” with five plain-language steps.
2. Only the member's own completion signals appear.
3. Completing a profile, Community introduction, event reservation, accepted
   connection and private relationship follow-up updates the journey.
4. The recommended action always links to the relevant member area.
5. Completion does not create a public badge, member score or activity quota.

## Host acceptance

Use a Community owner or moderator account and verify:

1. **Manage Community → Welcome** lists active ordinary members who joined in
   the last 30 days.
2. A Host cannot list members of a Community she does not manage.
3. The list shows only name, professional context, join date, Community
   introduction/contribution signals and welcome status.
4. “Send welcome” asks for confirmation, records one welcome and delivers one
   deduplicated notification.
5. Repeating the RPC does not send a duplicate notification.
6. A Host cannot welcome herself, a removed member or a member from another
   Community.
7. More than 20 welcome actions in one hour is rejected.

## Privacy boundary

Hosts never receive member email, phone, social links, private messages,
connection notes, cross-Community activity or the contents of any private
follow-up. The Host queue is available only through security-definer functions;
the backing table grants no direct member access.

## Rollback

The application is fail-soft: if the functions are unavailable, the earlier
member activation card remains available and the Host panel is hidden. To pause
all Community access without changing data, disable the `communities` feature in
Admin → Release.
