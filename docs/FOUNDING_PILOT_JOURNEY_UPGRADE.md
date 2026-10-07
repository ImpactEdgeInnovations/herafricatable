# Founding pilot journey upgrade — 7 October 2026

## Completed

- [x] Repair event invitation RPCs using `canonical_event_id`.
- [x] Exclude tagged test accounts from member discovery and recommendations.
- [x] Open the first free Community automatically for eligible founding members.
- [x] Preserve open / Host approval / invitation-only joining choices.
- [x] Let an invited member join an invitation-only Community securely.
- [x] Let eligible pilot Hosts publish event content, programme and images without Admin review.
- [x] Queue invitations to new emails automatically for eligible pilot destinations.
- [x] Add immediate, sender-authorised delivery through the existing Resend worker.
- [x] Bring membership, event and Community pilot controls into Admin → Members.
- [x] Retain global pause, individual suspension and audit records.
- [x] Make Host sections switch in place and member browsing open by default.
- [x] Reduce member Home and Community introductory spacing.
- [x] Distinguish failed event loading from a genuinely missing event.
- [x] Replace contradictory review wording in the main pilot journeys.
- [x] Make instant booking labels respect pilot expiry.
- [x] Exclude rehearsal accounts from the 20 real-member allocation count.

## Live database verification (all test writes rolled back)

| Test | Result |
|---|---|
| Founding member creates open Community | Published, open joining, public preview enabled |
| Founding member creates invitation-only Community | Published, public preview disabled |
| Invited active member joins invitation-only Community | Active membership |
| Host publishes event summary/programme | Approved workspace, live summary and programme |
| Host invites a new email | Sent invitation state, recipient-specific email job queued |
| Host lists event invitations | Query succeeds; obsolete-column failure removed |
| Admin pauses event/Community creator switches | Both eligibility checks become false |

Queued is not the same as delivered. The interface confirms “emailed” only when the provider worker reports a send. A real inbox receipt, OTP round trip, mobile visual acceptance and full capacity/cancellation rehearsal remain operational acceptance checks—not claims of completion from source-code tests.

## Migration order

The four CLI-created migration files were ordered after the existing 09:00 joining-policy migration so clean installations retain the final policies:

1. `20261007100000_module_journey_audit_fixes.sql`
2. `20261007100100_founding_pilot_self_service.sql`
3. `20261007100200_pilot_invitation_and_publication_completion.sql`
4. `20261007100300_pilot_control_consistency.sql`

All four were applied through the connected Supabase migration tool to project `gtzwqromwvzqytygebfc`. Do not rerun them manually; they include function renames. Existing user-edited historical migrations were preserved.

## Deliberate boundaries

The open membership pilot is timed; the real first-20 cohort receives creator privileges. Each eligible member gets one automatic free Community and the existing free-event limits. Paid creator commerce does not bypass approval. Turning off automatic creator controls stops new automatic openings, updates and pilot invitations; it does not silently cancel existing memberships or bookings. Use individual suspension for an existing member, event or Community.

## Remaining acceptance

### Next: clearer member UI and gathering media

These are planned tasks, not shipped features. Keep existing permissions and pilot controls intact.

#### Phase 1 progress — Community room foundation

- [x] Add room-scoped styling: compact identity header, readable conversation text, restrained headings, less decorative weight and clearer keyboard focus.
- [x] Align existing local tab wording to Home, Conversations, Gatherings and People; keep Host tools role-gated and separate.
- [x] Contain mobile tab scrolling and keep the selected tab visible without scrolling the page.
- [x] Simplify post-category guidance, gathering headings and member introduction wording; keep backend category values unchanged.
- [x] Preserve the conversation view when retrying a failed load.
- [x] Run existing automated contracts, production build and the new `npm run test:community-room-ui` checks.
- [ ] Complete populated-room desktop/mobile visual acceptance and separate member/Host navigation rehearsal. The browser's signed-in account currently has no Community; source checks are not a substitute for this acceptance.
- [ ] Complete draft-preserving navigation and any remaining inner-room layout refinements before closing Phase 1.

No database migration was required for the Phase 1 UI pass. Media tabs and albums remain later phases; the optional gathering video controls are tracked in Phase 2 below.

#### Phase 2 progress — optional gathering livestreams

