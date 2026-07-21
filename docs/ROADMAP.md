# Her Africa Table — 30-Day Production Roadmap

## Mission

Her Africa Table is a trust-gated professional network for African women. Curated
events establish trust and introduce members; the platform preserves the network,
relationships, learning, and opportunities between events.

The first production release must prove this complete loop:

`registration → verification → onboarding → event access → discovery → connection → ongoing value`

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

## Release scope

## Current delivery status — 21 July 2026

### Completed foundation

- [x] Prestige public landing page, live admin-managed event countdown, legal pages,
  and dedicated FAQ page
- [x] Supabase browser/server clients, request-level session refresh and protected
  member/admin routes
- [x] Single-method email OTP request and six-digit verification interface
- [x] Pending member state, invite-based onboarding eligibility, admin roles and RLS
- [x] First public operational control: publish or hide the next-event countdown
- [x] Vercel production deployment from `main` and environment normalization
- [x] Temporary Supabase password access for pre-SMTP administrator testing
- [x] Admin command center and database-backed launch roadmap view
- [x] Member review operations with audited approval, suspension and restoration
- [x] Onboarding foundation with public/private profile separation and consent records

### Immediate release gate

- [ ] Configure the Supabase email template with `{{ .Token }}` and disable magic-link
  wording
- [ ] Configure production SMTP and verify sender-domain authentication
- [ ] Seed and verify the Super Admin account, then test member and admin OTP end to end
- [x] Apply the onboarding/admin migration in production Supabase
- [ ] Complete a real pending → onboarding → active acceptance test
- [ ] Add a forward-only onboarding migration for city, languages, referral source,
  business/website fields, profile completion and normalized member goals
- [ ] Convert onboarding to progressive save and verify interruption/resume behavior
- [ ] Add automated authentication, authorization and migration tests to CI

Temporary password access allows administrator testing to continue while production
email delivery is configured. Email OTP must still pass end to end before public beta.

### P0 — launch-critical

- Public landing page, sign-in, legal pages, waitlist/contact entry
- Email OTP authentication
- Ticket/payment registration and admin-controlled manual registration
- Member onboarding and public/private profile fields
- Event home, programme, announcements, menu, gallery, sponsors
- Event attendee directory and cross-event network directory
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
- Add email OTP request and six-digit verification.
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

| Product area | Minimum production acceptance |
|---|---|
| Authentication | Email OTP works locally and in production; temporary passwords are retired; redirects are allow-listed; sessions are cookie-based and refreshed safely. |
| Registration | Authentication does not imply membership; automatic and manual approvals issue one auditable entitlement. |
| Profiles | Public and private data are separated; private contacts require an accepted connection; pause mode removes discovery. |
| Events | Staff access is event-scoped; drafts are not member-visible; upcoming/past transitions are deterministic. |
| Payments | Amounts use integer minor units; webhooks are signed and idempotent; browser callbacks never mark orders paid. |
| Connections | Canonical user pairs prevent duplicates; ignore is quiet; blocking is immediate and mutual. |
| Messaging | Only accepted, unblocked pairs can send; pagination and rate limits exist; report evidence is preserved. |
| Moderation | Report-scoped access is server-mediated and audited; moderator roles cannot access finances or event editing. |
| Communities | Membership and moderation are policy-enforced; private content is unavailable without membership or report escalation. |
| Courses | Lesson assets are private/signed; access rules and purchases are server-enforced; progress is user-scoped. |
| Notifications | Preferences are grouped; transactional messages cannot be disabled; deliveries are logged and retry-safe. |
| Admin | Every sensitive action is permission-checked and audited; no service key reaches browser code. |
| Analytics | Metrics use documented definitions and exclude test/seed activity. |
| Deletion | Identity removal, retained messages, financial records and audit evidence follow a documented retention policy. |

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
