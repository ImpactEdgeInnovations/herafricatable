# Partner Perks Operations

Partner benefits are controlled inventory, not promotional content. The module ships
behind the disabled `partner_perks` flag and must remain disabled until partner terms,
support ownership and redemption reconciliation pass acceptance.

## Controls

- Only active members can reserve a published, in-window benefit.
- The perk row is locked while inventory and per-member limits are checked, preventing
  oversubscription under concurrent requests.
- Redemption codes are random, single-use and visible only to their member and Super
  Admin operations.
- Reservations expire after the configured hold period or at the offer end—whichever
  comes first. Expired holds release inventory.
- Redemption and cancellation are explicit, audited admin actions. Partner staff do
  not receive platform access in this release.
- Test identities remain visibly tagged in the admin ledger.

## Acceptance sequence

1. Apply `20260726130000_partner_perks_redemption.sql`.
2. Create an active test partner and a published benefit with inventory `1`.
3. Keep the public feature flag disabled until operational fields and terms are
   reviewed; then enable it for a controlled test window.
4. Reserve from one tagged test member. Confirm another member cannot read the code or
   reserve the exhausted inventory.
5. Mark the code redeemed and confirm it cannot be reused.
6. Create a short reservation, run expiry reconciliation, and confirm inventory is
   released without exposing the former code.
7. Verify support ownership, partner confirmation procedure and reconciliation cadence
   before launching a real benefit.

Run `expire_perk_redemptions()` on a daily trusted schedule or from the Super Admin
console. Never share redemption exports over an unapproved channel.
