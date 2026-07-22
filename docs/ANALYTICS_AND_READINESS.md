# Analytics and Launch Readiness

Her Africa Table analytics are server-recorded and purpose-limited. The system measures
whether core journeys work; it does not build behavioral advertising profiles.

## Data boundaries

`product_events` may contain only an approved event name, actor identifier, coarse subject
type, a small allow-listed metadata object, test-account classification and
timestamp. It must never contain:

- message, support, report, post or prompt content;
- email addresses, phone numbers or private profile fields;
- OTPs, passwords, payment credentials or provider secrets;
- searches, IP addresses, user agents, raw URLs or browsing history.
- source-record identifiers or payment amounts.

Collection occurs in database triggers after successful product state changes. Client
page views are intentionally excluded from the launch release. Row Level Security and
admin-only aggregate functions prevent member or event-staff access.

## Readiness scorecard

The Super Admin scorecard combines direct source-of-truth counts with 30-day product
events. Tagged test accounts are excluded from real-member totals and shown separately.
Targets are operational thresholds, not vanity goals, and every target change is
audited.

Before go-live:

1. Apply `20260726170000_privacy_safe_analytics.sql`.
2. Confirm members, event staff and moderators cannot read events or readiness RPCs.
3. Exercise one tagged test journey and confirm it appears only in the test count.
4. Exercise one real acceptance journey and confirm no content or direct identifiers
   enter event metadata.
5. Review every readiness target with the product and operations owners.
6. Treat a green scorecard as evidence, not automatic authorization: legal, security,
   operations and product sign-offs remain separate go/no-go requirements.

Retention for `product_events` must be approved before launch. Until then, do not
export or share row-level event data.
