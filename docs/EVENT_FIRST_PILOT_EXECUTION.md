# Event-first pilot execution

Owner: Her Africa Table product owner and engineering. Target: ten three-day
sprints. Status: in progress. This plan implements the findings in the 22
September 2026 MVP gap assessment and uses one real public event as the shared
acceptance object. A controlled launch is the target; a failed gate delays the
affected capability.

## The outcome we are building

A new visitor discovers an event, verifies her email, requests or buys a place,
receives a decision, attends with a private pass, meets a useful person with
consent, follows up, and chooses whether to join the related Community. The
Event Host runs the gathering from a scoped workspace. Super Admin can review,
pause and audit the event. None of these steps automatically approves the
visitor for the wider member network.

Pilot measures: completed registrations, attendance, opted-in introductions,
member-confirmed meaningful connections, event-to-Community requests and joins,
and Host-confirmed follow-up outcomes. Counts must exclude test accounts and
respect small-sample privacy thresholds.

## Access decisions

- Email OTP confirms identity. It does not approve membership or an event place.
- `profiles.access_status = 'pending'` can request a place at a published **public**
  event only after `event_guest_access` is enabled.
- Event approval grants `event_access` and a private event pass. It does not
  change `profiles.access_status` or grant `member_onboarding`.
- A visitor may cancel and request a new place while registration is open.
  A declined request remains closed unless the event team intervenes.
- The member directory, member connections, private Communities, Community
  events and member messaging still require their existing permission checks.
- A Community invitation or linked event never enrolls someone automatically.
- Suspended and deleted accounts cannot create new event registrations.
- `event_guest_access` starts disabled. Enable it only after the migration,
  database test, separate-account rehearsal and deployed UI verification pass.

The first pilot uses a free public event with Manual review. Automatic Paystack
event payment remains closed until webhook, expiry, refund and reversal paths
are accepted. Member-created paid events and automatic Host payouts remain off.

## Sprint exits

| Sprint | Days | Product exit | Evidence required |
| --- | --- | --- | --- |
| 1. Rebaseline | 1–3 | One private launch-event draft, named Host and staff, frozen P0 scope | Draft invisibility, owner, content and flag review |
| 2. Event entry | 4–6 | New guest and member can register; Admin can decide; guest can open pass | OTP, capacity, duplicate, approval, decline, cancellation and email tests |
| 3. Host workspace | 7–9 | Host prepares and submits all event content without Admin-wide access | Cross-event denial and full review-state rehearsal |
| 4. Event page | 10–12 | Complete public page and attendee programme on mobile | Content, media consent, private-link and sitemap checks |
| 5. Connection QR | 13–15 | Attendee-controlled QR introduction with manual fallback | Block, opt-out, duplicate and device checks |
| 6. Smart Networking | 16–18 | Host-reviewed table rounds and private attendee schedules | Twenty-person rehearsal, capacity and blocked-pair proof |
| 7. Nia at events | 19–21 | Nia answers from authorised event facts and offers useful suggestions | Accuracy, absent-data, private-context and outage checks |
| 8. After the event | 22–24 | Attendee recap, Community bridge and privacy-safe Host report | Source-total reconciliation and confirmed-attendee access |
| 9. Hardening | 25–27 | Critical journeys pass on production-like stack and launch devices | Separate-role UAT, email, payment, accessibility, recovery |
| 10. Rehearsal | 28–30 | Full event-to-Community pilot can open deliberately | Twenty-attendee rehearsal and recorded go/no-go decision |

Each sprint ends with the relevant migration, database permission check, UI
states, operational note and acceptance record. An unfinished item remains
closed behind a flag; a green build alone is not an exit.

## Current implementation checkpoint — 25 September 2026

- [x] The event-only guest model is specified above.
- [x] `20260923090000_event_limited_guest_access.sql` creates a default-off flag,
  guards registration, stops event fulfillment from granting membership and adds
  an evidence gate to Admin Release.
- [x] Event sign-in return, registration, checkout and pass screens have been
  updated for the limited guest journey.
- [x] `supabase/tests/002_event_guest_access.sql` covers the event/member
  boundary, approval, pass, cancellation, reapplication and suspended account.
- [x] `20260923100000_event_guest_cancellation_and_reapply.sql` allows a guest
  to withdraw a pending request or release an unused free place; reapplication
  creates a new order and a fresh private pass.
- [x] `20260923110000_scoped_event_host_workspace.sql` adds scoped Host access,
  a private content draft, Super Admin assignment/review, and publication of
  approved programme, arrival information and partners. The member-facing
  workspace is `/events/[slug]/host`; Super Admin reviews under **Events → Host
  drafts**. Host assignment does not grant guest-list, payment or check-in
  permissions.
- [x] `supabase/tests/003_event_host_workspace.sql` specifies the Host/Admin
  permission boundary and draft-to-public review sequence.
