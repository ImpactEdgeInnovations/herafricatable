# Approved green design — 20 October 2026

The owner approved C from the separate 19 October review package and authorised stock photography. The working application keeps its existing routes, permissions, data and service integrations.

| Area | Implementation | Verification |
| --- | --- | --- |
| Shared foundation | Forest green, white/stone surfaces, readable sans-serif, clear focus and control states | Implemented; local visual checks |
| Member navigation | Desktop rail, mobile bottom bar, account/notifications/sign out retained | Actual-component render + desktop/mobile fixture |
| Public homepage | Local stock photography, live event preview, Community introduction and policy-aware joining | Real public-data page inspected locally |
| Member home | Community-first suggestions, three-entry hierarchy, actual upcoming event | Actual-component render + desktop/mobile fixture |
| Events | Aligned poster cards, discovery, detail/booking and Host presentation | Public listing/detail inspected; search and reset exercised |
| Communities | Compact identity, visible local tabs, conversation previews with author/date and owner accent support | Existing room contracts + safe preview render |
| Entry / secondary screens | Shared brand, simpler entry copy and consistent controls | Shared styles; existing flow checks |
| PWA identity | Green SVG/install icons, manifest and public cache refresh | Icon generation and PWA contracts |

Review the implementation against real long titles, missing images, empty/error states and both member/Host views. No mockup names, posts, prices, testimonials or member counts should be copied as real data. Code verification is distinct from database integration and end-to-end acceptance.

No SQL migration is expected for this visual release. Host-selected Community and event colours are retained inside their spaces.

## Verification record

- `npm test`: passed, including the existing booking, membership, pilot, invitation, safety, Admin and permission checks.
- `npm run test:design-c`: passed. Renders the actual member components with an isolated read-only fixture; checks navigation destinations, Community-first suggestions, event absence and escaped titles.
- `npm run test:member-readability` and `npm run test:community-room-ui`: passed.
- `npm run build` and TypeScript: passed; final release build repeated after the final mobile styling correction.
- Local browser: public homepage and real event data, three aligned event cards, search reducing three results to one and reset restoring all three, mobile listing/detail and no horizontal page overflow. Lazy images outside the viewport are not treated as missing images.
- Real component visual fixture: member home and navigation at desktop and 390px mobile; this is not database or logged-in acceptance.
- Release-specific corrections: removed an old global input-corner override, kept the mobile event action above member navigation, and refreshed the public PWA cache for the green icons.

## Deployed release

- Implementation commit: `4c981f40e8f7b0f7ae7469eb02688227c623b128`, pushed to `main`; Vercel reported success on 20 October 2026.
- Live homepage: green theme and locally hosted 1600px stock image loaded successfully, with no horizontal overflow at desktop width.
- Signed-in live home: real member name, Community, unread updates and upcoming event rendered with the desktop navigation rail.
- Signed-in Community: real cover/icon loaded, Host attribution and all local tabs remained available; desktop and 390px phone layout checked without horizontal page overflow. The owner's existing burgundy accent was preserved.
- Live mobile Events: search reduced three events to one; clearing restored all three. Inputs use the new 8px corners and the mobile navigation remains visible.
- Live event detail: published poster loaded, the existing creator was correctly shown Host tools rather than a duplicate booking action, and the 390px page had no horizontal overflow.

These checks used the existing signed-in member/Host session and read-only discovery actions. No new database acceptance, financial transaction, notification send, Super Admin session acceptance or physical-device installation is claimed by this visual release.
