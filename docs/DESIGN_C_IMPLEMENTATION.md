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

Production deployment and signed-in visual checks are recorded after the release is pushed. No new database acceptance, financial transaction, notification send or physical-device installation is claimed by this visual release.
