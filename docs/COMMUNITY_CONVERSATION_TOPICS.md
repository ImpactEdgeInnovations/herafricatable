# Conversation topics — 20 October 2026

Members choose an existing topic when starting a conversation. The topic being browsed is preselected for a new post; unfinished text and explicit topic choices are not silently changed. Published topic labels are clickable filters. Conversations retain their own replies.

Host tools → Settings → Choose your conversation topics lets an owner or moderator enable the supported member topics. At least one must remain. Turning a topic off prevents new top-level conversations, but does not remove old posts or close their replies. Start here and Announcements remain Host-only. This release controls the existing topics; it does not add arbitrary custom topic names.

Topic labels are semi-bold and opening posts are larger than reply text. Reply author names no longer visually overpower the opening post. Reply lists remain scrollable and now support keyboard focus.

## Database

Applied to the live HerAfricaTable project:

- `20261020085640_community_conversation_topics.sql`
- `20261020090339_community_topic_reply_guard.sql`

Configuration is private with RLS and no direct member table grants. The read RPC requires active Community membership. Saving requires an active Host/moderator role (or existing Super Admin authority). The insert guard enforces topic choices for older clients as well. No settings change is seeded, so all existing member topics remain enabled until a Host saves a choice.

## Verification

- L1: actual feed rendering and Host-save handlers test chosen defaults, protected drafts, allowed options, read-only/failure states, publish badges, keyboard-focusable reply regions, and successful/failed/malformed saves.
- L2: `supabase/tests/community_conversation_topics_acceptance.sql` passed against tagged test accounts in a transaction rolled back afterwards. It verifies save/read persistence within the transaction, canonical choices, member-write denial, closed-topic rejection, allowed posts, preserved posts and replies, nonmember denial and private grants. No emails or permanent test posts/settings remain.
- Security advisors were reviewed. The private table intentionally has no client policy; the two authenticated definer RPCs have explicit membership/Host checks, fixed search paths and no anonymous grants. Existing platform-wide advisor categories remain separate work, including leaked-password protection and older executable definer functions.
- Browser acceptance checks the composer and Host settings after deployment without changing real Community settings or publishing a test conversation to real members.