- [x] `20260923120000_member_event_private_host_handoff.sql` changes new
  member-proposal approvals to create a private event, draft free ticket and
  scoped Host assignment. The Admin approval button is disabled until this
  migration's readiness function exists. `supabase/tests/004_member_event_private_handoff.sql`
  checks the private handoff.
- [x] `20260924090000_event_host_pause_and_transfer.sql` gives Super Admin a
  reasoned pause/restore control. Replacing a Host keeps the working content
  but resets the submission, so the successor must review and resubmit it.
  `supabase/tests/005_event_host_lifecycle.sql` specifies that permission and
  content-transfer boundary.
- [x] The Host review screen now shows capacity, format, venue/online-link
  readiness, registration mode and the member proposal's safety contact next
  to the submitted content. For Admin-created events without a proposal, the
  safety contact must still be checked separately before publication.
- [x] `20260924100000_event_safety_contact_gate.sql` creates a private,
  Admin-maintained safety contact for every Host-reviewed event. Existing and
  new member proposals seed it; an Admin-created Host event cannot transition
  from draft to published without it. The Admin review screen can save it.
  `supabase/tests/006_event_safety_contact_gate.sql` specifies the gate.
- [x] On 24 September 2026, the connected Supabase project returned the guest
  flag as present and disabled; the Host assignment/workspace/safety-contact
  tables were available. Signed-in Super Admin returned true from all three
  new readiness functions. There were no published public events.
- [x] On 24 September 2026, the connected project exposed the reviewed-cover
  table and public-cover function after the migration was applied. The public
  guest flag remained disabled. A read-only check found zero event orders with
  an older `member_onboarding` entitlement; no account correction was made.
- [x] Admin → Events → Overview now gives each upcoming event a compact,
  database-backed setup checklist for event basics, place/link, free manual
  ticket, active Host, reviewed Host content and safety contact. It names the
  next action without treating setup completion as launch approval.
- [x] `20260924130000_event_intro_cards.sql` defines opt-in, event-scoped
  introduction cards for confirmed members and confirmed event-only guests.
  A separate QR or 16-character manual code opens a short hello only for
  another confirmed attendee. A request is not a connection until the
  recipient accepts; neither outcome reveals private contact details or
  grants wider membership. Opt-out, code rotation, blocked pairs, expiry and
  Admin pause/restore are enforced in Postgres. The feature is off by default
  for each event; Super Admin opens it after rehearsal. The attendee and Admin
  screens are wired, and the entry-pass QR remains entirely separate.
- [x] On 25 September, the connected project exposed `event_intro_settings`
  after the introduction migration. The isolated GitHub database gate covers
  its pgTAP contract. This is installation evidence, not a live rehearsal.
- [ ] Rehearse introductions with two different confirmed accounts, an
  unconfirmed visitor, a blocked pair and Super Admin before enabling them
  for the pilot event.
- [x] The event detail page now reads a confirmed place for an event-only guest,
  not only for an active member. The guest retains her pass entry even if new
  guest requests are later paused. The pass page is explicitly non-indexable.
- [x] `20260924140000_event_table_rounds.sql` implements the next sprint's
  default-off table-round opt-in, scoped Host volunteer list and private plan,
  two-to-eight-person table capacity, blocked-pair and eligibility checks,
  Super Admin review/pause, and attendee-only schedules. Hosts cannot see
  unconsenting guests or approve their own plans. The attendee, Host and Admin
  screens are wired; table rounds never grant member-network access.
- [x] The isolated GitHub quality gate for `189f0ab` applied all migrations and
  passed all 391 database assertions. Application verification, TypeScript and
  production build passed. Its previously stale Host, Community and referral
  test fixtures are now aligned with current permission and manual-review rules.
- [x] On published or completed event pages, signed-in approved members can
  open Nia in place. Her event answer is grounded in the event and published
  programme visible through that member's database session; private seats,
  passes, joining links and safety contacts are excluded. Missing programme
  details are identified rather than invented, and the provider fallback gives
  a useful event-specific answer. This is a Sprint 7 implementation step, not
  live acceptance or permission to open the feature for event-only guests.
- [x] `20260925100000_table_guide_referral_category.sql` aligns Nia's referral
  topic with the database's allowed usage and feedback categories. The
  isolated `010_table_guide_referral_category.sql` test checks that referral
  answers record normally while unknown categories remain rejected.
- [ ] Apply `20260925100000_table_guide_referral_category.sql` to the connected
  Supabase project after reviewing the GitHub database gate. Do not run the
  `010_` test file in the production SQL Editor.
- [ ] Rehearse Nia on a real published pilot event with a signed-in member,
  including a missing programme, closed registration, a private/draft event
  slug, provider outage and mobile view. Confirm that the member receives only
  published facts and no private booking or joining data before Sprint 7 exits.
- [x] On 25 September, the connected project exposed `event_round_settings`
  after the table-round migration. The isolated GitHub database gate covers
  its pgTAP contract. This is installation evidence, not a live rehearsal.
- [ ] Rehearse twenty separate opted-in guests, blocked pairs, opt-outs after
  assignment, capacity, Host replacement, mobile schedule visibility and Admin
  pause before opening table rounds for a real event.
