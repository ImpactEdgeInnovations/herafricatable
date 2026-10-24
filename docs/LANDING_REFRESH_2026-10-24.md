# Green landing-page refresh — 24 October 2026

## Delivered

- Centred introduction inspired by the spacious composition at https://luma.com/, with Her Africa Table's own green palette, content and artwork.
- Four gently floating interest cards on desktop; three smaller cards below the message on phones. The cards are illustrations, not advertised events or member endorsements.
- Pause/play control for continuous movement. The operating system's reduced-motion preference disables the animation and hides the unnecessary control.
- One primary invitation to join, with a quieter Events link. Existing member sign-in remains visible.
- Real upcoming public events, complete-poster display, Community/member entry points, policy-aware registration guidance, install control and compact policy footer retained.
- No database, permission, membership policy, payment or notification changes. No new package or external image request.

## Verification

### Level 1 — Code and automated checks

Landing regression renders both automatic and reviewed registration modes; verifies public-only event filtering, draft/private exclusion, image fallback, three-event limit, honest error/empty states, stable event time zones, real destinations, a single H1, decorative cards and the pause/play state transition. Full repository tests, type checking and production build are run for this release.

### Level 2 — Integration

The actual local Next.js route loaded the existing public event projection, including the Launch, Food & Tech and December Dubai Trip entries. Both published posters and the local illustrative photograph loaded. The data loader and public-page SEO metadata were not changed.

### Level 3 — Browser confirmation

- Inspected desktop, 900 px tablet and 390 px phone layouts.
- Confirmed the phone document width matches its viewport: no horizontal overflow.
- Paused all four animations with the visible control and verified their computed play states changed to paused.
- Followed “Find your Table” to `/sign-in?mode=apply` and confirmed the account-creation form appeared. No account, OTP email or membership was created for this visual check.
- Reloaded the homepage and confirmed the real event content and images still appeared.

This is acceptance of the landing-page refresh, not a claim that every platform workflow has been re-tested. Reduced-motion handling is covered by the stylesheet contract; an OS preference change was not performed during browser QA.

## Lower-page refinement

The header, hero content and floating-card layout are retained. Below them:

- Event cards have a separate date tile, clearly grouped time/location and consistent complete-poster areas. On phones the cards form a horizontally scrollable, snap-aligned row, with a visible swipe hint, a scrollbar and a keyboard-focusable region.
- A new Community introduction explains Conversations, Meetups and People without inventing member counts, public profiles or Community activity. These feature descriptions are not imitation buttons; the real “Explore Communities” link remains the action.
- A compact member-discovery strip links to the existing network. Registration becomes a two-column introduction and three-step list on desktop, stacked on phones. The automatic/reviewed intake conditions are unchanged.
- Footer policy links receive larger touch areas without adding another large section.

Local browser checks at 390 px confirmed the event row moved from scroll position 2 to 337 when swiped, revealing the next real event; document width remained 390 px. Community feature labels were checked for readable light-on-green text. Public event data, private/reviewed registration copy and empty/error states remain covered by the landing regression.
