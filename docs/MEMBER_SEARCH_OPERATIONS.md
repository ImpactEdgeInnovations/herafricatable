# Member-wide Search Operations

Member-wide search gives an active member one place to find people, her joined
Communities and conversations, published events, and released learning.

Run `supabase/migrations/20260804010000_member_global_search.sql` after all
earlier migrations. Until applied, `/search` shows a setup message and all
existing member destinations continue working.

## Privacy boundaries

- Member results use active, visible professional profile fields only.
- Email, phone, social links, private notes, messages and payment information
  are never searched or returned.
- Community results include only Communities the searching member has joined.
- Community post results require active membership in that exact Community.
- Bilateral blocks and paused profile visibility are enforced.
- Events and learning must already be published through their release controls.
- Search is available only to active platform members.

## Acceptance

1. Search a member name, profession, company and country.
2. Pause that profile and confirm it disappears.
3. Block the member from either side and confirm member and authored Community
   conversation results disappear.
4. Search a phrase inside a joined Community post, then leave/remove the member
   from that Community and confirm the post disappears.
5. Confirm a Draft Community, unpublished event and Draft course never appear.
6. Confirm results deep-link to the exact permitted destination.
7. Search with one character, over 80 characters and a broad wildcard; confirm
   validation and the 40-result ceiling.
