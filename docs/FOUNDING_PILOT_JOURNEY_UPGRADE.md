# Founding pilot journey upgrade — 7 October 2026

## Remaining work — phased taskboard

This is the current sequence. Earlier implementation notes below are historical; the pilot photo participation update supersedes blanket upload closures. Phase 3 remains open until its deferred populated-room rehearsal is completed.

**Scope:** These are Community workstream phases, not a replacement for the [main audit taskboard](./UX_EVENTS_IMPLEMENTATION_TASKBOARD.md) and its phases 0–5. The former ten-sprint roadmap remains paused. Main event/onboarding task IDs and their release evidence are preserved separately.

| Phase | Focus | Current state | Completion evidence |
|---|---|---|---|
| 4 | Community UI overhaul and everyday use | In progress; priority reassessment after member feedback | Consistent room layout, readable controls, visible branding/avatars, inline About and populated mobile Host/member walkthrough |
| 5 | Media safety and reliable operations | In progress | Report alerts, hard-delete cleanup manifests, scalable Admin queues and simultaneous-session tests |
| 6 | Full production rehearsal, including open Phase 3 checks | Pending; populated playback/inbox work deferred to 8 October | Separate Host/member/Admin accounts, real files/video, invitation/OTP return journeys, inbox receipts, permission loss and recovery |
| 7 | Limited-pilot release review | Pending | Record real acceptance evidence, verify deployed UI, rehearse pause/expiry controls, confirm support ownership and monitor actual failures |

### Priority Community overhaul — 7 October member feedback

This is a complete Community-room usability/visual audit and overhaul, not another isolated styling pass. The Product Owner reports missing creation images, unreadable burgundy button states, inconsistent boxed/full-width tabs, missing People photos and a dense redirected About page. These reports reopen visual acceptance even where earlier source/build checks passed. Do not mark them fixed without reproducing and verifying a populated Community. The exact Community URL/name has been requested; its absence does not block shared-layout investigation.

**Design direction:** a compact identity header; one consistent content width and spacing system across Home, Conversations, Gatherings, Media and People; light surfaces with readable dark text; burgundy used sparingly as an accent; obvious actions and short labels. About is a brief accessible panel inside the signed-in room. Preserve the separate public `/about` route for intentional sharing/SEO, not as the everyday member About destination. Do not expose private media or member profiles to simplify rendering.

| ID | Priority / phase | Task | Status | Exit condition |
|---|---|---|---|---|
| CINT-01 | P0 / 4–6 | Strengthen scheduled-chat access checks for current platform membership and Community publication/suspension | Ready — live helper reviewed | Removed/suspended/dormant accounts and closed Communities cannot read/send through UI, RPC or realtime; Host/member negative tests recorded |
| CINT-02 | P0 / 4–6 | Correct invited-newcomer return flow to use current Community join policy | Ready — live activation function reviewed | Open free Communities join immediately after member activation; approval and invitation-only modes retain their rules; no duplicate membership or accidental role changes |
| CUI-01 | P1 / 4–6 | Repair Community creation-image handoff and display | Ready — user report; source split confirmed | Follow selected file → persisted application asset → authorised Community branding → directory/header/Host preview; valid image remains visible after refresh/navigation; failures have useful feedback |
| CUI-02 | P1 / 4 | Replace unreadable burgundy button/tab states | Ready — visual reproduction pending | Normal, hover, selected, focus, disabled and busy states remain readable; normal text contrast at least 4.5:1, large text 3:1; keyboard focus visible; no accidental global-style regressions |
| CUI-03 | P1 / 4 | Unify the complete Community room and tab layouts | Ready — user report | One shared width, typography, gutters and density; no jump between boxed and full-width content; no oversized empty areas or stacked introductory banners; clear mobile tab/action treatment |
| CUI-04 | P1 / 4–6 | Make People useful and show available member avatars reliably | Ready — user report | Verify authorised avatar data, file loading/cropping and failures; real supplied avatars visible, honest initials fallback when absent; compact member cards, clear Host labels and no privacy bypass |
| CUI-05 | P1 / 4 | Replace signed-in About redirection with a short in-room panel | Ready — source navigation confirmed | Name/purpose/Host/joining rule shown briefly without losing the selected tab, scroll position or drafts; accessible close/Escape/focus return; public sharing page remains separate |
| CINT-03 | P1 / 4–6 | Let members remove their own scheduled live-chat messages | Ready — current live function is Host-only | Own-message action with confirmation, server ownership check and audit record; cannot remove others' messages; existing Host moderation retained |
| CINT-04 | P1 / 4 | Align the live-chat composer with Host-only/closed modes | Ready — UI condition mismatch confirmed | Members see a plain read-only explanation instead of a composer the server will reject; time-window/RSVP/mode changes refresh accurately |
| CINT-05 | P1 / 4 | Improve People → Connect → Message without unrestricted inbox access | Ready | Clear connection request/pending/accepted/blocked states and obvious message action after mutual consent; preserve opted-in discovery and contact privacy |
| CUI-06 | P1 / 6 | Complete populated desktop/mobile interaction and visual acceptance | Ready; device work deferred to 8 October | Two ordinary members, Host and Admin test joining, topics/replies, linked gatherings/media, own deletion, inbox consent, blocking/suspension, empty/error/loading states and all colour states; screenshots/device/account-role evidence recorded |
| CINT-06 | P1 / 6–7 | Reconcile current pilot Community availability before opening testing | Ready | Fresh status read-back and owner-approved published testing destination; do not publish or weaken approval as an audit side effect; verify free/open versus approval/invitation-only journeys |

