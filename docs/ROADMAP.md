# Her Africa Table — 30-Day Production Roadmap

## Mission

Her Africa Table is a trust-gated professional network for African women. Curated
events establish trust and introduce members; the platform preserves the network,
relationships, learning, and opportunities between events.

Community is the product's retention layer. The first production release must
prove this complete loop:

`event or referral → approved member → home community → introduction → Ask or Offer → relationship → outcome → trusted referral`

The community operating model and its staged expansion are maintained in
[`docs/COMMUNITY_PRODUCT_VISION.md`](./COMMUNITY_PRODUCT_VISION.md).
Live Community rehearsal results and remaining acceptance evidence are maintained
in [`docs/COMMUNITY_ACCEPTANCE_REPORT.md`](./COMMUNITY_ACCEPTANCE_REPORT.md).
The approved-host monetization task and its release boundaries are maintained in
[`docs/COMMUNITY_CREATOR_COMMERCE.md`](./COMMUNITY_CREATOR_COMMERCE.md).

The refined production process map is maintained in
[`docs/HAT_Process_Map_Developer_Spec.html`](./HAT_Process_Map_Developer_Spec.html).
It preserves all 14 long-term modules while separating the day-30 P0 release from
post-launch P1/P2 expansion.

## Definition of production ready

A feature is not complete merely because its screen exists. It is complete when:

- authorization is enforced by Postgres Row Level Security (RLS);
- loading, empty, validation, error, retry, and success states are implemented;
- keyboard, screen-reader, contrast, touch-target, and mobile behavior are checked;
- audit, moderation, support, and deletion implications are handled;
- analytics events and operational visibility exist;
- automated tests cover its critical permissions and state transitions;
- it works on localhost, a Vercel preview deployment, and production;
- the related migration and operational notes are committed to Git.

## Delivery principles

1. **Trust before growth.** No discovery or messaging feature ships without its
   blocking, reporting, rate-limit, and moderation behavior.
2. **Access is a database decision.** UI hiding is never the security boundary.
3. **Payments grant entitlements only after verification.** A redirect or browser
   callback is never treated as proof of payment.
4. **Manual operations are first-class.** Admin-approved registration uses the same
   entitlement model as automatic payment and retains a complete audit trail.
5. **One identity, many contexts.** Profiles, connections, conversations, and inboxes
   are platform-level; events are discovery and attendance contexts.
6. **Mobile web first.** The release is a responsive PWA-ready web application; a
   native app is a later decision based on measured retention.
7. **Feature flags protect launch.** Incomplete modules can be deployed safely but
   remain unavailable until their release gate passes.
8. **The interface teaches itself.** Use plain language, visible next steps, forgiving
   forms and familiar navigation so members and administrators do not need training.

## Table Guide and consent-led introductions — 11 August 2026

- [x] Add an optional, server-only AI concierge with an Admin off-switch
- [x] Exclude private messages, private contacts, safety evidence and Admin data
- [x] Add separate member consent for using the Guide and appearing in suggestions
- [x] Rank suggestions deterministically from public industry, location, interests
      and goals only after visibility, blocking and introduction boundaries pass
- [x] Add OpenAI moderation, privacy-preserving safety identifiers, `store: false`,
      daily limits and privacy-minimised usage metrics
- [x] Add an explicit member-confirmed handoff into the existing private support queue
- [x] Add a movable, minimisable member companion with page-aware guidance,
      remembered free placement, quiet mode and reduced-motion support
- [x] Name the member companion Nia and add inline activation, contextual prompts,
      a question box, clear conversation and provider-safe platform answers
- [x] Add a Super Admin AI connection test with specific key, access, billing and
      network diagnoses while keeping project secrets server-only
- [ ] Apply `20260811210000_table_guide_foundation.sql` in production Supabase
- [ ] Configure the OpenAI server secrets in Vercel and complete live acceptance
- [ ] Open the feature only after two-member consent and blocked-pair tests pass

## Member retention orchestration — 12 August 2026

- [x] Replace the dense Member Home dashboard with **Your Table Today**: one
      consent-led person suggestion, one relevant Community and one next action
- [x] Keep suggestions explainable and limit the new recommendation path to active,
      visible members who explicitly opted in and accept direct introductions
- [x] Let Nia answer inside her panel and offer one optional next-step link without
      claiming to send, join, register, approve or publish anything
- [x] Let Nia prepare introductions, Community posts, event preparation and high-level
      summaries only from the member-authorized context supplied by the server
- [x] Add plain-language discovery so members can search with phrases such as
      “women in trade finance in Nairobi” while preserving existing search permissions
- [x] Add a Community Host writing assistant for welcome posts, discussion prompts,
      event outlines and recaps; every result remains an editable private draft
- [x] Surface existing private relationship reminders as the most important follow-up
      when they are due
- [x] Retain the privacy-safe weekly Community briefings and the existing before/after
      event journey as the Community and event retention loops
- [ ] Apply `20260812130000_member_retention_orchestration.sql` in production Supabase
- [ ] Complete live acceptance with two opted-in members, one opted-out member, one
      blocked pair, one active Community, one past event and one Community Host

## Destination-aware invitations — 12 August 2026

- [x] Keep invitation entry on the Community Host or event page instead of adding
      another member navigation journey
- [x] Allow approved Community and event Hosts to invite one email with an optional
      personal note, while enforcing a database limit of 20 invitations per day
- [x] Deliver invitations to existing active members immediately through the existing
      notification outbox and Resend worker
- [x] Require Super Admin review before emailing a new or not-yet-active address
- [x] Bind every link to the recipient email, store only its SHA-256 token hash and
      expire it after 30 days
- [x] Preserve the destination through OTP sign-in, membership review and onboarding
- [x] Keep private Community admission, paid Community access, event capacity,
      ticket choice and payment as separate authoritative decisions
- [x] Add plain-language Admin approval, revoke controls and delivery visibility
- [ ] Apply `20260812150000_destination_aware_table_invitations.sql` in production
      Supabase
- [ ] Accept one active-member invitation, one new-member manual-review invitation,
      one private Community request, one event registration and one revoked link

## Community joining and Event-to-Community journey — 12 August 2026

- [x] Let a public Community choose immediate entry or Host approval for active
      Her Africa Table members
- [x] Keep every private Community approval-only at the database layer
- [x] Give owners a plain-language **Who can join?** control while moderators
      retain request-review tools