- [x] `20260925110000_event_guest_follow_up.sql` adds event-scoped after-event
  access for a confirmed public-event guest with a current event entitlement.
  She can leave private feedback and, where an approved Host proposal offers
  a future Community, express interest without receiving membership. The
  interface shows her recap and feedback on the same event journey; anonymous
  guest quotes are attributed as event guests. Private and future events,
  unrelated users and revoked entitlements remain excluded.
- [ ] Apply `20260925110000_event_guest_follow_up.sql` after its isolated
  database test passes. Run `supabase/tests/011_event_guest_follow_up.sql`
  only in CI/local/staging, never in the production SQL Editor. Rehearse a
  confirmed event-only guest and a full member separately, including feedback,
  Community interest, entitlement revocation and mobile views.
- [x] `ops:events:accept-private-host` passed with one Super Admin and two
  separate tagged members. It created `hat-private-host-rehearsal-20260924`
  as a closed, unfeatured draft; verified scoped Host access, private drafting,
  request-changes/resubmission, pause/restore, private safety-contact visibility,
  and replacement reset. The event remained private throughout.
- [x] The live health endpoint returned HTTP 200, database reachable, server
  integration ready, and deployed release `d32e760` on 24 September 2026.
- [ ] Run pgTAP tests 002–006 in the isolated CI/local Supabase stack or a
  disposable staging project, not the production SQL Editor. Files under
  `supabase/tests/` create temporary identities and events, then `rollback`;
  they do not install product features. Files under `supabase/migrations/` are
  versioned database changes. The live API rehearsal is not a substitute for
  these isolated database tests or a browser/mobile rehearsal.
- [ ] Rerun the revised `002_event_guest_access.sql` only in that isolated test
  database: it proves the release gate rejects an early toggle, then uses
  transaction-local Super Admin evidence to exercise guest registration. Its
  final `rollback` leaves the flag and launch-check statuses unchanged. Do not
  mark actual release checks passed based on this synthetic fixture.
- [ ] Record a real on-the-day safety contact for the first event before
  publication. Keep the public guest flag disabled until the full event-entry
  and guest/membership boundary tests pass.
- [x] Host drafts now accept one private event image. Super Admin sees the
  submitted image beside venue, format, capacity and safety details; the image
  becomes public only with Host-draft approval. A replacement remains private
  while the previous approved image stays live. The public event page and
  event list use the approved Host image, falling back to the approved proposal
  poster. `20260924110000_event_host_reviewed_covers.sql` also blocks links in
  public Host arrival notes at the database boundary. The image is optional;
  the Admin must still review venue, format and private online-link readiness.
- [x] `20260924110000_event_host_reviewed_covers.sql` is available in the
  connected Supabase project. Run `supabase/tests/007_event_host_reviewed_covers.sql`
  only in isolated CI/local/staging, never in the production SQL Editor.
- [x] The read-only existing-entitlement check returned zero event orders with
  `member_onboarding` on 24 September 2026. Recheck before opening a future
  guest pilot if historical data changes; never bulk revoke without review.
- [ ] Create the real future launch event as a private draft with owner, city or
  online format, time zone, capacity, registration mode and complete basic copy.
- [ ] Name the Event Host, check-in lead, support/safety lead, Admin reviewer and
  launch rollback owner.
- [ ] Prepare at least two attendees, a Host, a Moderator and a Super Admin as
  distinct rehearsal accounts.
- [ ] Verify the deployed release and complete the event guest rehearsal before
  enabling `event_guest_access`.

### Existing-entitlement review query

Run read-only in the Supabase SQL editor after the migration. This identifies
event orders where the older fulfillment function issued an onboarding
entitlement. Do not bulk revoke these: some accounts may have separately earned
membership approval.

```sql
select e.user_id, e.event_id, e.order_id, e.status,
       p.access_status, o.created_at
from public.entitlements e
join public.orders o on o.id = e.order_id
join public.profiles p on p.id = e.user_id
where e.entitlement_type = 'member_onboarding'
  and o.order_type = 'event'
order by o.created_at desc;
```

### Guest-flag release

After the database test and full UAT pass, Super Admin records the five checks
under **Admin → Release → Public event guests**. The release gate requires
both the event-content and registration-payment database modules. Super Admin
then uses **Admin → Events → Overview → Guests who are not members** to open
requests. The same control pauses new guest registration. Existing confirmed
passes remain governed by their event membership and the event lifecycle
controls. A direct SQL-editor update is not the release workflow because the
gate checks the signed-in Super Admin identity.

## Definition of done

A critical capability is finished only when the attendee, member, Host,
Moderator and Super Admin roles pass their applicable live journeys with
separate accounts. Postgres or server permission checks must protect every
private action. Empty, loading, error, retry and success states must work on
mobile. Email and payment decisions must match database state. No critical or
high-severity access, privacy, payment, accessibility or data-loss defect may
remain open. The final go/no-go record must cite actual evidence, not a static
readiness percentage.
