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

**Status: in progress, not complete.** Shipped code and automated contracts do not close the pending browser and multi-account acceptance below.

Implemented:

- [x] Open upcoming/past gatherings in the existing Community page, with shareable selection, browser Back support, a visible Back to gatherings action, protected on-demand loading and honest retry errors.
- [x] Add visible Upcoming/Past choices and Create a gathering / Link an event shortcuts to existing Host tools. Existing event-link permissions remain unchanged.
- [x] Add a still, compact next-gathering strip with the event's date/timezone and a quiet minute-updated countdown that stops at the start.
- [x] Existing suite, new `npm run test:community-inline`, room UI/video checks and production build passed for the first pass. No new SQL migration required.
- [x] Add Videos beside Upcoming/Past in Gatherings. Each visible video has its gathering title/date and opens that same gathering in place; return navigation preserves the Videos choice.
- [x] Load discovery videos through the existing protected RPC, with bounded requests, permission rechecks, retry/empty states and no YouTube embed or thumbnail requests before playback is requested.
- [x] Run the repository suite, Phase 3 navigation/video contracts, TypeScript and production build for the Videos pass. No new migration required; real populated-room browser acceptance is still open.
- [x] Add Host choices “Watch together” / “Watch anytime”. Watch-anytime creates one permanent gathering-linked Community conversation, with replies, own removal and private reporting; scheduled live chat remains separate.
- [x] Preserve that discussion when the video is hidden, replaced or removed, or the Host changes viewing mode. Saving again never restores a moderated/removed thread or creates a second one.
- [x] Add 50-reply cursor pages, permission rechecks and read-only Community handling. Reuse normal Community rate limits, reply notifications, blocks and moderation records.
- [x] Apply `20261007130000_community_watch_anytime_discussions.sql` to the live project. Rollback acceptance passed duplicate-save, lasting reply, closed live-chat separation, read-only denial, own removal, 65-reply pagination, video-removal continuity, hidden-thread protection and outsider/removed-member/direct/anonymous denial.
- [x] Preserve existing account/content privacy deletion with `20261007130100_community_discussion_privacy_cleanup.sql`; discussion links cascade only on actual content deletion, not on normal moderation or video removal. Both migrations are applied; do not rerun them manually.
- [x] Run the repository suite, new watch-anytime source contracts, TypeScript and production build. Security advisors flag the intentional RPC-only table and authenticated security-definer functions; membership/Host checks and direct/anonymous denial passed rollback tests. Legacy advisor findings remain separate.
- [x] Add “Add a video discussion” to Host tools and “Add a video” to gathering shortcuts. A title, short description, individual YouTube link and sharing-permission confirmation open an immediately available, free Community-only recording without a fake future date or tickets.
- [x] Reuse the existing event/room identity internally, but show a recording-specific member screen: Added date, video and lasting replies, with no irrelevant attendance, venue, ticket or scheduled-chat controls. Hosts can still replace, hide or remove the video; Admin video pause remains authoritative.
- [x] Retain existing pilot eligibility/global pause checks for pilot-opened Communities and ordinary approved Host permissions for non-pilot Communities. Repeated network saves use one request ID and return the existing discussion.
- [x] Apply `20261007140000_community_prerecorded_gatherings.sql` live. Rollback tests passed consent, creation, duplicate retry, private/closed/no-ticket state, persistent replies without RSVP, ordinary-member creation denial, video-removal continuity, pilot pause and anonymous event/creation plus outsider-metadata denial. Do not run `supabase/tests/034_community_prerecorded_gatherings.sql` as a migration.
- [x] Run `npm run test:community-recordings`, existing Community contracts, the full repository suite, TypeScript and production build. Advisors flag intentional authenticated security-definer entry points; their role/membership checks were rehearsed. Rollback left zero recording events/applications and kept the rehearsal Community archived.
- [x] Preserve core unfinished text during same-tab navigation: Community posts/replies, lasting gathering replies, live messages/questions, Host recaps/video settings, recording creation and gathering planning (including its step and draft ID). Failed submissions retain text; successful ones clear it. Reopening a recording retains its retry ID.
- [x] Keep drafts account/room-scoped in bounded browser memory only, with eight-hour expiry, sign-out cleanup and refresh/close warnings. No member text is written to local/session storage or automatically published. Switching to a different planning draft asks before replacing unfinished work.
- [x] Retain a newly saved proposal ID while opening it, so a failed publication does not make the next save create another private draft. Keep its controls busy through publication.
- [x] Run `npm run test:community-drafts` behavioural store tests, Community source contracts, the full repository suite, TypeScript and production build for this pass. Browser interaction acceptance is still open; no database migration required.