**Order:** fix CINT-01/02 safety and joining correctness first; investigate CUI-01 and establish CUI-02/03 shared styles next; complete People and inline About; implement own-live-message removal and consent-based connection UX; finish populated acceptance. Non-critical new Community features and Admin queue paging must not crowd out this correction pass.

**Evidence checkpoint:** the prior read-only audit found Communities enabled, pilot creation enabled, trusted-auto membership intake, and realtime publication for gathering messages. At that observation there were zero published Communities (one draft and one archived fixture). The Product Owner subsequently reports creating a Community; do not present the earlier count as a fresh current-state audit. Existing posts/lasting replies/private messages have own-removal paths; scheduled live messages do not. These are source/live-function observations, not a passed two-device rehearsal.

**Image diagnostic checkpoint:** creation uses `application_proposal_media` in `proposal-media`; the room header reads `icon_storage_path`/`cover_storage_path` from branding and signs `community-media` assets. This separation is a confirmed investigation point, not proof of the particular user's root cause. Check saved asset status/linkage and authorised delivery before changing CSS or exposing a bucket.

### Phase 4 — conversations and topics

- [x] Keep Community tabs **Home · Conversations · Gatherings · Media · People**; no second Topics feed or duplicate event tab.
- [x] Make **Browse topics** visible beside Conversations. Existing categories group introductions, questions/help, opportunities, useful resources and updates without changing permissions.
- [x] Keep replies inside the conversation that started them; gatherings and album discussions keep their own context.
- [x] Replace loaded-only topic/search filtering with server-side matching and 20-row cursor pages. Search published, authorised conversations by literal words or person; preserve blocks and removed/inactive-author filtering. Following, Saved, Mine and New views are filtered before pagination too.
- [x] Preserve previously loaded main-feed pages separately from matching results. Ignore stale responses, show loading/retry/no-match feedback and retain browsing preferences in bounded account/Community-scoped memory, cleared at sign-out; no search text is stored persistently.
- [x] Keep the “Most active in this view” ordering explicitly limited to loaded results, rather than claiming a global ranking. Members can browse Host announcements without receiving announcement-creation permissions.
- [x] Use plain topic labels such as **Questions & ideas**, **Useful links** and **After a gathering**, retaining existing stored category IDs and posting permissions.
- [x] Apply `20261007210000_community_conversation_search.sql` live. Rollback test `041` passed 45 matching conversations, cursor pages, literal search, hidden/blocked filtering, Mine/Saved scope, archived/outsider denial, input limits and anonymous grants. No manual SQL run is needed.
- [x] Pass the full repository suite, search/topic source contracts, draft-store behaviour tests, Community UI contracts, TypeScript and production build. These checks do not close the populated desktop/mobile acceptance below.
- [ ] Rehearse typing/changing topics during slow requests, cleared filters, Back/navigation restoration, attachment/reply loading and pagination with populated desktop/mobile accounts.
- [ ] Review whether Hosts need a small set of custom subject labels (for example Business, Wellbeing or Local connections). This is a separate enhancement, not shipped today. Members should not create unlimited category names.
- [x] Preserve unfinished joining choices, gathering settings and album permissions in bounded account-scoped tab memory; show unsaved feedback and explicit **Discard changes**. Clear a draft only after successful saving. Refresh authoritative album upload access after permission changes.
- [x] Share one leave-page warning for selected post, album and branding files; keep files on cancellation, block departure during saving and ignore stale decisions after unmount/sign-out. Selected files are never stored in draft memory. Browser reload/close uses the browser warning; SPA Back behaviour still needs device acceptance.
- [x] Pass behavioural file-guard tests (mocked browser/router), draft-store tests, photo pipeline and Community UI contracts, TypeScript and production build. These are automated checks, not real-device acceptance.
- [x] Keep Community application and branding text drafts account-scoped and bounded in tab memory. Application fields are controlled across carousel close/reopen; consent is never persisted and resets before a new review. Branding removal choices, colour and descriptions have explicit unsaved/Discard states. Image files remain memory-only and use the shared leave guard.
- [x] Protect Community submission from stuck saving states and avoid calling a confirmed save a failure when the later status refresh fails. Keep answers on submission failure; clear them after confirmed save or withdrawal. Simplify pilot creation/consent copy without changing server approval controls.
- [x] Retain unfinished invitation email/message/preset by account and destination, with **Discard invitation**. Clear only after confirmed invitation creation; keep queued versus emailed feedback distinct and recover from network errors without a stuck button.
- [x] Retain shareable Community page fields and visibility choices, with unsaved feedback and Discard. Snapshot edits before confirmation, prevent editing during saves, preserve failed edits and show the last successfully saved visibility rather than an unsaved checkbox. Clarify that the chosen public Host name/introduction can be shared while private Host details stay private.
- [ ] Complete populated mobile/desktop polish and audit remaining specialised Host tools. The common creation/settings/invitation/profile draft pass is implemented; real-device acceptance is not complete.

