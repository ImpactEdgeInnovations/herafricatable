# Community creator finance operations

Creator finance is a reconciliation system, not an automatic wallet. A paid
community order first records the creator share as held. Provider fees, tax,
refunds, dispute holds, reserve movements and paid settlements are then written
as separate append-only statement entries.

## Provider events

The Paystack webhook verifies the raw request body with HMAC-SHA512 before any
financial action. It recognizes:

- `refund.pending`
- `refund.processing`
- `refund.needs-attention`
- `refund.failed`
- `refund.processed`
- `charge.dispute.create`
- `charge.dispute.remind`
- `charge.dispute.resolve`

Each event ID is processed once. Pending or processing refunds do not reduce
creator earnings. A failed refund closes without a debit. A processed refund
creates the proportional creator-share debit; only cumulative full refund
revokes paid community access.

A new dispute immediately holds the proportional creator share. A won dispute
releases that hold. A lost or accepted dispute keeps the hold as the final
creator impact. If a dispute becomes a processed refund, the dispute hold is
released and replaced by the refund entry so it is never counted twice.

## Manual reconciliation

Super Admin may record only these manual adjustments:

- provider fee;
- tax withheld;
- reserve hold; or
- reserve release up to the amount currently held.

Every adjustment requires the community order, amount in major currency units,
source, unique external reference and a review note. Statement entries cannot be
updated or deleted. Corrections require a new compensating entry.

## Refund and dispute cases

1. Open the original community order in **Admin → Programs → Creator
   reconciliation**.
2. Enter the customer-facing amount, provider case reference and evidence note.
3. For refunds, mark Processed only after Paystack or the manual rail confirms
   completion.
4. For disputes, record Won to release the hold or Lost to preserve the debit.
5. Never use a financial case to remove a community owner, host plan or unrelated
   member.

## Creator settlements

1. Verify the host payout profile and current host terms.
2. Reconcile provider fees, tax and all open refund/dispute cases.
3. Create a Draft settlement through the chosen period end.
4. Review the calculated creator balance and Approve the batch.
5. Complete the transfer outside the platform.
6. Mark Paid using the real provider settlement reference and payment note.

Draft and Approved states never send money. Before Paid, the database rechecks
that there are no open cases and that each statement balance still covers the
batch. If anything changed, cancel and rebuild it.

## Acceptance

- Replay every supported signed event and confirm no duplicate case or statement
  entry.
- Send an amount or currency mismatch and confirm processing stops.
- Exercise pending → processing → failed and verify no refund debit.
- Exercise pending → processed and verify one proportional refund debit.
- Exercise dispute create → remind → won and verify the hold returns once.
- Exercise dispute create → lost and verify the hold remains.
- Confirm a full refund revokes only the purchased community access.
- Confirm an owner can read the statement but cannot create adjustments, cases,
  batches or mark a settlement paid.
- Confirm a batch cannot be created with an open case or unverified payout
  profile.
- Confirm an approved batch cannot be paid after its underlying balance changes.
- Confirm no automatic transfer or Paystack split is initiated by this release.