Required before Phase 3 can close:
- [ ] Verify draft restoration and cleared submissions with populated member/Host accounts on desktop/mobile across local tabs, browser Back and closing/reopening a gathering. Finish remaining uncontrolled Host settings and attachment-selection guards; uploaded files are not retained by text-draft memory.
- [ ] Rehearse Watch together / Watch anytime in populated desktop/mobile rooms with separate Host/member accounts, including real playback, reporting and reply delivery.
- [ ] Complete populated Host/member desktop/mobile rehearsal of prerecorded creation and its in-place viewing experience. Feature code and database acceptance are implemented; real video playback and inbox delivery are not certified by rollback tests.
- [ ] Complete Media integration. Videos discovery and persistent gathering discussion are shipped; photo albums arrive in Phase 4 and no nonfunctional Photos action is shown.

- [ ] Verify empty, upcoming, live, past and cancelled states and that public event discovery never exposes private Community media.

The earlier duplicate navigation, linking and countdown tasks are consolidated into the implemented items above. Core text draft preservation is implemented, but full navigation/browser acceptance and remaining settings/attachment guards are open. Draft memory is not a server-saved draft or a guarantee against browser/process crashes. Watch-anytime replies persist independently of scheduled chat. The SQL under `supabase/tests/033_community_watch_anytime.sql` is a rollback test, not a migration; do not stage it as schema setup.

#### Later phases — cross-platform polish, photos and production acceptance

**7 October update:** At the member's request, the Phase 3 populated-room/playback/inbox rehearsal is deferred to 8 October. Phase 3 stays open. Independent presentation work continues today; this is not a claim that the remaining acceptance gates have passed.

Cross-platform readability, first implementation pass:

- [x] Shorten member Home to a compact welcome and three useful suggestions; remove decorative numbering and the repeated introductory slogan. Preserve recommendation destinations and permission logic.
- [x] Replace the oversized secondary Home panel heading with “Your membership” and a short description.
- [x] Use the existing interface font for suggestion, Community-directory and event-card headings; retain restrained editorial page titles and leave public landing/Admin typography unchanged.
- [x] Increase Community post/reply metadata and form text, keep text fields at 16px, retain focus indicators and 44px action targets, and wrap long titles/actions rather than hiding controls.
- [x] Pass the repository suite, readability/Community UI/navigation/draft contracts, TypeScript and production build. Inspect the local production event listing at desktop and 390px phone widths: listing and action appear near the top without horizontal clipping.
- [ ] Verify the new Home/directory/populated Community styling with signed-in member and Host accounts tomorrow. The local event preview does not certify those authenticated screens.

Next implementation sequence: photo data/access/quota design → Host album creation and uploads → member contributions/moderation → Media browsing and accessible carousel → production acceptance. The Host Photos section now has working album tools; member Media discovery and open uploads remain pending.

Photo foundation, 7 October — backend implemented; member upload feature not yet open:

- [x] Add RPC-only album, upload-batch, photo-reservation and Community allowance records, with RLS and no direct member/anonymous table access. Defaults keep binary uploads closed.
- [x] Add authorised Host album creation with retry-safe IDs, Host-only/member/review contribution settings and closed-album controls. These are backend actions; the Host screens follow next.
- [x] Attach gathering albums to the same lasting gathering conversation; multiple albums never create multiple gathering threads. Standalone albums have their own named Community post.
- [x] Reserve a full original/thumbnail budget under a Community row lock: maximum 10 photos per batch, 20 member photos per Nairobi calendar day, 100 per album and default 500 MiB per Community. Retry IDs reuse existing reservations. Pending, expired and removed records continue consuming allowance until trusted cleanup proves their files are gone.
- [x] Add Node image processing: decode real JPG/PNG/WebP, reject unsupported/animated input, bound source bytes/pixels, apply camera orientation, resize to 1920px, strip EXIF/location metadata and produce a 480px thumbnail. Stored original ≤1 MiB; thumbnail ≤64 KiB. Behavioural tests process actual binary fixtures, not only source strings.
- [x] Apply `20261007150000_community_photo_album_foundation.sql` live after transactional dry-run acceptance. Repeat rollback tests passed on the applied schema and left zero albums/reservations, zero enabled upload settings and the rehearsal Community archived. Do not rerun this migration manually.
- [x] Implement private Storage, authenticated binary upload/finalisation and trusted cleanup routes in the follow-up pipeline pass below. Upload settings remain closed pending real binary acceptance.
- [x] Implement Host album forms, attribution and photo review/removal controls in the follow-up pipeline pass below.
- [x] Add member Media discovery, contribution screens and a photo viewer in the follow-up pass below; uploads remain paused and browser acceptance remains open.
- [ ] Add photo-specific reports and complete populated contribution/viewer acceptance.
- [ ] Rehearse simultaneous reservations/uploads with separate database sessions, real private binary delivery, removed-member access, cleanup/recovery, mobile carousel and inbox delivery. Sequential rollback tests and lock inspection are not a concurrency/load certification.