### Phase 5 — reliable media operations

- [x] Queue a private safety notification when a new photo report is filed, through the existing in-app/Resend engine. Limit recipients to active, unexpired Super Admin/moderator roles; do not email images, captions, complaint text or reporter identity.
- [x] Deduplicate report retries and give the email a **Review photo report** action leading to Admin Safety.
- [x] Apply `20261007200000_community_photo_report_notifications.sql` live. Rollback test `040` passed recipient scope, in-app/email job counts, duplicate suppression, private payloads and trigger grants. Full repository suite, topic/alert contracts, TypeScript and production build passed. Rehearsal left zero photos/reports/report-email jobs and the test Community archived. No manual migration run is needed.
- [x] Preserve minimal durable deletion manifests before photo rows are physically deleted, including album cascades. No parent foreign keys or member-facing grants; captions and names are not copied. Workers claim ten jobs with five-minute leases and clear only their current token after private Storage removal succeeds. Ordinary cleanup clears its trigger-created manifest atomically.
- [x] Apply `20261007220000_community_photo_deletion_manifest.sql` live. Rollback test `042` passed cascade survival, account scope, browser denial, active/expired/stale leases and ordinary cleanup compatibility. Regression rollback test `036` also passed existing upload/finalisation, Host moderation, membership-loss and private-bucket boundaries. Worker behavioural tests, full repository suite and production build passed. Rehearsal left zero photo records and deletion jobs. No manual migration run is needed. Real Storage binaries and parallel sessions remain unaccepted below.
- [ ] Follow up the existing Supabase [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The new cleanup table's no-policy RLS notice is intentional service-only isolation, verified by grants and denied member calls; it must not receive a permissive browser policy.
- [ ] Add server paging to photo reports and Community photo operations (currently bounded to 100 records).
- [ ] Rehearse simultaneous upload reservations, cleanup failures and recovery with real files.
- [ ] Verify real safety email receipt and actual delivery timing. A queued job is not proof of inbox delivery.
- [ ] Add targeted immediate safety-report delivery or an approved more-frequent worker schedule. Current Vercel cron runs daily at 08:00 EAT; Admin can also run the notification processor. New report alerts are immediately in the private review queue, but email is not yet an instant-delivery promise.

### Phase 6 — rehearsal checklist

- [ ] Host creates an open Community; a regular member joins and contributes only where allowed.
- [ ] Host creates/links gatherings, a video discussion and event/photo albums; member navigates without losing their place.
- [ ] Real photo upload, approval, private view, reporting, safety hold, restoration and eventual cleanup.
- [ ] Invitations reach real inboxes; a new user verifies OTP, joins and returns to the intended Community/event.
- [ ] Private video playback, live text and lasting replies work with separate accounts.
- [ ] Removed/suspended members lose access; global pilot pause/expiry and Admin overrides remain authoritative.
- [ ] Desktop, phone, keyboard, empty/error/loading states and long titles pass populated-screen review.

### Phase 7 — release decision

- [ ] Record production acceptance only after the above real tests pass; do not replace evidence with source-contract checks.
- [ ] Confirm the deployed commit, current environment/email configuration and pilot end date.
- [ ] Assign support/safety ownership, check failed jobs and cleanup health, and practise pausing a troubled Community or event.
- [ ] Keep automatic creator payouts disabled until their separate financial and approval requirements pass.

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
- [x] Implement Media integration: Videos, Photos and their lasting discussions are shipped. Populated browser/file/playback acceptance remains open below.

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

Next implementation sequence: photo data/access/quota design → Host album creation and uploads → member contributions/moderation → Media browsing and accessible carousel → production acceptance. Host album tools, member Media discovery, photo reports and album conversations are now implemented; open uploads and real browser/binary acceptance remain pending.

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
- [x] Add photo-specific reports in the safety/discussion pass below.
- [ ] Complete populated contribution/viewer acceptance.
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
- [x] Add Admin allowance/upload controls and visible cleanup health/backlog in the operations pass below.
- [ ] Verify deletion/archive workflows preserve a cleanup manifest before any physical cascade deletion; hard-deleted records must not strand private binaries.
- [ ] Rehearse real binary uploads/delivery, partial failures, simultaneous sessions, removed-member access, restore/cleanup, desktop/mobile Host controls and member contribution permissions. Uploads stay paused until these checks pass.

Phase 3 remains **open, not complete**. The populated Host/member/video/inbox rehearsal is deferred to 8 October, and the remaining attachment/settings guards are still listed above; this photo pass does not close that gate.

Member Media and photo viewing, 7 October — implemented, visual acceptance open:

- [x] Add Community-local **Media**, with **Videos** and **Photos** choices separate from the platform header. Load album data only when Photos is selected; videos reuse the existing protected library and in-place watch/discuss screen.
- [x] Preserve Media/video selection in the address and browser history. Keep old gathering video links working. Explain load failures instead of presenting them as empty video libraries.
- [x] Open authorised original photos in a native modal viewer with caption, uploader, date, count, Previous/Next, arrow keys, Escape/Close and horizontal touch swipe. Native modal focus containment and close controls keep the page behind it inactive; original delivery uses the same private permission-checked route as thumbnails.
- [x] Reuse contribution/removal controls and Host settings from the same album component. Ordinary members do not see Host album creation/settings or storage usage. Warn before switching Media type with unsaved selected photo files and disable switching during an active photo operation.
- [x] Recheck album-list access on focus and every 30 seconds, including when no album is selected. Failed checks clear albums/photos and close the viewer; changed photo visibility removes that photo from the viewer.
- [x] Add photo-specific reports with captured metadata and a functional Admin review destination in the follow-up safety pass below. No conversation-report substitution.
- [x] Open the album's existing conversation in place in the follow-up safety pass below; reuse existing gathering threads without duplicates.
- [ ] Rehearse populated desktop/mobile layouts, modal focus return, keyboard/swipe, stale/deleted file handling, Media Back navigation with pending file selection, real uploads and removed-member access. Source contracts and build success do not certify these interactions.

Uploads remain **paused**. No new migration or Vercel configuration was required for the viewing pass. Next implementation: Admin allowance/opening controls and cleanup health → upload/recovery acceptance.

Photo safety and album conversations, 7 October — implemented, browser/binary acceptance open:

- [x] Add private photo reports with category, explanation, captured caption/album/uploader/creation metadata, retry-safe open-report reuse and a five-per-day report limit. Hosts can report member photos even when they authored the album conversation. Reports work in read-only Communities while content viewing is still permitted.
- [x] Show photo reports in **Admin → Work areas → Safety → Community safety** alongside existing reports. Add Start review, Hide content, Dismiss and Release photo hold, with recorded reasons/audit events. The existing queues remain available if the photo-report lookup fails.
- [x] Deliver previews through report-specific Admin permission checks before and after binary retrieval. Admins cannot substitute an unrelated photo ID; members/Hosts cannot use the Admin report preview route. Preview errors show a clear fallback rather than a broken image.
- [x] Preserve Admin safety holds against Host restoration. Releasing a hold preserves pending Host approval, earlier Host hiding and member removal; other reports' active holds remain authoritative.
- [x] Retain removed/rejected photo files for an open review for at most 30 days; deleted-account privacy cleanup still takes precedence. Captured report metadata survives file cleanup. Preview access is bounded to 30 days and is not a promise that a removed file always remains available.
- [x] Add “Open conversation” within the album. Reuse its existing post and, when linked, the same gathering conversation. Existing reply creation handles limits/notifications/moderation; replies are paginated, block-aware and denied in read-only rooms. Unsent text uses account/album-scoped draft memory.
- [x] Apply `20261007170000_community_photo_safety_and_discussion.sql` live after a transactional dry run. Rollback `037` passed report retry/evidence, Admin preview scope, holds/release, pending-approval preservation, Host/member/outsider/direct/anonymous denial, bounded cleanup and album reply continuity. Existing pipeline rollback `036` also passed on the new schema.
- [x] Confirm post-test state: zero reports/albums/photos, zero enabled uploads, private bucket and archived rehearsal Community. No manual SQL rerun is required; `supabase/tests/037` is a test, not a migration.
- [ ] Rehearse reporting, actual binary preview, Admin decisions and album/gathering conversation continuity with populated Host/member/Admin screens on desktop/mobile. Add photo report notification delivery and scalable queue paging before opening wider media use; this pass adds the functional Admin queue, not an inbox-delivery guarantee.

Phase 3 remains open, and photo uploads remain paused. Security advisors still flag intentional RPC-only tables/authenticated security-definer entry points; the new role/scope guards passed rollback acceptance. Historical findings are not certified by this pass.

Photo Admin controls and cleanup monitoring, 7 October — implemented, real release checks open:

- [x] Add **Super Admin → Work areas → Safety → Community photos**. Find a Community, view recorded/pending storage usage, edit its allowance, allow/pause uploads with a recorded reason and see the last cleanup result. Archived/unpublished Communities are described as not open, not as accepting uploads.
- [x] Keep settings and acceptance records RPC-only with RLS and Super Admin checks. Members, Hosts and anonymous callers cannot change allowances, certify launch checks or forge cleanup health. The service-only worker records actual full-run results; per-account cleanup does not certify global health.
- [x] Opening uploads requires four explicitly recorded real tests (binary delivery, access, recovery/cleanup and mobile/member/Host/Admin usability) plus a successful cleanup result within 48 hours. Allowances cannot drop below stored files and outstanding reservations. Reopening a failed launch check pauses uploads everywhere.
- [x] Record cleanup failures without releasing uncertain storage allowance. A recorded failed cleanup pauses all upload settings; later success does not silently reopen them. Stale health blocks new openings, but does not automatically pause Communities already open; overdue monitoring remains an operational responsibility.
- [x] Add a Super Admin-only **Run cleanup** action: same-origin POST, verified identity and database role check, bounded 10-record run, actual Storage removal before allowance release and failure-aware feedback. Refresh reads status; it never pretends to run cleanup.
- [x] Apply `20261007180000_community_photo_operations.sql` live after rollback dry-run acceptance. Test `038` passed opening gates, member denial, stale health, check revocation, failure pausing, committed-quota protection and service-only health. These tests use temporary synthetic evidence and roll back—it is not real launch certification.
- [ ] Rehearse the actual Run cleanup endpoint and failure/recovery with binaries, verify Admin/mobile controls and the full upload path, and record real evidence only after success. All four live photo release checks remain unpassed; uploads remain closed.
- [ ] Finish hard-delete cleanup manifests, actual simultaneous-session acceptance, photo report notifications and queue paging. The operations view currently shows at most 100 Communities, prioritising published ones; add server paging before larger-scale use.

No manual SQL rerun is required. Phase 3's populated-room/playback/inbox rehearsal remains open for 8 October, independently of this implementation pass.

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
- [x] Implement gathering-linked media and persistent gathering conversation; real navigation/playback acceptance remains open.
- [x] Implement standalone named Community albums with their own post and replies, not unrelated gathering conversations.
- [x] Implement Host album creation and multi-image upload controls, optionally attached to a gathering. Binary uploads remain paused for acceptance.
- [x] Implement compact photo grids and a native modal viewer with swipe, captions, keyboard navigation and mobile controls. Populated browser acceptance remains open.
- [ ] Show the album creator alongside existing per-photo uploader/date attribution; verify attribution with real member contributions.
- [x] Implement Host-controlled member contributions per album, immediate or review-first; Admin pause remains authoritative. Real acceptance remains open.
- [x] Implement own-upload removal, Host moderation, private reporting and consent confirmation. Real multi-account UI acceptance remains open.
- [x] Implement lasting album discussions, reusing a gathering conversation when linked; retry-safe rollback tests passed.
- [ ] Test multi-image upload failures, contribution permissions, review visibility, attribution, own-upload removal, moderation and private-album access.
- [x] Implement 10-photo batches, 20 ordinary-member photos per Nairobi day per Community, 100 per album and default 500 MiB Community allowance adjustable by Admin. Usage is shown; real limit/concurrency acceptance remains open.
- [x] Implement image processing, 1 MiB originals, lightweight thumbnails, metadata removal and backend validation; binary fixture tests passed.
- [x] Implement locked quota reservations including pending photos and retry IDs. Simultaneous-session acceptance and hard-delete cleanup manifests remain open.
- [x] Provide plain Host upload choices: “Only Hosts can add photos”, “Members can add photos immediately” and “Member photos need approval”; let Hosts close individual albums to new contributions.
- [x] Implement database-wired photo moderation/removal and attribution. Pending photos are visible only to Hosts and their uploader; populated UI acceptance remains open.
- [x] Implement bounded abandoned/removed-photo cleanup and protected originals/thumbnails. Hard-delete manifests and actual recovery rehearsal remain open.
- [ ] Test quota boundaries, simultaneous uploads, compression failures, metadata removal, approval visibility, storage cleanup and recovery; monitor actual storage and delivery usage before changing pilot allowances.
- [x] Implement replay visibility controls and persistent discussion after video removal. Actual lifecycle/playback acceptance remains open.
- [x] Implement server-side access, moderation/suspension checks and private photo storage. Rollback permission tests passed; browser acceptance remains open.
- [ ] Verify mobile layout, removed-member access, link replacement, unavailable videos, replay visibility and photo-album conversation continuity.

Media remains discoverable through both its gathering and the Community Media area. The general feed may show a short linked announcement, but is not the only place to find a recording or album. Retain replays until the Host hides/removes them or the source becomes unavailable; do not promise permanent availability of externally hosted videos. Obtain permission to publish identifiable attendee photographs, and retain existing reporting/removal processes.

### Pilot photo participation — 7 October update

This supersedes the earlier blanket “uploads remain closed” notes. The founding cohort limits automatic Community creation, not participation in those Communities.

- [x] Eligible founding Community Hosts can select **Allow photos during the pilot** inside Photos. No separate five-tester or 24-hour restriction.
- [x] Active Community members can contribute even without a creator-cohort place, when the album allows members. Host-only and approval-required albums retain their rules.
- [x] Keep file, daily, album and storage limits; permission confirmation; private viewing; reporting and removal.
- [x] Admin can pause and reopen pilot sharing through the existing photo settings. Hosts cannot override an Admin pause.
- [x] Enforce Community suspension, global pilot pause, pilot expiry and failed cleanup at reservation and upload finalisation. Wider release retains its four evidence checks and cleanup gate; pilot testing does not mark those checks passed.
- [x] Rollback-only test `039` verifies non-creator member participation, Host-only restrictions, Admin pause/reopening, expiry and protected internal endpoints.
- [x] Keep uploads inside existing Host-created albums. Clearly identify the related gathering and destination album; members cannot create arbitrary albums or upload ungrouped photos.
- [x] Apply `20261007190000_community_photo_pilot_participation.sql` live. Typecheck, production build and rollback permission tests passed. No manual SQL run is needed. Post-test state remains zero albums/photos, zero passed production checks and an archived rehearsal Community.
- [ ] Complete actual file upload/delivery, desktop/mobile and cleanup recovery rehearsal. Source and SQL checks are not real binary acceptance.

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