- [x] Notify Hosts and moderators when a request arrives and notify the member
      after approval or decline
- [x] Preserve Super Admin oversight of all Communities, joining settings,
      invitations, pending requests and membership decisions
- [x] Keep event ticket choice and free/manual registration on the event page
- [x] Show the issued event pass on the same journey after approval
- [x] Show a linked Community before and after an event without automatically
      enrolling an attendee
- [x] Keep automatic card payment inside verified Paystack checkout; returning
      to the platform never substitutes for webhook verification
- [ ] Apply `20260812030000_community_admission_and_event_companion.sql`
- [ ] Rehearse open join, approval join, decline, rejoin, event request, pass and
      linked-Community entry with separate member, Host, moderator and Admin accounts

## UI and usability workstream — every day

Usability is part of production readiness and continues alongside feature delivery:

### Platform-wide experience audit — 9 August 2026

- [x] Review the full signed-in member journey, secondary member tools and the
      Admin daily workspace at production desktop size
- [x] Reduce oversized secondary-page and Admin headings so the interface feels
      calmer, faster and less presentation-like
- [x] Remove the repeated Ask & Offer action and show its form only when a member
      chooses to create or edit a post
- [x] Replace internal release, payment-path, inventory, attribution and audit
      wording on member-facing preparing states with clear everyday language
- [x] Rename support topics and form prompts around what the member needs help with
- [ ] Complete the launch-device visual sign-off on Safari, Chrome, iPhone and
      common Android sizes with real member and Admin accounts
- [ ] Run five observed usability sessions with non-technical members and record
      completion time, hesitation points and misunderstood wording

- [x] Establish a refined visual system with consistent typography, colour, spacing,
      buttons, cards, forms, feedback states and responsive behavior
- [x] Replace the member-home product language with clear account status, task-based
      navigation and three obvious first actions
- [x] Simplify the Admin command centre into task groups with plain-language labels,
      queue counts and guided next steps
  - [x] Collapse specialist Admin modules into five plain-language work groups while
        preserving direct links to the correct tool
  - [x] Unify daily and specialist Admin workspaces behind one role-aware navigation
        shell, current-location cues and a five-action mobile dock
  - [x] Split the full operations workspace into permission-aware work areas so
        each visit loads only the data and controls needed for the selected job
- [x] Keep the member home focused on three primary actions and progressively disclose
      secondary membership, community, learning, benefits and support tools
  - [x] Remove repeated action cards and empty order clutter; reduce onboarding to one
        recommended checkpoint with the full five-step journey available on demand
  - [x] Add a plain-language Explore hub so members can understand every available
        and preparing benefit without expanding the Home page
- [x] Add a personalized next-best action to Member Home using feedback, messages,
      activity, onboarding progress and event-registration state
- [x] Upgrade member discovery with purpose, city and keyword filters, clearer
      introductions and explicit consent guidance before messaging
- [x] Add privacy-safe full member profiles so members can understand professional
      context before connecting, with private contacts revealed only after mutual consent
- [x] Make introductions intentional with an optional private context note that helps
      recipients decide before accepting, without exposing it to Admin or the directory
  - [x] Enforce daily, outstanding-request and quiet retry cooldown boundaries at the
        database layer across both current and legacy connection request paths
- [x] Add a private saved-profiles shortlist with optional personal reminders so members
      can revisit relevant people without sending premature connection requests
- [x] Add explainable member suggestions using only public goals, interests, location
      and industry, with transparent reasons and blocked-safe deterministic ranking
- [x] Add Super Admin-curated introductions with shared context, independent member
      consent, private decline handling, audit trails and messaging only after both accept
- [x] Give members database-enforced control over new connection availability with open,
      curated-only and paused modes respected by direct requests and Admin curation
- [x] Add private relationship notes, next steps and due follow-ups for accepted
      connections, surfaced on Member Home without exposing personal context to Admin
- [x] Let members privately record connection outcomes with voluntary anonymous
      category reporting, three-member suppression, test-account exclusion and no
      Admin access to names or notes
  - [x] Allow the owner to correct an outcome or withdraw anonymous sharing later
        without exposing prior private content in the audit trail
- [x] Create a private post-event journey joining feedback, recap, attendee
      reconnection, opportunities and ongoing conversation
  - [x] Refine Upcoming and Past Events into a clear two-view journey, prevent
        completed events from reappearing as upcoming, and give empty/error
        archives a calm explanation with an obvious recovery path
- [x] Keep optional member tools calm when content is sparse: collapse the Ask/Offer
      composer until requested and explain unpublished membership plans without blank space
- [x] Unify notifications, requests, unread conversations and event/account updates
      in one plain-language Activity centre
- [x] Complete a compact member visual pass for mobile hierarchy, touch targets,
      readable cards, restrained density and consistent page widths
  - [x] Split growing member networks into requests, active connections and private
        history views with plain-language empty states and progressively disclosed safety tools
  - [x] Refine Community into a calm member hub with separate personal and discovery
        areas, lightweight search, clear access states and a useful private-preview experience
- [x] Add a Super Admin-only, audited Launch Gate workspace for assigning owners,
      recording acceptance evidence and preventing metrics from masking operational blockers
- [x] Add database-enforced expiry, audited grants and immediate revocation for
      temporary Admin access; label time-bounded beta sessions in the Admin shell
- [x] Add contextual help and examples to every unfamiliar form without crowding the page
  - [x] Membership payment review, referrals and support requests include concise,
        accessible examples and privacy guidance
  - [x] High-risk Admin event, ticket, membership, learning and support forms explain
        operational consequences before saving
  - [x] Event programme, announcements, partners, gallery, menu, countdown,
        recaps, communities, Circles, learning, perks and referral forms now include
        concise, accessible publishing and privacy guidance
- [x] Replace browser prompts with accessible confirmation dialogs and inline validation
  - [x] All Admin payment, safety, privacy, event, membership and community
        decisions now use the shared accessible dialog pattern
  - [x] All member account, community, payment, networking and safety actions now use
        the shared accessible dialog pattern
- [x] Complete a content pass for jargon, technical errors and destructive-action wording
  - [x] All member workflows filter raw service errors and provide a clear retry,
        sign-in or support recovery path
  - [x] All Admin workflows filter database, storage and provider details, provide
        operational recovery guidance and use member-safe action wording
  - [x] Remove schema and migration instructions from operator-facing recovery states;
        retain implementation detail only in engineering runbooks