- [x] Host controls to add, replace, hide or remove an individual YouTube video and choose whether to keep its replay.
- [x] A click-to-load privacy-enhanced player alongside the same gathering conversation on desktop, stacked on mobile; no autoplay or separate YouTube chat.
- [x] Plain YouTube Studio guidance and an explicit warning that unlisted links can be shared outside this platform.
- [x] Database access requires an active platform account, a published Community and existing gathering access; direct table and anonymous RPC reads are denied.
- [x] Admin → Communities video pause/resume controls; Host saves cannot undo Admin pause. Watching clients re-check permissions/settings every 30 seconds and on focus. This removes the in-platform player, not copies of the YouTube link.
- [x] Migration `20261007120000_community_gathering_youtube.sql` applied to the live project. Do not rerun it. No YouTube credentials or Vercel variables required.
- [x] Source/URL-parser checks, existing automated suite and production build passed. Live transaction-only tests passed Host save, member read, member-edit denial, outsider denial, replay opt-out, Admin pause, Host inability to unpause, removed-member denial and direct/anonymous denial.
- [ ] Real Host save/replacement/removal and YouTube playback on desktop/mobile; confirm the channel allows embedding and is livestream-enabled. Database tests did not broadcast or upload video.

The SQL file under `supabase/tests/032_community_gathering_video.sql` is a rollback test, **not a migration**. It simulates readiness only inside its transaction and leaves no rehearsal publication or real event change behind. Security advisors report intentional RLS-without-policies for the RPC-only table and authenticated security-definer RPCs; their explicit role/membership checks were tested. Historical advisor findings are separate.

#### Phase 3 additions — event browsing inside the Community

- [ ] Keep Community navigation visible while members open upcoming or past event details in place; support shareable event selection, Back/Close and accessible focus handling without losing filters or drafts.
- [ ] Show that event's videos, photos and conversation together, with the event title and date on each recording/album; do not mix unrelated event discussions.
- [ ] Add “Link an existing event” to Community Host tools, as well as creating a new gathering. Reuse existing ownership/linking permissions; a Community can exist first and link later events over time. Membership does not automatically grant authority to link someone else's event.
- [ ] Add a compact “Next gathering” strip inside the Community with title, date, booking/attendance action and a quiet countdown; hide it when no eligible event exists and stop the countdown after it starts.
- [ ] Keep the strip still by default, avoiding scrolling text; honour reduced-motion preferences for any optional animation. Admin suspension, event cancellation and visibility remain authoritative.
- [ ] Verify empty, upcoming, live, past and cancelled states and that public event discovery never exposes private Community media.

