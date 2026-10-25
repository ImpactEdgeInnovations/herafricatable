# Members’ club visual refinement

25 October 2026. Green/ivory direction retained; no black-and-gold rebrand.

## Delivered

- Shared warm ivory reading surfaces, charcoal/green text, quiet borders and restrained gold details. One readable interface font; editorial serif limited to public/event titles and date artwork. Existing accessible focus rings remain.
- Four stable mobile destinations: **Home, Events, Communities, People**. Messages stays in the header, alongside Search, Updates, profile avatar and sign out; all key touch targets are at least 44px. Desktop separates these main destinations from secondary Messages/More. Existing paths and role checks are unchanged.
- Home leads with the existing personalised next action, with one filled primary button. Community and person suggestions remain quieter secondary entries. No second welcome banner. The upcoming event uses the existing authorised poster endpoint when a published image is available, not a fictional member photograph. The honest no-poster fallback displays a real date, not a promotional slogan or an implication that the member has already booked.
- Event discovery retains equal poster regions and complete-poster behaviour, readable date/location metadata and existing pagination/filtering. Event detail navigation begins **Details, Programme, Community**, with conditional areas included only when relevant. Named Host/contact details, booking states and registration forms are retained. Programme entries use a restrained time marker; event headings use the editorial serif.
- Community identity remains compact. Four main content tabs: **Conversations, Meetups, Photos, People**. Community Home stays available separately; Host tools remain role-gated and separate. Photos also retains the existing videos area and an accessible “Photos and videos” label. Flat conversations and lighter replies reduce nested boxes. Community and People portraits are larger, with a matching grid-column adjustment so they do not overlap names. No uploaded or stock image is falsely shown as a real member.
- Host-selected accents remain on identity/tabs; essential primary actions remain deep green with readable disabled states. No arbitrary dark theme or unreadable button foregrounds are introduced.
- Networking has a prominent countdown strip before the session, an in-place Join flow, and a gentle radar only while a joined guest is waiting for a new introduction. An offered match transitions to the person card; mutual acceptance retains the real shared server timer. At the scheduled start, the strip says Waiting for the Host until the Host actually starts. No fake progress, scanning of other members’ portraits or automatic opt-in.
- Radar motion respects OS reduced-motion preferences and has its own Pause animation/Resume animation control. This control changes only CSS motion, not matching, attendance, countdowns or Host session state. There are no automatic sounds.

## What did not change

No SQL or environment change. No approval, payment, membership, matching, block, messaging, booking or Host permissions changed. The only additional Home reads use the same existing public-poster listing functions and authenticated image route used by Events. No real event was scheduled and no messages/invitations were sent during UI verification.

## Verification

- `npm test` includes `test:design-c` and the actual-component networking execution tests. The suite checks four mobile destinations, a single leading Home action, real destinations, absent/escaped data, role-gated Host tools, People/Connect paths, clock boundaries, compact countdown, explicit Join expansion, static Host-wait state, radar state, rejected-write/read recovery and motion pause without a database mutation.
- Full `npm test`, `npm run typecheck` and `npm run build` passed before push.
- Browser layout checks used **actual rendered components with clearly labelled example data**, not live member acceptance. Tested Home, People, Community navigation and networking strip/radar at 390px. No horizontal page overflow; People portrait right edge 105px vs text left edge 117px; Community tab strip retains its 350px available width instead of collapsing to zero. Desktop Home reviewed at the default viewport. Temporary viewport override reset afterward.
- Screenshots under ignored `tmp/`: `members-club-home-example.png`, `networking-strip-example.png`, `networking-radar-example.png`. These are visual fixtures, not real attendance or a running live networking session.

## Remaining acceptance

Independently sign in as ordinary member and Host on desktop and installed iOS/Android PWA. Verify the persistent navigation, real uploaded portraits/posters, keyboard/screen-reader focus, all Community tabs, booking/connection actions and the existing 10–20-person networking rehearsal. Static rendering and a passing build do not replace those L3 checks. The new styling preserves existing behaviour, but does not close unrelated Admin audit or payment launch gates.