- [ ] Test the main member and administrator journeys with at least five non-technical users
- [ ] Pass keyboard, screen-reader, contrast, 200% zoom and mobile usability acceptance
  - [x] Add a CI accessibility preflight for keyboard order, image/frame text
        alternatives, global bypass navigation, focus visibility, reduced motion,
        high-contrast mode, mobile touch targets and Community landmarks
  - [x] Raise the Community room’s smallest navigation, action, metadata and form
        text to a readable baseline without increasing visual density
  - [ ] Record human VoiceOver, keyboard-only, 200% zoom and launch-device results
        using `docs/ACCESSIBILITY_ACCEPTANCE.md`
- [x] Replace environment-presence release signals with a fail-closed operational
      assessment that verifies public data, server authority, canonical URL,
      automatic-payment exposure and queued-email risk
- [x] Add a credential-safe authenticated Admin/member boundary smoke command that
      requires a test-tagged identity and always signs out
- [x] Confirm every core journey has clear loading, empty, success, error and recovery states
  - [x] Global and Admin route boundaries provide accessible loading, retry, support and
        not-found recovery without exposing technical details
  - [x] Core member and Admin mutations preserve visible outcomes while refreshing server
        data instead of discarding feedback through full-page reloads
  - [x] Event registration, onboarding, feedback and lesson progress use member-safe
        service errors and announced success or recovery states
  - [x] CI enforces route-boundary, safe-error and non-destructive-refresh contracts
- [ ] Run final visual QA across Safari, Chrome and common phone/tablet sizes

## Release scope

## Current delivery status — 26 July 2026

### Completed foundation

- [x] Prestige public landing page, live admin-managed event countdown, legal pages,
      and dedicated FAQ page
- [x] Supabase browser/server clients, request-level session refresh and protected
      member/admin routes
- [x] Single-method email OTP request and six-to-eight-digit verification interface
- [x] Pending member state, invite-based onboarding eligibility, admin roles and RLS
- [x] Private post-OTP membership request with a three-step member journey,
      purposeful applicant context, audited submission, calm pending state and
      Admin approve/decline review without granting access from identity alone
- [x] First public operational control: publish or hide the next-event countdown
- [x] Vercel production deployment from `main` and environment normalization
- [x] Retire temporary-password controls from public member and Admin sign-in;
      retain password credentials only for reserved automated test identities
- [x] Admin command center and database-backed launch roadmap view
- [x] Member review operations with audited approval, suspension and restoration
- [x] Add a plain-language, audited membership intake control for manual review,
      verified-invitation auto-entry and paused requests; email OTP never grants access
- [x] Onboarding foundation with public/private profile separation and consent records
- [x] Simplify onboarding to three plain-language stages with tap-to-select goals and
      interests; photo, languages, contact, business and social details stay optional
- [x] Event lifecycle foundation with venues, publishing states, registration modes,
      staff scopes, programme, speakers, announcements, sponsors and RLS
- [x] Audited admin event editor with protected online access details and automatic
      featured-event countdown synchronization
- [x] Public published-event listing and event-detail foundations
- [x] Audited programme/session and speaker operations, announcement publishing,
      sponsor management, and super-admin event staff assignment
- [x] Curated event menu CMS with courses, dishes, cultural context, dietary and
      allergen information, member feedback foundations, and audited moderation
- [x] Private event-media Storage, gallery albums, audited media publishing,
      accessible metadata, signed delivery URLs, and responsive public galleries
- [x] Provider-neutral registration commerce foundation with ticket inventory,
      minor-unit pricing, orders, manual review, and idempotent entitlement fulfillment
- [x] Server-only Paystack initialization, callback verification, raw-body webhook
      signature validation, amount/currency matching, and admin reconciliation visibility
- [x] Member order history and receipts, safe pending cancellation, refund requests,
      and audited manual/automatic refund lifecycle controls
- [x] Active-member directory, canonical connection pairs, in-person connection codes,
      request/accept/ignore operations, and accepted-connection private contact gates
- [x] Bilateral blocking enforcement, connection removal, member reporting with
      evidence snapshots, moderator queue, outcomes, and audit history
- [x] Accepted-connection private conversations, realtime messages, pagination-ready
      history, unread tracking, rate limits, deletion, and report-scoped message evidence
- [x] Private member support requests, threaded replies, priority and assignment
      controls, lifecycle states, rate limits, realtime updates, and audit history
- [x] Member visibility settings, portable JSON export, deletion cooling-off and
      cancellation, Super Admin review, anonymization, access revocation and retention boundaries
- [x] Realtime in-app notifications, member delivery preferences, transactional email
      outbox, idempotent Resend worker, retries, admin monitoring and database health endpoint
- [x] GitHub Actions quality gate, repository contract/secret checks, reproducible local
      Supabase configuration, migration reset, and pgTAP authorization boundary tests
- [x] Feature-gated Communities foundation with official/private membership, invitations,
      host roles, private feeds, rate limits, report-scoped moderation and audited release control
- [x] Feature-gated Learning foundation with private lessons, user-scoped progress,
      event/free/manual access and course purchases through the shared payment engine
- [x] Feature-gated vouched invitations with campaign limits, private review,
      email delivery, existing invite-gate integration and claimed/activated attribution
- [x] Feature-gated membership plans, renewal periods, grace/dormant reconciliation,
      shared Paystack/manual fulfillment and production-safe tagged test identities
- [x] Feature-gated deterministic Circles with explicit opt-in, balanced cohort
      generation, blocked-pair safety, human review, private prompts and responses
- [x] Feature-gated partner benefits with atomic inventory, private single-use codes,
      expiry release, member limits and an audited admin redemption ledger
- [x] Member/admin responsive UI refinement with focused navigation, a modular member
      launcher, earlier mobile authentication actions and scroll-safe admin controls
- [x] Privacy-safe server analytics with test-account separation, admin-only aggregates,
      editable audited launch thresholds and a production readiness scorecard
- [x] Repeatable production smoke suite, anonymous route-boundary checks, mobile public
      UAT, deployment health diagnostics and a manually gated live-smoke workflow
- [x] Launch-spine UX with a personalized next-event seat state on Member Home and a
      lightweight Admin decision cockpit that defers specialist operations until opened