- [ ] Audit member typography: one readable interface font, restrained editorial headings only where useful, smaller headings and tighter spacing.
- [ ] Remove unnecessary decorative cards, slogans and repeated introductory paragraphs from signed-in screens.
- [ ] Use plain labels: “Your Communities”, “Start a conversation”, “Upcoming gatherings”, “Invite people” and “Add a livestream link”.
- [ ] Audit and refine the entire Community room UI as a frequently used member workspace, not only its discovery page: compact header, clear hierarchy, consistent typography and reduced card/introductory clutter.
- [ ] Refine Community-local tabs for Conversations, Gatherings, Media and People; keep them visually separate from platform navigation, retain the selected tab and use shareable links without losing the member's place.
- [ ] Make Community tabs easy to use on mobile, with visible selection, comfortable touch targets and no clipped labels or page-wide horizontal overflow.
- [ ] Simplify conversation browsing and posting: one obvious “Start a conversation” action, readable threads, clear reply controls and accessible attachment previews.
- [ ] Refine gathering, video and photo-album layouts with concise metadata, obvious watch/discuss actions and a clear route back to the Community.
- [ ] Keep member-facing actions simple; show Host management controls only to authorised Hosts without crowding everyday browsing.
- [ ] Add consistent loading, empty, error and permission states across Community tabs; load only the selected area where practical and preserve unsent drafts when navigating.
- [ ] Verify the full Community room on desktop and mobile, including keyboard/focus navigation, contrast, long titles, populated feeds, Host controls and member usability with plain wording.
- [x] Add optional YouTube livestreams to new or existing Community gatherings; Hosts can add, replace or remove a video link without sharing channel credentials.
- [x] Include short YouTube Studio setup instructions and explain that an unlisted link can be shared outside the platform. Platform viewing is restricted to authorised Community members, not a guarantee of YouTube exclusivity.
- [x] Build a compact “Watch & discuss” gathering view: video beside its conversation on desktop and above it on mobile; no autoplay by default.
- [ ] Add a Community “Media” area with “Videos” and “Photos” filters, rather than extra top-level platform tabs.
- [ ] Tie each gathering livestream, replay and photo album to its gathering and one persistent gathering conversation; show the gathering name/date and an “Open conversation” action.
- [ ] Allow standalone Community media to have its own named post and replies. Do not silently mix it into an unrelated gathering conversation.
- [ ] Let Hosts create named photo albums and upload multiple images, optionally attached to a gathering.
- [ ] Show compact photo grids with an accessible swipeable carousel, captions, keyboard navigation and comfortable mobile controls.
- [ ] Show the album creator and each photograph's uploader name and upload date; preserve attribution for member contributions.
- [ ] Add a Host-controlled “Allow members to add photos” setting per album, with “Publish immediately” and “Review first” choices. Use immediate publication for pilot member contributions when enabled, retaining Host moderation.
- [ ] Let members remove their own uploads, let Hosts moderate album photos, and provide reporting and a reminder to obtain permission from people pictured.
- [ ] Keep album discussion attached to its album or existing gathering conversation; avoid creating duplicate threads for the same gathering.
- [ ] Test multi-image upload failures, contribution permissions, review visibility, attribution, own-upload removal, moderation and private-album access.
- [ ] Introduce pilot photo limits: 10 images per upload, 20 member photos per day per Community, 100 photos per album and a 500 MB Community allowance adjustable by Admin. Show remaining allowance and friendly limit messages.
- [ ] Resize/compress uploaded photos to a maximum stored size of 1 MB, remove location metadata and generate lightweight thumbnails; enforce file type, size and image validation on the backend as well as in the interface.
- [ ] Enforce member, album and Community quotas server-side, including concurrent uploads and pending photos; reserve upload allowance and release unused reservations so retries cannot bypass limits.
- [ ] Provide plain Host upload choices: “Only Hosts can add photos”, “Members can add photos immediately” and “Member photos need approval”; let Hosts close individual albums to new contributions.
- [ ] Provide functional approve, reject, hide and remove controls with uploader attribution. Pending/rejected photos must not be visible to ordinary members; retain member own-upload removal and moderation records.
- [ ] Clean up abandoned uploads and rejected media; give removed photos a short, documented recovery period before clearing their files. Apply the same access restrictions to thumbnails and originals.
- [ ] Test quota boundaries, simultaneous uploads, compression failures, metadata removal, approval visibility, storage cleanup and recovery; monitor actual storage and delivery usage before changing pilot allowances.
- [ ] Let Hosts keep or hide a replay; finished gatherings move to past gatherings. Removing a video link must not delete the discussion.
- [ ] Enforce Community access server-side for media records and conversations, preserve moderation/reporting and Admin suspension, and use permission-aware storage for uploaded photos.
- [ ] Verify mobile layout, removed-member access, link replacement, unavailable videos, replay visibility and photo-album conversation continuity.

Media remains discoverable through both its gathering and the Community Media area. The general feed may show a short linked announcement, but is not the only place to find a recording or album. Retain replays until the Host hides/removes them or the source becomes unavailable; do not promise permanent availability of externally hosted videos. Obtain permission to publish identifiable attendee photographs, and retain existing reporting/removal processes.

### Pilot Host cancellation and poster saving

- [x] Eligible founding Hosts can cancel their own future published free events with a public reason.
- [x] Reuse ticket cancellation and preference-aware notification queueing; inform Super Admin.
- [x] Admin can accept or reject/request a new plan without restoring tickets.
- [x] Preserve the cancelled Host record and review note.
- [x] Show “Save poster” for eligible published pilot events and check the saved status before claiming publication.
- [x] Database rollback tests confirmed immediate poster approval and public lookup, Host cancellation, and Admin rejection without ticket restoration.

Migration `20261007110000_pilot_host_event_cancellation.sql` is already applied to the live project. No real event was cancelled by these tests. The poster test used rolled-back Storage metadata; a real binary upload and inbox receipt are still separate browser/provider acceptance checks.

### Follow-up interface refinements

- [x] Add “Join straight away” and “Ask to join” discovery filters without changing joining permissions.
- [x] Keep membership feedback above the Community cards, rather than below the whole page.
- [x] Explain paused personal access without claiming the entire Community is paused.
- [x] Give empty Community screens an obvious route to start a group.
- [x] Limit automatic event publishing promises to the signed-in founding member’s eligibility.
- [x] Show instant free booking on event listings only while membership intake permits it.
- [x] Keep image/Community actions separate from the event-content publishing controls.
- [x] Explain invitation steps differently for events and Communities; prevent editing a recipient while sending.

- [ ] Verify deployed member and Host screens on desktop and mobile.
- [ ] Confirm a real invitation reaches an inbox and returns to its destination after OTP/onboarding.
- [ ] Rehearse full capacity, last-place competition, cancellation and rejoining with separate accounts.
- [ ] Test reporting, Host removal and Admin suspension with an opened pilot Community.
- [ ] Review historic database security-advisor findings separately; this upgrade does not certify every legacy RPC.
