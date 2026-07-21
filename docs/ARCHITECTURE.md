# Her Africa Table — Production Architecture

## System shape

| Concern | Production choice |
|---|---|
| Web application | Next.js App Router and TypeScript |
| Hosting | Vercel Production and Preview deployments |
| Identity/data/files/realtime | Supabase Auth, Postgres, Storage and Realtime |
| Payments | Provider-neutral order layer; Paystack first |
| Email | Resend with delivery webhooks and notification log |
| Source control | GitHub: `ImpactEdgeInnovations/herafricatable` |
| Monitoring | Vercel runtime visibility plus structured application/error events |

The browser uses only the Supabase project URL and publishable key. Privileged keys
remain in server-only environments. Sensitive writes pass through RLS-protected
queries, security-definer database functions with restricted grants, or verified
server routes depending on the operation.

## Environments

### Local development

- Application: `http://localhost:3000`
- Database/Auth: hosted Supabase development project initially
- Secrets: `.env.local`, ignored by Git
- Payment: test mode or manual registration
- Email: test recipient restrictions until sender domain is verified

### Vercel Preview

- One deployment per feature branch/pull request
- Preview-scoped environment values
- Supabase redirect allow-list supports the approved Vercel preview pattern
- Test accounts and test payment mode only
- No production webhook or live payment credentials

### Production

- Production branch: `main`
- Public alias: `https://herafricatable.vercel.app` until a custom domain is attached
- Exact Supabase Site URL and auth callback allow-list
- Live credentials stored only in Vercel/Supabase secret stores
- Production migrations applied intentionally before enabling dependent flags

Production and non-production should use separate Supabase projects before real
member data or live payments are introduced. Sharing a database across Preview and
Production creates unacceptable test-data and access-policy risk.

## Git and release workflow

1. Pull the latest `main`.
2. Create a `codex/<short-feature-name>` branch.
3. Commit application code, tests, migrations and docs together.
4. Push the branch and validate the Vercel preview.
5. Run typecheck, build, automated tests and migration/RLS checks.
6. Review the diff and database impact.
7. Merge to `main`; Vercel deploys production.
8. Run production smoke checks and record any operational action.

Never develop directly against production data. Never edit production schema only in
the Supabase dashboard without creating the equivalent migration in Git.

## Identity and access model

Supabase `auth.users` is the identity source. Application identity is represented by
a `profiles` row keyed to `auth.users.id`.

Authentication and authorization are intentionally separate:

- Email OTP proves control of an email address.
- Authentication does not prove payment, event attendance, membership, or an admin role.
- Product access is determined from registration, entitlement, membership and role
  records.

Recommended member states:

- `pending`: authenticated but awaiting registration/payment/admin approval
- `onboarding`: approved, profile not yet complete
- `active`: entitled to current discovery and creation features
- `dormant`: may access retained relationships/history but not new discovery/growth
- `suspended`: safety or administrative restriction
- `deleted`: deletion workflow completed; identity/personal data removed or anonymized

Admin access uses application role tables, not user-editable JWT metadata. Event staff
have explicit rows mapping them to permitted event IDs. Role changes require a Super
Admin and create audit events.

## Refined data domains

### Identity and privacy

- `profiles`: display name, owned photo, role, company/business, industry, country/city,
  languages, short bio, referral source and deterministic completion percentage
- `profile_private`: phone, WhatsApp, connection-sharing preference,
  LinkedIn/Instagram and private data
- `profile_interests`: normalized member-interest relationships
- `member_goals`: normalized launch-purpose keys used by rule-based discovery
- `consent_records`: terms, privacy, community rules, media/testimonial consent versions
- `user_roles`, `event_staff_scopes`, `audit_events`

Keeping gated contact data separate from directory-safe profile data reduces the risk
of an overly broad query exposing private information.

### Registration, money and entitlements

- `registration_requests`
- `orders`, `order_items`, `payment_attempts`, `payment_events`
- `ticket_types`, `event_memberships`
- `membership_plans`, `membership_periods`, `entitlements`
- `manual_payment_reviews`
- `referral_campaigns`, `referral_codes`, `referrals`

Money is stored as integer minor units plus an ISO currency code. Payment provider
references and webhook event IDs are unique. Entitlements are issued idempotently.

### Events and content

- `events`, `venues`, `programme_days`, `programme_sessions`, `speakers`
- `announcements`
- `menu_courses`, `menu_items`, `menu_ratings`
- `gallery_albums`, `media_assets`
- `event_feedback`
- `sponsors`, `sponsor_assets`, `sponsor_intro_requests`

Publishing state is explicit (`draft`, `published`, `archived`). Member queries never
depend on a frontend-only draft filter.

Private online-event URLs and check-in instructions live in `event_private_details`,
not the publicly readable `events` row. Event staff authority is represented by
`event_staff_scopes`; published-event visibility never expands staff edit scope.
Creating or changing a featured event is an audited Super Admin operation and keeps
the landing-page countdown synchronized with the event source of truth.