- [x] Consent-based founding cohort activation with event eligibility, deliberate
      invitations, guided introductions, blocked-pair filtering, focused Ask & Offer
      follow-up, automatic read-only closure and Admin cohort-health operations
- [x] Active-member profile editing with required-completion preservation, avatar
      replacement, audited updates and private-contact sharing preferences
- [x] Confirmed-guest attendee discovery with explicit per-event opt-in, blocked-pair
      filtering, no private-contact projection and consent-gated connection requests
- [x] Direct connection requests from founding-room introductions with pending and
      accepted relationship states visible inside the room
- [x] Layperson-first core member shell with consistent current-page navigation,
      compact five-action mobile dock, people-first directory ordering, simplified
      empty messages and recoverable non-technical error states
- [x] Align the product vision around a trust-led Community operating system,
      staged from the Nairobi Founding Table to chapters, Circles, interest
      communities and eventually approved member-led communities

### Community operating system — current workstream

- [x] Make Community a first-class member destination on desktop and mobile
- [x] Establish an Overview, Conversations, Members, Gatherings and Resources
      information architecture for every community
- [x] Add structured conversation categories, comments, thoughtful appreciation,
      host pinning, private saved posts and member-controlled thread following
- [x] Make conversation the primary room experience with plain-language search,
      topic and activity sorting, personal Following/Saved/My views, deep links,
      useful composer guidance and a responsive recent-room snapshot
- [x] Add a privacy-safe community member roster with consent-based profile and
      connection paths
- [x] Connect host-curated events and learning resources to each community with
      member-only projections and audited Host controls
- [x] Add Community-hosted event proposals for approved owners and Hosts: private
      draft, Community scope, host and venue details, capacity, visibility and
      a fixed free launch tier, followed by an audited Admin approval that creates
      the canonical event and links it to the Community. Keep public and paid
      publication fail-closed until safety, refunds and creator settlement pass.
- [x] Apply `20260809140000_community_hosted_event_proposals.sql` and complete a
      five-account acceptance: Host draft, Admin change request, resubmission,
      approval, member-only discovery, one-seat registration and non-member denial
- [x] Add an event-first path for active members who do not own a Community:
      private proposal carousel, free public launch tier, Admin publication,
      manually reviewed registration and separate attendee consent for a possible
      follow-up Community
- [ ] Apply `20260811230000_member_public_event_proposals.sql`, run
      `npm run ops:community:member-events-readiness` and complete the tagged
      member → Admin → anonymous visitor → confirmed attendee acceptance path
- [x] Add the member-hosted past-event archive: private Host recap submission,
      consent-confirmed Host/attendee image offers, Admin publication review,
      enduring public event details and one approved Community continuation link
- [ ] Apply `20260812010000_member_event_archives.sql` and verify Host, attendee,
      anonymous, rejected-media, published-gallery and Community-link boundaries
- [x] Connect released Circle cycles to relevant communities with audited Host
      curation, member-only own-assignment context and no roster or matching-data access
- [x] Rewrite the Community journey in plain language across discovery, joining,
      posting, events, learning, Circles, notifications and leader controls
- [x] Refine Community mobile hierarchy with restrained headings, readable body
      text, fully visible navigation and full-width primary actions
- [x] Add per-community reply and briefing preferences plus a restrained,
      privacy-safe weekly briefing with idempotent delivery batches
- [x] Add the first Host workspace for admission, member roles, unanswered Asks,
      safety counts, gatherings, resources and seven-day participation signals
- [x] Extend Host operations with incomplete introductions, retention and
      privacy-thresholded outcome trends
- [x] Replace static room guidance with a private member start path for
      introductions, useful contributions, mutual relationships and gatherings
- [x] Add one private five-step Table Journey from profile and Community
      introduction to a gathering, trusted connection and deliberate follow-up;
      keep it free of public points, rankings and activity quotas
- [x] Add a Community-scoped Host welcome queue for recent members with one
      confirmed, idempotent welcome, notification preferences, rate limits and
      no private contact, message, note or cross-Community visibility
- [x] Turn Host-curated events into a clear Community calendar with exact
      timezone display, standard calendar export, private one-day/one-hour
      reminders, reschedule safety and production worker delivery
- [x] Add plain-language Community Quick Check-ins with two-to-six choices,
      changeable one-member answers, three-response result privacy, creation
      limits and creator/Host closing without voter identities
- [x] Add one member-wide search for visible professional profiles, joined
      Communities and conversations, published events and released learning,
      with block, membership and visibility boundaries enforced in the database
- [x] Unify reported Community posts and Quick Check-ins in a report-scoped
      Admin safety queue with private member reporting, captured evidence,
      immediate containment, audited decisions and no voter-answer access
- [x] Add member-controlled invitation decline, request cancellation and safe
      departure with preserved contributions, stopped reminders, clear refund
      wording and rejoining that honours an existing paid access period
- [x] Add audited Community pause, host replacement, controlled reopening and
      closure with member notices and preserved content, finance and membership records
- [x] Refine the Community landing and directory into separate “Your rooms” and
      discovery journeys, with compact host admission and search-ready empty states
- [x] Add approved-owner Community identity controls for a square icon, wide
      cover, short tagline and restrained platform-approved accent palette
- [x] Add one-per-conversation private image, PDF or secure-link attachments
      with accessible descriptions, immutable Storage objects and report evidence
- [x] Add controlled 30-minute conversation editing, a visible Edited marker,
      five-revision limit and prior-version access only inside report evidence
- [x] Add private per-member Community read state, calm new-activity markers,
      a “New for you” view and an explicit member-controlled caught-up action
- [x] Carry private Community activity into the global member shell and room
      directory with restrained count badges, priority ordering and clear return actions
- [x] Replace the fixed recent-conversation ceiling with stable cursor pagination,
      page-scoped replies and private media, twenty-item loading and a three-pin limit
- [x] Add an owner-controlled, shareable Community About page with a clear
      audience, benefits, host introduction, access price and next gathering;
      keep posts, member identities, private event details and storage paths private
- [ ] Apply `20260803090000_community_public_profiles.sql` in production Supabase
      and complete signed-out, member, owner and Draft-rollback acceptance
- [ ] Apply `20260803130000_table_journey_and_host_welcome.sql` in production
      Supabase and complete member, Host, cross-Community and duplicate-welcome
      acceptance
