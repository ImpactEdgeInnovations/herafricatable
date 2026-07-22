# Learning operations

Learning is a controlled P1 module. The migration creates the catalog, protected
lesson delivery, progress tracking and shared commerce integration, but leaves the
`learning` feature flag disabled.

## Release sequence

1. Apply `supabase/migrations/20260725130000_learning_foundation.sql`.
2. In the Admin command center, create a draft course and at least one lesson.
3. Use assets no larger than 50 MB. Files are stored in the private `course-assets`
   bucket under the course UUID and delivered through one-hour signed URLs.
4. Test access using separate members for each configured path: free, qualifying
   event bundle, manual grant, manual purchase approval and verified Paystack purchase.
5. Verify that an unenrolled member cannot read lessons or sign an asset URL.
6. Confirm payment amount/currency mismatch, replay, reversal and refund procedures.
7. Publish the course, then enable Learning only after content and operational sign-off.

Disabling Learning blocks catalog, enrollment and progress operations without deleting
course content, orders, enrollments or progress. Super Admins retain operational access.

## Commerce boundary

Course purchases use the existing `orders`, `order_items`, `payment_attempts`,
`payment_events` and `entitlements` system. `orders.order_type` distinguishes event and
course fulfillment. The signed webhook or server-side verification remains the only
automatic proof of payment; browser callbacks cannot grant access.

Manual course approval uses the same course fulfillment operation as Paystack and grants
one enrollment plus one course entitlement. Manual grants are separate, require a reason,
and are audit logged.
