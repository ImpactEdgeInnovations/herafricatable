# Community Creator Commerce

## Product task

Allow an approved Her Africa Table member to host a trusted community, choose a
platform-approved host plan, offer free or paid access, and earn from the value
she creates without weakening admission, moderation, payment, or payout
boundaries.

This is inspired by the simplicity of creator-community products, but it is
deliberately adapted to Her Africa Table: belonging is approved before payment,
hosts are reviewed, and financial settlement is not automatic until the
operating controls have passed acceptance.

## First production slice

- Super Admin maintains a Starter/Pro-style host-plan catalogue with price,
  duration, platform fee, moderator limit, and feature entitlements.
- Super Admin grants a published plan only to a community with an active owner.
- The owner accepts a versioned host agreement and configures one free or paid
  member offer.
- A paid offer cannot be published until the community, host plan, payout
  profile, host agreement, and creator-commerce feature flag are ready.
- A member is admitted first. Paid admission becomes
  `approved_pending_payment`; no payment can bypass host approval.
- Automatic mode initializes Paystack on the server. Manual mode records a
  reference and note for Super Admin review. Closed mode preserves the member's
  approval without accepting money.
- Verified automatic payment or audited manual approval grants one access
  period and one entitlement.
- The platform fee and host share are written to an immutable order-linked
  revenue ledger. The host share starts as `held`.
- Hosts see plan, readiness, paying members, gross collection, and held earnings.
- Super Admin sees plan assignment, payout readiness, and manual payment queues.
- An already approved community owner can select a published paid host plan when
  self-service billing is deliberately enabled.
- Host-plan billing has its own Automatic, Manual review, or Closed platform
  control; it does not share or silently enable member checkout.
- Verified Paystack payment or audited manual approval activates the host plan
  and a `community_host_tools` entitlement exactly once.
- Reversal revokes the purchased host tools and pauses any published paid offer
  for that community.
- An active owner can renew the current plan or select a next-term plan change;
  verified payment creates one scheduled period and never shortens the current
  paid term.
- Scheduled reconciliation promotes due renewals, queues seven-day reminders,
  applies the configured grace period and pauses paid offers after final expiry.

## Safety and money boundaries

1. The browser never marks an order paid or grants access.
2. Paystack callback and signed webhook events converge on the same idempotent
   processing function.
3. Prices are stored in integer minor units.
4. Manual review uses the same fulfillment function as automatic payment.
5. Payout identity stores only a provider reference, never bank-account details.
6. `held` revenue is not a promise that money is available for withdrawal.
7. Refund, dispute, provider-fee, tax, and settlement reconciliation must be
   completed before automatic host payouts are released.
8. Disabling the creator-commerce flag or setting an offer to Closed prevents new
   checkout without removing existing community approvals or entitlements.
9. Renewal is host-initiated and one period at a time. The platform does not
   create an automatic recurring debit without separate provider authority and
   explicit host consent.
10. Grace preserves host access temporarily but blocks new paid member checkout;
    final expiry pauses the paid offer without removing existing community
    memberships.

## Operating sequence

1. Create and publish the host-plan catalogue.
2. Confirm an active owner, moderation coverage, community purpose, and member
   promise.
3. Grant the host plan with an approval note, or enable approved-owner
   self-service billing after payment acceptance passes.
4. Host accepts the current agreement.
5. Verify the provider subaccount/reference and record the review.
6. Host saves the offer as Draft.
7. Test admission → payment → entitlement using a tagged test member.
8. Enable the feature flag, publish the offer, and monitor the first transactions.
9. Reconcile provider settlement before changing any ledger entry from Held.

## Next slices

- [x] Approved-owner self-service plan selection and platform-plan checkout
- [x] Host-initiated renewal, next-term plan change and renewal/grace
  reconciliation
- [ ] Provider-authorized automatic recurring billing with explicit host consent
- [ ] Paystack split/subaccount settlement after merchant and country acceptance
- [x] Provider-fee, tax, refund, chargeback, and reserve allocation
- [x] Audited payout batches and host-readable settlement statements
- [ ] Downloadable tax invoices and statement exports after legal format review
- [ ] Plan-entitlement enforcement for analytics, automations, and moderator limits
- [ ] Creator acquisition, conversion, retention, and cohort analytics
- [ ] Host application, review, suspension, offboarding, and member-migration flows

## Production acceptance

- Apply `20260801010000_community_creator_commerce.sql`.
- Apply `20260801050000_community_host_self_service_billing.sql`.
- Apply `20260801090000_community_host_subscription_lifecycle.sql`.
- Apply `20260801130000_community_financial_reconciliation.sql`.
- Keep `community_creator_commerce` disabled until all checks pass.
- Test free, Automatic, Manual review, Closed, failed, duplicate, reversed, and
  expired-host-plan paths.
- Confirm unrelated active members cannot manage offers or read host earnings.
- Confirm hosts cannot verify their own payout profile or settle ledger entries.
- Confirm a member cannot create a paid order before host approval.
- Confirm duplicate provider events cannot issue duplicate access or revenue.
- Confirm host-plan payment cannot create or transfer community ownership.
- Confirm disabling host billing prevents new orders without removing an active
  plan or community.
- Confirm duplicate renewal attempts cannot create overlapping scheduled plans.
- Confirm current-plan renewal and next-term plan change preserve the active
  period, promote once, and issue host tools once.
- Confirm grace blocks new paid orders, final expiry pauses the paid offer, and
  a reversed scheduled plan leaves the current plan unchanged.
- Confirm signed refund and dispute events are idempotent, amount/currency
  matched and represented as append-only statement entries.
- Confirm payout batches require verified payout identity, no open cases and a
  positive reconciled balance; Draft and Approved never send money.
- Complete legal review of host terms, refunds, tax, payout, and platform-fee
  disclosures before public monetization.