- [ ] Apply `20260803170000_community_event_reminders.sql` in production
      Supabase and test reminder persistence, event rescheduling, cron delivery,
      deduplication and registration separation
- [ ] Apply `20260803210000_community_check_ins.sql` in production Supabase and
      test member isolation, three-response privacy, answer changes, expiry,
      creation limits and creator/Host closure
- [ ] Apply `20260804010000_member_global_search.sql` in production Supabase and
      test paused profiles, bilateral blocks, Community membership isolation,
      publication gates, deep links and result limits
- [ ] Apply `20260804050000_community_check_in_safety.sql` in production Supabase
      and test report authorization, evidence boundaries, duplicate prevention,
      Moderator roles, hide/dismiss outcomes and launch-readiness counts
- [ ] Apply `20260804090000_community_membership_lifecycle.sql` in production
      Supabase and test invitation decline, request cancellation, departure and rejoin
- [ ] Apply `20260804130000_community_host_offboarding.sql` in production Supabase
      and rehearse pause, replacement, reopening and record-preserving closure
- [ ] Apply `20260804170000_order_rls_recursion_fix.sql` and
      `20260804210000_community_order_scope.sql` in production Supabase before
      host-visible Community order acceptance
- [ ] Apply `20260802010000_community_identity_and_media.sql` in production
      Supabase
- [ ] Apply `20260802050000_community_post_editing.sql` in production Supabase
- [ ] Apply `20260802090000_community_member_read_state.sql` in production
      Supabase
- [ ] Apply `20260802130000_community_activity_navigation.sql` in production
      Supabase
- [ ] Apply `20260802170000_community_feed_pagination.sql` in production
      Supabase
- [ ] Apply `20260802210000_community_circle_links.sql` in production Supabase
- [ ] Test Community and Circles feature-flag gating, Host link/unlink auditing,
      member opt-in routing and own-assignment-only Circle visibility
- [ ] Test multi-page pinned/unpinned ordering, duplicate prevention, protected
      media delivery and blocked-member filtering with at least 45 conversations
- [ ] Test join-time baseline, own-activity exclusion, block filtering and
      caught-up behavior with two real member accounts
- [ ] Test edit expiry, pinned-conversation protection, revision limits and
      report-scoped prior-version evidence with two real member accounts
- [ ] Test owner-only branding, member-only signed delivery, blocked-member
      filtering, failed-upload rollback and post-removal media revocation
- [x] Create two ordinary members, one host candidate and one backup moderator as
      tagged production-safe test identities, plus a repeatable provisioning command
- [x] Add one five-role Community scale command that verifies two members, Host,
      backup Moderator, Super Admin safety access, 45+ conversations, stable
      cursor pagination, pin ordering and anonymous isolation
- [x] Add database-enforced Community publication acceptance with eight audited
      checks, required host coverage and a controlled Draft rollback
- [ ] Complete Nairobi Founding Table acceptance before opening another chapter

### Community creator commerce — controlled workstream

- [x] Define approved host plans with price, duration, platform fee, moderator
      limit, feature entitlements, status and audited Super Admin management
- [x] Add per-community plan grants, versioned host agreement acceptance and
      payout-readiness review
- [x] Add free/paid member offers with Automatic, Manual review and Closed
      processing modes
- [x] Preserve host admission as a separate gate before paid checkout
- [x] Extend the shared Paystack/manual order engine with idempotent community
      access periods and entitlements
- [x] Record platform fee and creator share in an order-linked held-revenue ledger
- [x] Add a plain-language host workspace for pricing, readiness, paying members
      and held earnings
- [x] Add Super Admin plan, grant, payout-readiness and manual-payment controls
- [x] Add approved-owner self-service Starter/Pro selection with independent
      Automatic, Manual review and Closed host-billing controls
- [x] Fulfill verified host-plan orders into an active subscription and
      `community_host_tools` entitlement through the shared payment engine
- [x] Revoke purchased host tools and pause paid offers on verified reversal
- [x] Apply `20260801010000_community_creator_commerce.sql` in production Supabase
- [x] Apply `20260801050000_community_host_self_service_billing.sql` in
      production Supabase
- [ ] Apply `20260801090000_community_host_subscription_lifecycle.sql` in
      production Supabase
- [ ] Apply `20260801130000_community_financial_reconciliation.sql` in
      production Supabase
- [ ] Seed and review the Starter and Pro host plans
- [ ] Complete two-member admission, Automatic, Manual review, Closed, duplicate
      and reversal acceptance while the feature flag remains off
- [ ] Complete host terms, refund, tax, payout and platform-fee legal review
- [ ] Enable `community_creator_commerce` only after merchant and operating sign-off
- [x] Add host self-service plan selection and one-period checkout
- [x] Add verified one-period renewal and next-term plan changes with a single
      scheduled subscription, configurable grace, owner reminders and audited
      reconciliation
- [x] Add member-facing Community host applications with guided purpose,
      audience, admission and safety questions; status tracking; revision and
      withdrawal
- [x] Add an audited Super Admin host review queue where approval creates a
      private draft community and active owner without bypassing release checks
- [ ] Apply `20260801170000_community_host_applications.sql` in production
      Supabase
- [ ] Complete submit → review → changes requested → resubmit → approve
      acceptance with one active member and one Super Admin
- [x] Convert host-plan feature labels into database-enforced entitlements for
      advanced insights, host reminders and moderator seats
- [x] Add a plain-language Host tools panel with plan status, included
      capabilities, moderator usage and upgrade paths
- [x] Enforce moderator limits on invitation acceptance and every role/status
      transition, defaulting safely to one moderator without an active plan
- [ ] Apply `20260801210000_community_host_plan_entitlements.sql` in production
      Supabase
- [ ] Test Starter → Pro → grace → expired capability transitions, including
      direct RPC attempts that bypass the interface
- [x] Pause new paid checkout during grace, revoke expired host tools and pause
      published paid offers when the host plan lapses
- [ ] Add provider-authorized automatic recurring charges only after merchant
      recurring-billing approval and explicit host consent
- [x] Add append-only provider-fee, tax, refund, dispute, reserve and settlement
      reconciliation with signed Paystack financial-event processing
- [x] Add host-readable creator statements and audited Admin draft → approve →
      paid settlement batches with balance revalidation
- [x] Add downloadable host statement CSV exports while clearly withholding a
      legal tax-invoice claim until the approved tax format is available
- [ ] Add automatic Paystack split settlement only after payout acceptance passes

