# Community host plan entitlements

Host-plan features are enforced in PostgreSQL and explained in the Host
workspace. Hiding a button is never the security boundary.

## Capability model

Every host retains the core tools needed to prepare and safely steward a room:

- admission review;
- member removal and role changes within the moderator limit;
- event and learning-resource programming;
- basic seven-day room health and safety signals.

Optional plan capabilities are:

- `paid_access` — paid offers, member checkout and creator finance;
- `advanced_analytics` — 30-day continuity, participation and
  privacy-thresholded outcome trends;
- `automations` — rate-limited gentle introduction reminders;
- `multiple_moderators` — more than the default one moderator, bounded by
  `max_moderators`.

Capabilities are active only while a matching host subscription is `active` or
`grace` and has not passed `ends_at`.

## Enforcement

`community_host_has_feature` is an internal database decision function.
Advanced insight RPCs and the reminder RPC call it before returning data or
writing a notification.

A trigger on `community_memberships` enforces the moderator limit during:

- a new active moderator insert;
- invitation acceptance;
- member promotion;
- any other role or status transition.

The trigger uses a transaction advisory lock to prevent two simultaneous
promotions from exceeding the limit. Without an active host plan, the safe
default is one moderator. Existing moderators are never deleted when a plan
changes or expires.

## Host experience

The Host workspace shows:

- the active plan and end date;
- included and upgrade-only tools;
- current moderator seats versus the plan limit;
- a clear upgrade state when advanced insights are unavailable.

Admin plan cards and host checkout cards show the same capability language so
the plan promise is consistent before and after purchase.

## Production acceptance

- Apply `20260801210000_community_host_plan_entitlements.sql`.
- Confirm a host without a plan can use core stewardship and one moderator.
- Confirm a second moderator is rejected at the database boundary.
- Assign Starter and verify its exact feature set in **Your host tools**.
- Attempt the advanced insight and reminder RPCs directly; unavailable
  capabilities must be rejected.
- Move to Pro and confirm insights, reminders and the larger moderator limit.
- Move the subscription through grace and expiry and confirm the capability
  state follows the subscription lifecycle.
- Confirm expiry never removes a member or moderator automatically.
