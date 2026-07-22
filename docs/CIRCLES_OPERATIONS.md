# Circles Operations

Circles are small, time-bound cohorts created from an explicit member opt-in. The
module ships behind the disabled `circles` feature flag and must not be enabled until
matching, privacy and facilitation acceptance pass.

## Matching model

The first release is deliberately deterministic—not AI. `deterministic_v1` orders
eligible members by city, primary goal, industry and a stable per-cycle seed, then
balances them across the configured group size. Every assignment stores the method
and contributing profile fields in `match_explanation` for administrator review.

The matcher:

- includes only active, visible members who explicitly opted into that cycle;
- excludes tagged test accounts unless the cycle deliberately enables them;
- uses a transaction lock on the cycle and replaces draft results idempotently;
- aborts before publication if a blocked pair would share a Circle;
- never notifies members until a Super Admin publishes the reviewed result.

## Acceptance sequence

1. Apply `20260726090000_circles_deterministic_matching.sql`.
2. Keep the feature flag disabled and create a draft acceptance cycle with test
   identities enabled.
3. Enable the flag briefly for controlled accounts, open the cycle and opt in at least
   the configured group size.
4. Run matching and inspect every assignment in Admin → Circles.
5. Confirm unrelated members cannot read a Circle, prompts or responses; confirm a
   blocked pair causes matching to abort.
6. Publish the reviewed cycle, verify member notifications, publish one prompt and
   verify response ownership and update behavior.
7. Complete mobile, keyboard and moderator/support escalation acceptance before
   opening the first real cycle.

Changing matching rules requires a new version name and migration. Never silently
change the interpretation of an existing `match_explanation` record.