### Heavy work remaining before production launch

1. **Production authentication and email delivery**
   - Configure the Supabase numeric OTP template, production SMTP, verified sender
     domain and Resend worker schedule.
   - [x] Retire the public temporary-password interface; rotate remaining real-person
     passwords after final member and Admin OTP acceptance.
2. **Production database and environment parity**
   - Verify every forward-only migration is present in production rather than relying
     on manual recollection.
   - [x] Add a Super Admin database readiness manifest that checks required tables
     and secure actions by capability without reading member data.
   - Confirm Vercel Production variables, Paystack webhook secrets, notification
     credentials and scheduled jobs against the readiness checklist.
3. **Real-account acceptance**
   - Run pending → onboarding → active with two real member accounts and one scoped
     staff account.
   - Complete the event, registration, manual payment, connection, messaging, support,
     privacy and renewal loops using auditable production-safe test identities.
4. **Release controls and incident readiness**
   - Require both application and database checks before production deployment.
   - Rehearse payment reconciliation, notification retry, backup/restore, account
     deletion and incident escalation.
   - [x] Implement auditable launch-gate ownership, evidence and no-go status controls.
5. **Human usability and device acceptance**
   - Test with at least five non-technical users.
   - Complete keyboard, screen-reader, 200% zoom, iPhone Safari, Android Chrome and
     tablet acceptance with recorded evidence.

### Immediate release gate

- [ ] Configure the Supabase email template with `{{ .Token }}` and disable magic-link
      wording
- [ ] Configure Supabase custom SMTP for Auth OTP; public Resend DNS records for the
      temporary `caseready.africa` sender are visible, but provider status and inbox
      delivery still require production confirmation
- [ ] Seed and verify the Super Admin account, then test member and admin OTP end to end
- [x] Apply the onboarding/admin migration in production Supabase
- [ ] Complete a real pending → onboarding → active acceptance test
- [x] Apply `20260809100000_membership_application_journey.sql` in production
      Supabase and verify its private table and Admin projection are available
- [ ] Apply `20260811120000_membership_intake_modes.sql` in production Supabase,
      then run the three-mode dummy-account acceptance rehearsal
- [ ] Apply `20260811150000_simplified_member_onboarding.sql` in production Supabase,
      then complete onboarding without a photo, language or private contact detail
- [ ] Accept a new OTP identity through request, Admin decision, onboarding and
      active membership
- [x] Add a forward-only onboarding migration for city, languages, referral source,
      business/website fields, profile completion and normalized member goals
- [x] Apply `20260721120000_onboarding_v2.sql` in production Supabase
- [x] Convert onboarding to progressive save
- [ ] Verify interruption/resume, avatar replacement and activation behavior
- [x] Apply `20260721160000_events_foundation.sql` in production Supabase
- [x] Apply `20260721200000_event_content_operations.sql` in production Supabase
- [ ] Apply `20260721230000_event_menu_operations.sql` in production Supabase
- [ ] Apply `20260722090000_event_gallery_operations.sql` in production Supabase
- [ ] Apply `20260730210000_expiring_admin_access.sql` in production Supabase
- [ ] Apply `20260722130000_registration_commerce_foundation.sql` in production Supabase
- [ ] Apply `20260722170000_paystack_processing.sql` in production Supabase
- [ ] Apply `20260722200000_registration_lifecycle.sql` in production Supabase
- [ ] Apply `20260722230000_member_network_foundation.sql` in production Supabase
- [ ] Apply `20260723090000_network_safety_foundation.sql` in production Supabase
- [ ] Apply `20260723130000_private_messaging.sql` in production Supabase
- [x] Apply `20260723170000_support_operations.sql` in production Supabase
- [ ] Apply `20260723210000_privacy_account_lifecycle.sql` in production Supabase
- [ ] Apply `20260724090000_notification_operations.sql` in production Supabase
- [ ] Apply `20260725090000_communities_foundation.sql` in production Supabase
- [ ] Apply `20260730230000_community_hub_foundation.sql` in production Supabase
- [ ] Apply `20260731010000_structured_community_conversations.sql` in production Supabase
- [ ] Apply `20260731050000_community_programming_and_host_health.sql` in production Supabase
- [ ] Apply `20260731100000_community_notification_preferences_and_briefings.sql`
      in production Supabase
- [ ] Apply `20260731130000_community_continuity_and_outcome_signals.sql`
      in production Supabase
- [ ] Apply `20260731160000_community_member_start_path.sql` in production
      Supabase
- [ ] Apply `20260731190000_community_release_acceptance.sql` in production
      Supabase
- [ ] Apply `20260731230000_community_comment_removal.sql` in production
      Supabase
- [ ] Apply `20260801010000_community_creator_commerce.sql` in production
      Supabase
- [ ] Apply `20260801050000_community_host_self_service_billing.sql` in
      production Supabase
- [ ] Apply `20260802010000_community_identity_and_media.sql` in production
      Supabase
- [ ] Apply `20260802050000_community_post_editing.sql` in production Supabase
- [ ] Apply `20260802090000_community_member_read_state.sql` in production
      Supabase
- [ ] Apply `20260802130000_community_activity_navigation.sql` in production
      Supabase
- [ ] Apply `20260802170000_community_feed_pagination.sql` in production
      Supabase
- [ ] Apply `20260802210000_community_circle_links.sql` in production Supabase
- [ ] Apply `20260803010000_production_database_readiness.sql` in production
      Supabase and review every capability in Admin → Release
- [x] Add a database-enforced module opening gate for Communities, Creator
      Commerce, Learning, Referrals, Membership, Circles and Partner benefits,
      with Super Admin evidence, ownership and always-available emergency pause
- [ ] Apply `20260803050000_module_release_acceptance.sql` in production Supabase,
      then complete every module card in Admin → Release before enabling its flag
- [ ] Apply `20260804090000_community_membership_lifecycle.sql`,
      `20260804130000_community_host_offboarding.sql`,
      `20260804170000_order_rls_recursion_fix.sql` and
      `20260804210000_community_order_scope.sql` in production Supabase
- [ ] Complete Creator Commerce admission/payment/entitlement/payout-boundary
      acceptance and deliberately enable its feature flag
- [ ] Complete Communities host/moderation acceptance and deliberately enable its P1 flag
- [x] Add a fail-closed Community rehearsal mode that admits only active tagged
      test accounts while real-member Community access remains disabled