### Network and communication

- `connections` using a canonical low/high user pair plus requester/recipient fields
- `connection_notes` private to their author
- `conversations`, `conversation_participants`, `messages`, `message_receipts`
- `blocks`
- `asks`, `ask_responses`
- `support_tickets`, `support_messages`

A unique canonical pair prevents A→B and B→A duplicates. Conversation creation is a
controlled operation allowed only for accepted, unblocked connections.

### Communities, Circles and learning

- `communities`, `community_memberships`, `community_posts`
- `circles`, `circle_memberships`, `circle_prompts`, `circle_posts`
- `courses`, `course_lessons`, `course_access_rules`
- `course_purchases`, `course_enrollments`, `lesson_progress`

Circle launch matching is deterministic and explainable. AI can later propose matches,
but a human-reviewable rule and audit record remain.

### Safety, operations and engagement

- `reports`, `report_evidence`
- `moderation_cases`, `moderation_actions`, `moderation_access_logs`
- `notification_preferences`, `notification_jobs`, `notification_deliveries`
- `feature_flags`, `platform_settings`
- `partners`, `partner_perks`, `perk_codes`, `perk_redemptions`

Reports use typed foreign-key relationships where possible. If a polymorphic target is
used, a server operation validates the target and captures an immutable evidence
snapshot at report time.

## RLS policy model

Every table reachable through the Supabase Data API has RLS enabled. Policies follow
least privilege and are backed by indexes on every field used in policy predicates.

Key rules:

- Anonymous users read only explicitly published public content.
- Members update only their own editable profile fields.
- Directory queries return only eligible, visible profiles.
- Private contact data is readable by its owner and accepted, unblocked connections.
- Event staff access only their scoped events and permitted content categories.
- Moderators access report/support metadata by role.
- Private messages are readable by conversation participants.
- Moderator access to reported content is provided through a report-scoped secure
  server operation that records access before returning content.
- Service/secret keys never appear in client bundles and are not used to compensate
  for missing RLS.

RLS `SELECT` policies cannot themselves produce a reliable access audit record. This is
why report-triggered private-content review is mediated through an audited operation.

## Authentication flow

1. Visitor requests an email code.
2. Supabase verifies the submitted OTP. A temporary password path may be enabled only
   during controlled pre-SMTP testing.
3. Server establishes the cookie session.
4. Application resolves profile, registration, membership and role state.
5. Pending users see registration/approval status; approved incomplete users see
   onboarding; active users enter the member application.
6. Every protected route revalidates authorization server-side; client state is only
   a presentation aid.

Duplicate-email and repeated OTP behavior must be tested before launch.

## Payment architecture

Admin selects a mode globally, with optional event override:

- `automatic`: create provider transaction and await verified webhook
- `manual_review`: collect registration and offline payment reference; admin reviews
- `closed`: accept waitlist/contact requests but issue no entitlement

The state machine is:

`draft → pending_payment/pending_review → paid/approved → fulfilled`

Failure/cancellation paths are explicit. Only a verified webhook or audited admin
approval can enter the paid/approved state. Both call the same idempotent entitlement
issuer.

## Storage

Suggested buckets:

- `avatars`: public or transformed delivery with upload ownership controls
- `event-media`: published event assets; drafts remain private
- `community-media`: private, membership-gated signed URLs
- `course-assets`: private, entitlement-gated signed URLs
- `report-evidence`: private, moderator/report-scoped access
- `admin-imports`: private, short retention and restricted access

File type, size and ownership are validated server-side. Storage object names use
generated IDs, not raw user filenames. Uploaded media is never trusted as executable.

## Notifications and background work

Business events enqueue notification jobs; request handlers do not send a large batch
inline. Each job has a deterministic idempotency key, attempt count, next-attempt time
and final state. Delivery webhooks update the notification log.

Transactional/security messages remain enabled. Member preferences control grouped
event, connection, community and platform communications.

## Observability and operations

- Structured logs use request/event IDs and exclude message bodies, OTPs and secrets.
- Payment webhook receipt, validation, processing and entitlement IDs are traceable.
- Admin and moderation actions have actor, target, reason and timestamp.
- Health checks cover application, database connectivity and critical configuration.
- Error monitoring alerts on authentication callbacks, payment processing, failed
  notifications and elevated permission failures.
- Database backups and restore procedures are rehearsed before accepting live payment.

## Performance and accessibility budgets

- Mobile-first pages and paginated directory/message queries
- Database indexes verified with realistic query shapes
- Images resized and optimized; videos delivered through an appropriate streaming path
- No core action requires hover, swipe or long press
- Touch targets at least 44px and body text at least 16px by default
- Visible focus, semantic structure, labeled controls and tested color contrast
- Camera-denied QR fallback through manual connect codes

## Legal and privacy workstream

Engineering will implement consent versioning, export, deletion, retention controls,
data minimization and auditability. Final notices, lawful bases, retention periods,
cross-border processing and Kenya Data Protection Act/other-market obligations require
qualified legal review before launch.