Security advisors flag the intentional RPC-only tables and authenticated security-definer entry points. Explicit active-account, published-Community, membership/Host and read-only checks passed the rollback tests; anonymous/direct grants remain denied. This is not a blanket clearance of historical advisor findings. [Supabase advisor guidance](https://supabase.com/docs/guides/database/database-linter).

Photo upload pipeline and Host tools, 7 October — implemented; uploads remain paused:

- [x] Add a private `community-photos` bucket. A restrictive Storage policy blocks direct browser access; authenticated photo delivery checks Community permissions before and after downloading, for both thumbnail and original. No public/signed file links are exposed.
- [x] Process one photo per request with a 4 MiB streamed-body limit, actual image decoding, metadata removal and fixed original/thumbnail budgets. Upload claims bind to the uploader, expire safely and limit retries; finalisation rechecks membership and album permissions.
- [x] Preserve already-saved files when a finalisation response is lost. Failed uploads reset only after both binary removals succeed; uncertain states keep their reserved allowance until trusted cleanup.
- [x] Add lazy-loaded Host Photos tools: named albums, optional gathering association, plain contribution choices, close-album control, permission confirmation, uploader/date/caption, retry of unsaved files and functional approve/decline/hide/restore/remove controls. Unsent album text survives tab navigation; unsaved file navigation warns before leaving.
- [x] Add cleanup to the authorised daily housekeeping schedule. Expired reservations, stalled uploads, deleted-account photos and removed/rejected photos after seven days are cleared in bounded batches; allowance is released only after successful binary deletion.
- [x] Apply `20261007160000_community_photo_upload_pipeline.sql` live. Rollback test `036` passed on the applied schema, including review visibility, removal, hidden-uploader denial, cleanup, uploader loss of membership and service-only finalisation. Post-test inspection: zero albums/photos, zero enabled upload settings, private bucket and archived rehearsal Community. No manual SQL rerun is needed.
- [x] Pass the repository suite, TypeScript, production build, photo-processing binary tests, streamed-body cancellation/bounds tests and Community UI/draft contracts. Source contracts do not replace browser or real Storage acceptance.
- [x] Add member-facing Media/Photos discovery and a protected photo viewer in the follow-up pass below. Photo reporting and in-place album conversation integration remain open.
- [ ] Add Admin allowance/upload controls and visible cleanup health/backlog. Verify deletion/archive workflows preserve a cleanup manifest before any physical cascade deletion; hard-deleted records must not strand private binaries.
- [ ] Rehearse real binary uploads/delivery, partial failures, simultaneous sessions, removed-member access, restore/cleanup, desktop/mobile Host controls and member contribution permissions. Uploads stay paused until these checks pass.

Phase 3 remains **open, not complete**. The populated Host/member/video/inbox rehearsal is deferred to 8 October, and the remaining attachment/settings guards are still listed above; this photo pass does not close that gate.

Member Media and photo viewing, 7 October — implemented, visual acceptance open:

- [x] Add Community-local **Media**, with **Videos** and **Photos** choices separate from the platform header. Load album data only when Photos is selected; videos reuse the existing protected library and in-place watch/discuss screen.
- [x] Preserve Media/video selection in the address and browser history. Keep old gathering video links working. Explain load failures instead of presenting them as empty video libraries.
- [x] Open authorised original photos in a native modal viewer with caption, uploader, date, count, Previous/Next, arrow keys, Escape/Close and horizontal touch swipe. Native modal focus containment and close controls keep the page behind it inactive; original delivery uses the same private permission-checked route as thumbnails.
- [x] Reuse contribution/removal controls and Host settings from the same album component. Ordinary members do not see Host album creation/settings or storage usage. Warn before switching Media type with unsaved selected photo files and disable switching during an active photo operation.
- [x] Recheck album-list access on focus and every 30 seconds, including when no album is selected. Failed checks clear albums/photos and close the viewer; changed photo visibility removes that photo from the viewer.
- [ ] Add photo-specific reports with preserved photo evidence and a functional Admin review destination. Do not substitute a conversation report: it rejects reports by the conversation author and would miss member-photo complaints from that Host.
- [ ] Open the album's existing conversation in place, with correct gathering/album context and no duplicate threads. Album conversation records already exist, but this viewing pass does not expose a nonfunctional discussion shortcut.
- [ ] Rehearse populated desktop/mobile layouts, modal focus return, keyboard/swipe, stale/deleted file handling, Media Back navigation with pending file selection, real uploads and removed-member access. Source contracts and build success do not certify these interactions.

Uploads remain **paused**. No new migration or Vercel configuration is required for this viewing pass. Next implementation: photo reports/Admin safety handling → album conversation integration → upload/recovery acceptance and Admin opening controls.

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
- [x] Add a Community “Media” area with “Videos” and “Photos” filters, rather than extra top-level platform tabs.
- [ ] Tie each gathering livestream, replay and photo album to its gathering and one persistent gathering conversation; show the gathering name/date and an “Open conversation” action.
- [ ] Allow standalone Community media to have its own named post and replies. Do not silently mix it into an unrelated gathering conversation.
- [x] Implement Host album creation and multi-image upload controls, optionally attached to a gathering. Binary uploads remain paused for acceptance.
- [x] Implement compact photo grids and a native modal viewer with swipe, captions, keyboard navigation and mobile controls. Populated browser acceptance remains open.
- [ ] Show the album creator alongside existing per-photo uploader/date attribution; verify attribution with real member contributions.
- [ ] Add a Host-controlled “Allow members to add photos” setting per album, with “Publish immediately” and “Review first” choices. Use immediate publication for pilot member contributions when enabled, retaining Host moderation.
- [ ] Let members remove their own uploads, let Hosts moderate album photos, and provide reporting and a reminder to obtain permission from people pictured.
- [ ] Keep album discussion attached to its album or existing gathering conversation; avoid creating duplicate threads for the same gathering.
- [ ] Test multi-image upload failures, contribution permissions, review visibility, attribution, own-upload removal, moderation and private-album access.
- [ ] Introduce pilot photo limits: 10 images per upload, 20 member photos per day per Community, 100 photos per album and a 500 MB Community allowance adjustable by Admin. Show remaining allowance and friendly limit messages.
- [ ] Resize/compress uploaded photos to a maximum stored size of 1 MB, remove location metadata and generate lightweight thumbnails; enforce file type, size and image validation on the backend as well as in the interface.
- [ ] Enforce member, album and Community quotas server-side, including concurrent uploads and pending photos; reserve upload allowance and release unused reservations so retries cannot bypass limits.
- [x] Provide plain Host upload choices: “Only Hosts can add photos”, “Members can add photos immediately” and “Member photos need approval”; let Hosts close individual albums to new contributions.
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