- [ ] Apply `20260805010000_community_acceptance_mode.sql`, run the four module
      checks with the existing two-member/host/moderator cohort, record evidence,
      then end rehearsal before deciding whether to enable Communities
- [ ] Apply `20260725130000_learning_foundation.sql` in production Supabase
- [ ] Complete Learning content/access/payment acceptance and deliberately enable its P1 flag
- [ ] Apply `20260725170000_referrals_vouched_invitations.sql` in production Supabase
- [ ] Complete referral delivery/claim/activation acceptance and deliberately enable its P1 flag
- [ ] Apply `20260725210000_membership_renewal_lifecycle.sql` in production Supabase
- [ ] Complete membership manual/Paystack/renewal acceptance and deliberately enable its flag
- [ ] Apply `20260726090000_circles_deterministic_matching.sql` in production Supabase
- [ ] Complete Circle matching/privacy/facilitation acceptance and deliberately enable its flag
- [ ] Apply `20260726130000_partner_perks_redemption.sql` in production Supabase
- [ ] Complete partner terms/inventory/redemption acceptance and deliberately enable its flag
- [ ] Apply `20260726170000_privacy_safe_analytics.sql` in production Supabase
- [ ] Review readiness targets and complete a tagged-test versus real-member metric pass
- [ ] Complete the non-technical-user UI workstream and record usability acceptance evidence
  - [x] Implement layperson-first task grouping, progressive disclosure, plain-language
        form guidance and recoverable journey states
  - [ ] Record acceptance evidence from five non-technical users and address findings
- [ ] Verify the Resend sending domain and configure the production email worker schedule
- [x] Add a plain-language Admin email readiness checklist that identifies each
      missing deployment dependency without revealing a credential
- [ ] Create a draft event, publish it, and verify anonymous/draft/staff boundaries
- [x] Add automated authentication, authorization and migration tests to CI
- [ ] Require both application and database GitHub checks before production deployment
- [ ] Apply `20260728130000_launch_gate_evidence.sql` in production Supabase
- [x] Add the Super Admin Launch Gate workspace and evidence runbook
- [ ] Apply `20260728170000_member_profile_view.sql` in production Supabase

Public sign-in is OTP-only. Reserved `.invalid` test accounts retain isolated password
credentials for automated acceptance; real member and Admin OTP must pass end to end.

### P0 — launch-critical

- Public landing page, sign-in, legal pages, waitlist/contact entry
- Email OTP authentication
- Ticket/payment registration and admin-controlled manual registration
- Member onboarding and public/private profile fields
- Event home, programme, announcements, menu, gallery, sponsors
- [x] Event attendee directory and cross-event network directory
- QR and manual-code connection requests
- Accepted connections and private messaging
- Membership status, renewal state, visibility pause, blocking and reporting
- Admin CMS, event staff scopes, moderator queue and support inbox
- Email notifications, operational logs, analytics and release monitoring
- Account export/deletion workflow and retention policy implementation

### P1 — production modules enabled after the core loop passes

- Asks & Offers
- Communities and community moderation
- Post-event feedback and Past Events
- Courses, lessons, purchases and progress
- Referrals and vouched invitations
- Circles with deterministic rule-based matching
- Account-only membership and renewal checkout
- Partner perks and controlled redemption

### P2 — advanced modules, schema-compatible but feature-flagged initially

- AI-assisted Circle and member recommendations
- Sponsor curated-introduction workflow
- Sponsor self-service performance dashboard
- Advanced gamification and connector badges
- State of the Network reporting
- Native application evaluation

## Thirty-day execution plan

### Days 1–3 — production foundation

**Day 1: source of truth and environments**

- Commit roadmap, architecture, auth setup, and release checklist.
- Establish `main` as production and `codex/*` branches as preview deployments.
- Confirm Vercel Production, Preview, and Development environment scopes.
- Link the Supabase project without committing credentials.
- Add CI for typecheck, build, migration checks, and tests.
- Create feature-flag and platform-settings conventions.

**Day 2: database foundation**

- Create enums, timestamp helpers, profiles, private profile contacts, roles,
  permissions, invitations, registrations, memberships, events, and audit logs.
- Add foreign keys, unique constraints, indexes, status-transition constraints,
  `created_at`/`updated_at`, soft-deletion metadata, and idempotency keys.
- Enable RLS on every exposed table before adding data.
- Create private/public Storage buckets and initial policies.

**Day 3: authentication and authorization skeleton**

- Implement Supabase SSR sessions and request-level session refresh.
- Add email OTP request and numeric-code verification.
- Add pending, active, dormant, suspended, and deleted access states.
- Seed the first Super Admin through an auditable migration/operation.
- Test anonymous, member, dormant, event-staff, moderator, and super-admin boundaries.

**Milestone:** a user can authenticate locally and in preview, but access is granted
only when an approved registration/membership record exists.

### Days 4–7 — onboarding, profiles, and admin identity

**Day 4:** premium public site, authentication screens, OTP states, callback handling,
support link, legal placeholders, and redirect hardening.

**Day 5:** onboarding wizard: photo, name, role, company, industry, country, bio,
interests, social links, consent, and community-guideline acceptance.

**Day 6:** profile display/edit, public/private field split, completeness indicator,
visibility pause, member QR code and manual connect code.

**Day 7:** admin shell, role assignment, event-staff scopes, incomplete-onboarding queue,
member approval/suspension, and audit log viewer.

**Milestone:** an approved member can complete onboarding; an unapproved account cannot
enter the member product; an admin action is attributable and reversible where safe.

### Days 8–11 — events and content operations

**Day 8:** event lifecycle, venues, ticket types, event membership, upcoming/past views,
home countdown cards and event selection.

**Day 9:** programme days/sessions/speakers, announcements, admin ordering and publishing.

**Day 10:** menu courses/items, ingredients, cultural history, embassy note, ratings,
favorites, comments, and moderation.

**Day 11:** galleries, media metadata, signed uploads, optimized delivery, sponsors,
featured content and Past Events skeleton.

**Milestone:** event staff can manage only assigned events; a member sees content for
events and platform contexts allowed by policy.

### Days 12–15 — registration, Paystack, and manual processing

**Day 12:** orders, line items, prices in integer minor units, currencies, ticket
inventory, reservations, receipts, and provider-neutral payment interface.

**Day 13:** Paystack initialization, callback UX, signed webhook verification,
idempotent event handling, reconciliation status, and failure/retry behavior.

**Day 14:** admin-controlled payment modes: automatic, manual review, and closed/waitlist;
manual reference capture, approval, rejection, notes, and audit events.

**Day 15:** entitlement issuance, invite delivery, duplicate-payment prevention,
refund/cancellation foundations, reconciliation report, and checkout tests.

**Milestone:** both a verified Paystack webhook and an audited manual approval can grant
the same entitlement exactly once; the browser cannot grant itself membership.

### Days 16–19 — discovery and connections

**Day 16:** event directory with search/filter and privacy-safe member cards.

**Day 17:** network directory for active paid members, pagination, visibility pause,
dormant exclusions, and gated contact fields.

**Day 18:** QR scanner, QR profile preview, manual connect code, connection request,
accept/ignore, duplicate-pair prevention, notifications, and rate limits.

**Day 19:** My Connections, private notes, relationship removal, blocking, mutual
visibility rules, and permission tests.

**Milestone:** two real accounts can connect through QR or code; private fields appear
only after acceptance; blocking immediately closes all prohibited paths.

### Days 20–22 — messaging, safety, and support

**Day 20:** one conversation per accepted pair, realtime messages, pagination,
unread state, delivery state, attachment policy, and inactive-user email digest.

**Day 21:** report profile/message/post/community, reason taxonomy, evidence snapshot,
block-from-thread, moderator queue, warn/suspend/remove outcomes, and appeal notes.

**Day 22:** report-scoped moderator content access through a secure server operation,
moderation access logging, support tickets, assignment, replies, SLA state, and closure.

**Milestone:** admins cannot browse private messages; a moderator can access only the
reported context, and every access is recorded.

### Days 23–25 — ongoing member value

**Day 23:** Asks & Offers, categories, industries, responses, open/closed states,
moderation, filters and highlights on Home.

**Day 24:** official/private Communities, requests, invitations, membership roles,
posts, moderation and report-triggered community access.

**Day 25:** post-event feedback, Past Events, recap content, feedback prompts,
aggregate reporting and testimonial-consent handling.

**Milestone:** the product offers a useful weekly action when no event is imminent.

### Days 26–27 — growth, learning, and retention modules

**Day 26:** courses, lessons, files/video metadata, access rules, course purchases,
event bundles, enrollments, progress, completion and admin analytics.

**Day 27:** vouched invitations, referral campaigns, referral attribution,
account-only membership, renewals, active/dormant transitions, deterministic Circles,
monthly prompts, partner perks and single-use redemption controls.

**Milestone:** each module is production-complete or remains behind a disabled feature
flag with no navigation exposure and no unsafe partial access.

### Days 28–30 — hardening and launch

**Day 28: security and data**

- RLS adversarial test suite and role-boundary review
- webhook replay/signature tests and rate-limit review
- Storage policy, private-field and secret exposure audit
- account export/deletion, retention and backup-restore rehearsal
- Kenya Data Protection Act/POPIA applicability checklist for legal review

**Day 29: experience and operations**

- iPhone Safari and Android Chrome real-device passes
- keyboard/screen-reader/contrast and 44px touch-target review
- slow-network, offline, camera-denied and email-delivery fallback tests
- admin runbook, support runbook, incident response and payment reconciliation rehearsal
- performance budgets, error monitoring and synthetic health checks

**Day 30: controlled launch**

- production content and first event verification
- seed Super Admin and scoped staff accounts
- smoke test using real member and moderator accounts
- release checklist sign-off and database backup
- enable P0 feature flags, monitor, and document launch decisions

## Feature acceptance map

| Product area   | Minimum production acceptance                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | Email OTP works locally and in production; temporary passwords are retired; redirects are allow-listed; sessions are cookie-based and refreshed safely. |
| Registration   | Authentication does not imply membership; automatic and manual approvals issue one auditable entitlement.                                               |
| Profiles       | Public and private data are separated; private contacts require an accepted connection; pause mode removes discovery.                                   |
| Events         | Staff access is event-scoped; drafts are not member-visible; upcoming/past transitions are deterministic.                                               |
| Payments       | Amounts use integer minor units; webhooks are signed and idempotent; browser callbacks never mark orders paid.                                          |
| Connections    | Canonical user pairs prevent duplicates; ignore is quiet; blocking is immediate and mutual.                                                             |
| Messaging      | Only accepted, unblocked pairs can send; pagination and rate limits exist; report evidence is preserved.                                                |
| Moderation     | Report-scoped access is server-mediated and audited; moderator roles cannot access finances or event editing.                                           |
| Communities    | Membership and moderation are policy-enforced; private content is unavailable without membership or report escalation.                                  |
| Courses        | Lesson assets are private/signed; access rules and purchases are server-enforced; progress is user-scoped.                                              |
| Notifications  | Preferences are grouped; transactional messages cannot be disabled; deliveries are logged and retry-safe.                                               |
| Invitations    | Links are email-bound and hashed; external addresses require review; destination admission and payment boundaries remain authoritative.                  |
| Admin          | Every sensitive action is permission-checked and audited; no service key reaches browser code.                                                          |
| Analytics      | Metrics use documented definitions and exclude test/seed activity.                                                                                      |
| Deletion       | Identity removal, retained messages, financial records and audit evidence follow a documented retention policy.                                         |

## Success metrics

- Paid-to-completed-profile conversion
- Monthly active members and 30-day post-event return rate
- Connection requests and accepted connections per attendee
- Percentage of accepted connections with at least one message
- Asks/Offers posted, responded to and closed
- Circle and Community monthly participation
- Vouched invite approval and activation conversion
- Cross-event retention and renewal rate
- Post-event feedback completion and average score
- Sponsor/partner introduction and redemption fulfillment
- Support first-response/resolution time and moderation resolution time

## Decisions to close during implementation

These do not block Day 1 schema work but must be recorded before the related module
is enabled:

- final production domain and sender-email domain;
- first event name, venue, dates, ticket types, currencies and capacity;
- Paystack merchant activation and international-payment status;
- legal controller entity, privacy contact, retention periods and primary jurisdictions;
- membership and renewal prices, refund/cancellation terms and tax treatment;
- moderation staffing, response targets and escalation owner;
- media consent and testimonial reuse terms;
- course video hosting limits and partner redemption reconciliation process.
