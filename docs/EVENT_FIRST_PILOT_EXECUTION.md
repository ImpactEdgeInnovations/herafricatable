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

## Current implementation checkpoint — 30 September 2026

- [x] The event-only guest model is specified above.
- [x] `20260923090000_event_limited_guest_access.sql` creates a default-off flag,
  guards registration, stops event fulfillment from granting membership and adds
  an evidence gate to Admin Release.
- [x] Event sign-in return, registration, checkout and pass screens have been
  updated for the limited guest journey.
- [x] `supabase/tests/002_event_guest_access.sql` covers the event/member
  boundary, approval, pass, cancellation, reapplication and suspended account.
  It also rehearses a transaction-local pause and reopen: a new guest is
  refused while entry is paused, but an already-approved guest keeps her pass.
  This is isolated rollback proof, not the required live Super Admin exercise.
- [x] The event form now offers one place per email, because the order currently
  creates only one attendee membership and private check-in pass. The Paystack
  endpoint rejects multi-place event checkout before a charge begins.
  `20260930100000_one_pass_per_event_account.sql` adds the database guard for
  manual and direct API requests; the expanded `002` test rejects both free
  guest and paid member multi-place requests without leaving an order. Existing
  orders are not changed by the migration. Named companion passes would need
  a separate, fully reviewed attendee-and-check-in design before group booking
  could reopen.
- [x] `20260930100000_one_pass_per_event_account.sql` is active on the
  connected Supabase project: the 30 September live read-only audit reports
  `singleSeatGuard: true`. Automatic paid-event checkout remains closed pending
  its separate payment and reversal acceptance. Review any historical event
  order with more than one ticket individually; do not bulk change paid
  records. A read-only count on 30 September found zero such order items.
- [x] `20260930110000_event_capacity_across_ticket_types.sql` adds a shared
  event-capacity guard across ticket types. A requested place reserves capacity;
  cancellation releases it. An expired/cancelled order cannot reactivate after
  its place is taken, and Admin cannot lower capacity below existing requests.
  Reservations for different ticket types serialize on the event, preventing
  two simultaneous requests from taking the final place. The isolated `016`
  test exercises the cross-ticket boundary and recovery path.
- [x] `20260930110000_event_capacity_across_ticket_types.sql` is active on
  the connected Supabase project: the 30 September live read-only audit reports
  `capacityGuard: true`. The live registration journey still needs rehearsal
  before the first pilot event is published.
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
- [x] The read-only pilot audit now counts actual event reservations across all
  ticket types. It refuses to call a free ticket available once its inventory
  is used, or the event bookable once its overall capacity is reserved. Pending
  review and payment orders count; cancelled, expired and refunded orders do
  not. This is an audit of the selected real event, not a substitute for the
  separate-account booking rehearsal.
- [x] The public event page and registration form now show whether each ticket
  can actually be requested, accounting for shared event capacity, per-ticket
  inventory and sale dates. Unavailable choices cannot be selected, confirmed
  attendees still get their pass, and a failed availability lookup offers a
  plain **Check again** action. The server sends only ticket states to the
  browser, not attendee orders. The database remains the final authority if
  places change between page load and submission. Unit, type and build checks
  do not replace a live mobile booking rehearsal.
- [x] `20260930120000_event_registration_notifications.sql` routes each new
  manually reviewed place request to active Super Admin accounts through the
  existing in-app and email queue. It excludes the attendee's private note
  and email from the alert. Reapplication after cancellation gets a fresh
  alert. Attendees receive plain-language request, confirmation and decline
  messages; the intermediate `approved` order state no longer generates a
  second confirmation email. Non-event commerce notifications remain unchanged.
  The isolated `017_event_registration_notifications.sql` test covers the
  queue, idempotency, decision wording and absence of a pass after decline.
- [x] `20260930120000_event_registration_notifications.sql` is active on the
  connected project: the 1 October live audit reports
  `registrationNotifications: true`. A real manual request, Super Admin inbox,
  approval and attendee inbox still need separate-account rehearsal. Provider
  acceptance alone does not prove inbox delivery.
- [x] `20260930130000_event_waitlist_lifecycle.sql` closes the previously
  misleading waitlist path. Event managers can see the private list, email a
  person only after manual bookings reopen with an available ticket, and see
  that the notice is not a reservation. A member can leave, or request an
  available place herself; the existing one-pass, capacity and Admin approval
  checks then apply. Withdrawal suppresses an unsent opening email. The
  `018_event_waitlist_lifecycle.sql` isolated test covers permissions,
  idempotent email, withdrawal, claim and final approval.
- [x] `20260930130000_event_waitlist_lifecycle.sql` is active on the connected
  project: the 1 October live audit reports `waitlistLifecycle: true`.
  Rehearse a waiting member and Admin with separate accounts. Opening notices
  remain manual and never guarantee a seat; the first pilot stays free/manual
  review.
- [x] `20260930140000_event_automatic_checkout_gate.sql` adds a separate,
  default-off event card-payment switch. The database refuses publication of
  automatic-payment events and creation of new automatic event orders while
  the switch is closed. The Paystack entry point and public event pages also
  fail closed without beginning a charge. Super Admin sees one pause/open
  control under Events → Overview; opening requires six recorded release
  checks covering provider approval, two-account checkout, refund/reversal,
  Admin operations, privacy and recovery. Existing paid or pending orders
  remain available for reconciliation when new checkout is paused. The
  isolated `019_event_automatic_checkout_gate.sql` test exercises both sides
  of the switch; its acceptance evidence is transaction-local test data only.
- [x] `20260930140000_event_automatic_checkout_gate.sql` is active on the
  connected project: the 1 October live audit reports
  `automaticCheckoutGuard: true` and `automaticEventPaymentsOpen: false`.
  Do not mark the six payment-release checks as passed or open the switch until
  real provider, charge, refund and reversal rehearsals are complete. This
  switch does not hold up a free/manual-review pilot event.
- [x] Admin → Events → Overview now checks the live registration-email,
  one-place-per-guest and event-capacity protections before offering **Open
  guest requests**. A stale Admin page rechecks them at the moment of
  opening. **Pause guest requests** remains available even if a protection
  becomes unavailable. This prevents the normal Admin path from opening
  guest entry merely because the original feature flag exists; the database
  release-evidence gate remains authoritative as well.
- [x] Admin → Events → Event details now keeps a newly created event selected
  after its first save, including its private online-link field. The first save
  is draft-only, so Admin cannot accidentally make a new event public while
  entering its basics. This is editor-state and build evidence; the real pilot
  draft and publication rehearsal remain outstanding.
- [x] `20260928100000_admin_event_publication_sequence.sql` also enforces the
  private-first sequence in the authenticated event-save RPC. An assigned
  Host's draft must go through Host review, and an unhosted public draft needs
  a saved private safety contact before publication. The internal save
  function is not executable by API users. `015_admin_event_publication_sequence.sql`
  specifies those boundaries for the isolated database gate. The 30 September
  live audit confirms installation; a real Admin rehearsal is still pending. The
  read-only live audit reports `publicationSequence` from a permission-aware
  database check so an uninstalled migration cannot be mistaken for readiness.
  Event details now lets Super Admin save the private on-the-day contact on an
  existing draft, so an Admin-operated event has a complete in-product path;
  assigned-Host events still publish through Host drafts. Until the migration
  is installed, the Admin event editor fails closed for first-time public
  release while continuing to allow private draft saves and edits to events
  that were already published.
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
- [x] The isolated Sprint 7 event-answer test now covers published facts,
  missing programme, closed registration, completed events, inaccessible event
  links, invalid time zones and the deterministic provider fallback. An
  inaccessible event link receives a neutral response before the external
  provider is called; it is not replaced with another public event. This is
  code-contract evidence, not a live provider-outage or mobile rehearsal.
- [x] `20260925100000_table_guide_referral_category.sql` aligns Nia's referral
  topic with the database's allowed usage and feedback categories. The
  isolated `010_table_guide_referral_category.sql` test checks that referral
  answers record normally while unknown categories remain rejected.
- [x] The connected project's Nia referral-category behavior was verified on
  1 October with an active tagged member: referral usage and feedback both
  recorded successfully, while an unknown category was rejected by both
  functions. This is live behavioral evidence for the migration, not a
  rehearsal of Nia's event answers or the member-facing experience. The
  `010_` test file must still never run in the production SQL Editor.
- [ ] Rehearse Nia on a real published pilot event with a signed-in member,
  including a missing programme, closed registration, a private/draft event
  slug, provider outage and mobile view. Confirm that the member receives only
  published facts and no private booking or joining data before Sprint 7 exits.
- [x] On 25 September, the connected project exposed `event_round_settings`
  after the table-round migration. The isolated GitHub database gate covers
  its pgTAP contract. This is installation evidence, not a live rehearsal.
- [x] The [28 September isolated quality gate](https://github.com/ImpactEdgeInnovations/herafricatable/actions/runs/36386331294)
  passed `014_event_table_round_scale.sql` and all 490 database assertions.
  Twenty-one attendees opted in; twenty occupied four tables of five, a
  blocked pairing and overflow seat were refused, Super Admin approved the
  plan, every seated attendee saw only her table, and a guest withdrawal
  paused all schedules. Admin then replaced the Host: the former Host lost
  access, the replacement submitted the paused plan for fresh review, and
  schedules returned only after Admin reapproval. This proves the database
  contract in a disposable stack, not twenty live mobile users or delivered
  emails.
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
- [x] `20260925110000_event_guest_follow_up.sql` is installed on the connected
  project; the read-only 25 September audit confirmed its live function.
  Run `supabase/tests/011_event_guest_follow_up.sql` only in CI/local/staging,
  never in the production SQL Editor. Still rehearse a
  confirmed event-only guest and a full member separately, including feedback,
  Community interest, entitlement revocation and mobile views.
- [x] The 25 September GitHub gate for `0d749ae` passed application tests,
  production build and all 414 isolated database assertions, including the
  guest follow-up permissions. This does not verify its live deployment or
  separate-account browser journey.
- [x] `20260925120000_event_host_outcomes.sql` gives the current Host a
  read-only view of her completed event and source-derived group totals.
  Confirmed places, active check-ins, private-response count, future-Community
  interest and accepted introductions exclude test accounts. The report stays
  hidden below five real check-ins, with each smaller cell suppressed; it
  never exposes names, private feedback, contact details or payment records.
  Super Admin can see the same Host-facing view alongside private operations.
- [x] `20260925120000_event_host_outcomes.sql` is installed on the connected
  project; the read-only 25 September audit confirmed its live function.
  Run `supabase/tests/012_event_host_outcomes.sql` only in isolated CI/local/staging.
- [ ] Reconcile the live Host totals with actual source records,
  test a paused/replaced Host and confirm the finished-event workspace is
  read-only on mobile before Sprint 8 exits.
- [x] GitHub's `cf7e825` production quality gate passed the application build
  and all 430 isolated database assertions, including Host-outcome permissions.
- [x] The event-to-Community invitation bridge is implemented behind
  `20260925130000_event_follow_up_invitations.sql`. It gives Super Admin a
  separate **Events → After-event invites** queue of opted-in eligible guests.
  A published linked Community is required before Admin can email a private
  invitation through the existing notification engine. An attendee's withdrawal
  closes her unused event-specific link and suppresses an unsent email. It does
  not undo an email already delivered or a separate Community join request.
  Revoked event access and suspended/deleted accounts also invalidate their
  unused event-specific links. Tagged test accounts remain visible as such in
  the Admin queue so the separate-account rehearsal can use the same path.
- [x] The read-only 27 September audit found the table from
  `20260925130000_event_follow_up_invitations.sql` already installed on the
  connected project. Do not rerun that table-creating migration there.
- [x] `20260925140000_table_invitation_crypto_search_path.sql` is active on
  the connected Supabase project. The isolated CI migration and
  `supabase/tests/013_event_follow_up_invitations.sql` have passed. This
  migration fixes Supabase pgcrypto lookup for sending, opening and
  claiming private links, including the already-installed after-event sender.
  The 30 September live audit reports `invitationCrypto: true`. The test
  Community must still satisfy the existing eight release checks and
  backup-moderator gate; this is never bypassed to exercise invitations.
  Rehearse one pending guest, one active member, Host denial, Admin
  send, delivery, claim, withdrawal and the published Community approval path
  using distinct real test accounts. Keep `event_guest_access` off until the
  complete release gate passes.
- [x] The read-only 25 September production audit found the canonical site at
  `www.herafricatable.com`, HTTP 200 health, reachable database and deployed
  release `cf7e825`. Public/auth-boundary smoke checks passed on that host.
  The bare domain redirects to `www`; it is not a failed deployment.
- [x] The read-only 25 September live audit found event introductions, table
  rounds, guest feedback and Host outcomes installed. The public-guest flag
  is still off. There is no real future published public event or real
  future private draft; the one future draft is an internal rehearsal fixture.
  The five public-guest release checks are all `not_started`. The configured
  Admin test credential is the untagged primary Super Admin account, not a
  separate tagged Admin test identity. These are explicit Sprint 9/10 evidence
  gaps; a green CI run and healthy deployment do not close them.
- [x] The same read-only audit signed in as three distinct tagged accounts:
  an ordinary member, the scoped Event Host and a Community moderator. All
  three were active, lacked event-Admin authority and were denied Super Admin
  release evidence. Only the assigned Host could open the private rehearsal
  Host workspace; only the Community moderator held a moderator seat. This
  proves a narrow live permission boundary, not the full mobile, registration,
  safety, check-in or post-event journey.
- [x] The 27 September expanded live audit additionally confirmed that the
  primary Super Admin can see the private rehearsal draft and call its
  check-in roster. The ordinary member, Event Host and Community moderator
  cannot read the raw private draft or call the roster; the assigned Host can
  still open only her scoped Host workspace. These are read-only permission
  checks against separate real sessions, not a live door or guest rehearsal.
- [x] `ops:events:accept-private-host` passed with one Super Admin and two
  separate tagged members. It created `hat-private-host-rehearsal-20260924`
  as a closed, unfeatured draft; verified scoped Host access, private drafting,
  request-changes/resubmission, pause/restore, private safety-contact visibility,
  and replacement reset. The event remained private throughout. That run used
  the primary owner Admin, so it does **not** satisfy the separate tagged
  Admin rehearsal gate. The script now requires `HAT_ADMIN_TEST_EMAIL` and
  `HAT_ADMIN_TEST_PASSWORD`, rejects the primary owner address and checks the
  test tag and Super Admin role before creating any new rehearsal event.
- [x] The live health endpoint returned HTTP 200, database reachable, server
  integration ready, and deployed release `d32e760` on 24 September 2026.
- [x] Run pgTAP tests 002–006 in the isolated CI Supabase stack, not the
  production SQL Editor. The 27 September quality gate passed all 470 isolated
  database assertions, including tests 002–013. Files under
  `supabase/tests/` create temporary identities and events, then `rollback`;
  they do not install product features. Files under `supabase/migrations/` are
  versioned database changes. The live API rehearsal is not a substitute for
  these isolated database tests or a browser/mobile rehearsal.
- [x] Rerun the revised `002_event_guest_access.sql` in that isolated CI test
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
- [x] On 1 October, the expanded live audit fetched the existing tagged
  private rehearsal event anonymously. Its public URL rendered a streamed
  not-found page with `noindex`, no draft title and no cached response. The
  audit now fails closed if that privacy boundary changes. The streamed HTTP
  status was 200 rather than 404, which is [documented Next.js
  behavior](https://nextjs.org/docs/app/api-reference/functions/not-found#calling-notfound-after-streaming-has-started);
  its `noindex` tag keeps the soft 404 out of search results. Do not add a
  proxy-level database lookup solely to change this status for the pilot; that
  would alter the access path for member-only events without improving the
  observed privacy boundary. This check is not a substitute for real-event
  review.
- [ ] Create the real future launch event as a private draft with owner, city or
  online format, time zone, capacity, registration mode and complete basic copy.
- [ ] Name the Event Host, check-in lead, support/safety lead, Admin reviewer and
  launch rollback owner.
- [ ] Prepare at least two attendees, a Host, a Moderator and a Super Admin as
  distinct rehearsal accounts. The Super Admin rehearsal must use a dedicated,
  tagged test account with time-limited access; the primary owner account is
  not a substitute. Do not promote a member or create a new Super Admin
  without the owner's explicit choice.
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

### Engineering checkpoint — 27 September 2026

**Recommendation: hold the public-guest pilot; no final owner go/no-go decision
has been recorded.** The deployed `22568e9` site returned HTTP 200 and the
separate member, Host and moderator boundary checks passed. The [GitHub quality
gate](https://github.com/ImpactEdgeInnovations/herafricatable/actions/runs/36297671082)
passed the application build and 470 isolated database assertions, including
guest manual/QR check-in, duplicate-scan and reversal tests. This is isolated
database evidence, not a live door rehearsal.
Production nevertheless reports `invitationCrypto: false`; apply the pending
`20260925140000_table_invitation_crypto_search_path.sql` before sending any
invitations, then rerun the read-only audit. There is no real future pilot event
draft or published free/manual public event, the five public-guest release
checks remain `not_started`, and `event_guest_access` remains off. A green CI
gate proves code contracts in an isolated stack, not the missing live journeys.
The 27 September read-only email audit found eight provider-accepted jobs in
the preceding seven days and no queued, processing or failed jobs. DKIM, SPF
and return-path DNS were visible; the sending-only Resend key cannot inspect
the provider's domain status. Membership intake was `manual_review` with two
pending applications. These checks support operational readiness but do not
replace a fresh OTP or invitation delivery rehearsal.

### Engineering checkpoint — 28 September 2026

The canonical site serves `bfa7253` with HTTP 200 and a reachable database.
The live role-boundary audit still passes, while `invitationCrypto: false`,
zero real future event drafts, five `not_started` release checks and the closed
guest flag keep the recommendation at **hold**. The owner asked engineering to
choose the first event title; the working title is **The Founding Table —
Nairobi**. No event record has been created because its future date/time,
venue or online format, capacity, Host, check-in lead and safety contact have
not yet been confirmed. The isolated twenty-person test does not replace the
live Sprint 6 rehearsal or a controlled-pilot go/no-go decision.

### Engineering checkpoint — 30 September 2026

The product owner asked engineering to choose the pilot title, so **The
Founding Table — Nairobi** is now the selected working title. Its date, place,
capacity and named event team remain open; no event has been created or made
public. Read-only checks confirmed membership intake is `manual_review` with
two pending applications, member-event proposal boundaries are private, and
signed-out callers cannot perform the eight checked Admin decisions. These
checks do not prove positive approval, OTP delivery or a complete attendee
journey. The latest isolated quality gate passed the guest pause/reopen and
existing-pass rollback assertions. The pilot remains **hold** until the pending
migrations, real event, release evidence and separate-account rehearsal are
complete.

The live audit now treats a closed guest-registration flag as the correct
pre-decision state, not a failed launch check. With no other machine-checkable
blockers, it can recommend a human go/no-go while the flag is still off. If the
flag is on and a check fails, the recommendation is to pause and review.
Neither state substitutes for a recorded owner decision or live rehearsal.
The audit also requires a tagged Super Admin rehearsal account distinct from
the primary owner before it can recommend go/no-go. On 30 September the local
test configuration still points `HAT_ADMIN_TEST_EMAIL` at the primary owner,
and the live profile is not tagged as a test account. Read-only Admin access
therefore proves only the primary owner's visibility, not a separate-role
rehearsal; no new elevated account was created automatically.

### Database checkpoint — 30 September 2026

The product owner applied the four pending SQL migrations. The subsequent
read-only production audit at 10:07 UTC confirmed `invitationCrypto`,
`publicationSequence`, `singleSeatGuard` and `capacityGuard` are all `true`.
The canonical site serves release `4da3a1b` with HTTP 200 and a reachable
database. The distinct member, Event Host and Community moderator permission
checks still pass. The guest-registration flag correctly remains off. The
recommendation is still **hold**: there is no real future private pilot event,
no selected pilot slug and none of the five public-guest release checks is
recorded as passed. This checkpoint verifies installation, not a positive
Admin publication rehearsal or attendee email and check-in delivery.
The 10:13 UTC read-only email audit showed eight provider-accepted jobs in
the preceding seven days, with zero queued, processing or failed jobs. This
is delivery-operations evidence, not a fresh OTP or event-decision inbox test.

### Connected-project migration check

The 1 October 2026 live audit at 03:38 UTC confirmed
`registrationNotifications`, `waitlistLifecycle` and
`automaticCheckoutGuard` are all `true` on the database used by release
`d054e28`. The public-guest and automatic-payment switches remain off. The
engineering recommendation is still **hold** because no real future pilot
event or separate tagged Admin rehearsal account exists and none of the five
public-guest release checks has been completed. This verifies installation,
not real inbox delivery, booking, check-in or rollback rehearsal.

The same day's canonical-domain smoke test passed on release `d5dea5a`:
public pages loaded, anonymous private routes returned to sign-in, the
notification cron rejected an unsigned call, and health reported a reachable
database and ready server integration. The read-only notification audit at
03:40 UTC counted eight provider-accepted jobs in the preceding seven days,
with zero queued, processing or failed. Neither check proves fresh event
request, decision or OTP delivery to a real inbox.

In the Supabase SQL Editor for project `gtzwqromwvzqytygebfc`, run this
read-only query before applying or rerunning a future event migration:

```sql
select
  to_regprocedure('public.event_registration_notification_ready()') is not null as registration_notifications,
  to_regprocedure('public.event_waitlist_ready()') is not null as waitlist,
  to_regprocedure('public.event_automatic_checkout_guard_ready()') is not null as automatic_payment_guard;
```

A false value means that function is absent in that SQL Editor's database.
If all are true there but the app's live API still reports them missing,
investigate schema-cache visibility or the project's URL before rerunning
any migration. The readiness functions themselves must also return `true`;
mere existence is not a full operational pass.

### Selected pilot draft — 1 October 2026

The owner chose **Geco Cafe, Nairobi, Tuesday 6 October 2026,
18:00–20:00 EAT**. The private event draft **The Founding Table — Nairobi**
now exists as `the-founding-table-nairobi-2026-10-06` (event ID
`836f9030-a69e-4e2b-8599-29470d39ab17`). Engineering set a working
capacity of 20 and a draft zero-price ticket, but left registration
**closed**, publication **draft**, and featuring **off**. The exact Geco
branch/address, venue booking, Host, check-in lead and safety contact are
unconfirmed. The draft does not invite or register anyone. Six October is
only five days after this checkpoint. The owner confirmed this is intended as
a **public pilot**, not a closed rehearsal. If the human and live-journey
gates cannot pass in time, reschedule rather than quietly treating an
unrehearsed public event as launch-ready.

The read-only live audit at 04:01 UTC found both private draft routes hidden
from signed-out visitors. The selected event passed only `basics` and
`placeAvailable`; publication, exact arrival details, free/manual on-sale
ticket, Host, approved content, safety contact and check-in staff were not
ready. The five Public event guests release checks remain `not_started`,
the separate tagged Admin rehearsal account is missing, and guest access and
automatic payments remain off. The engineering recommendation is **hold**.
In-person arrival readiness now requires an exact address or map link in
addition to a venue name and city; a shared venue brand is not sufficient.
The companion `20261001090000_public_event_arrival_details_guard.sql` makes
that a database boundary for new public publication and preserves the address
or map on already-published public events. The live audit reports
`arrivalDetailsGuard` separately.
The Admin event editor now displays and saves start/end times in the event's
named timezone. The October pilot therefore remains 18:00–20:00 Nairobi time
even when an Admin's laptop is set to another timezone.
The Admin setup card also requires a free ticket actually on sale and an
active, scoped guest-arrival lead. A merely drafted ticket or an unassigned
staff account cannot count as a completed setup step. This card is still not
the final public-guest release decision.
`20261002160000_event_registration_end_guard.sql` closes another stale-link
path: free/manual requests, waiting-list joins and automatic checkout must
not create a new registration after the event ends. The isolated CI test
passed, and the 20:06 UTC production audit now reports
`registrationEndGuard: true`. Admin cannot open public guest access while its
readiness check is absent, including after a stale-page confirmation.

### Venue and migration checkpoint — 2 October 2026

The owner confirmed **Geco Cafe, Mbaazi Rd, Lavington, Nairobi** as the
intended venue, **Seina N** as Event Host, and supplied a private safety
contact telephone number. The existing pilot draft now contains the exact
arrival address. It is still unpublished, unfeatured and closed to bookings;
there are zero event orders. Venue booking confirmation and the safety
contact's name are still needed. The Admin member directory returned no
account matching Seina N by name or email, so Host access has not been
assigned without her account email. No check-in lead is assigned.

The 14:57 UTC read-only production audit showed the new arrival-details
database guard is **installed** and the selected pilot now passes `basics`,
`placeReady` and `placeAvailable`. Free/manual sale, Host, approved Host
content, safety contact and door staff remain incomplete. The five release
checks and the separate tagged Admin rehearsal remain incomplete; guest
access and automatic payments remain off. The recommendation is **hold**.

At 15:17 UTC, the live audit still reported `registrationEndGuard: false`;
the 20:06 UTC recheck confirmed it had been applied to the connected project.
The owner supplied **seina@arvisia-global.com** for Seina N. A read-only
production Auth lookup on 2 October found no account for that address, so Host
access remains unassigned. Seina needs to verify her email, request
membership, receive Admin approval and complete profile setup before the
scoped Host assignment can be made. The draft remains private and closed.

At 15:22 UTC, release `8823f97` passed the live public-site smoke check:
home, events and sign-in loaded; anonymous private routes redirected;
security headers were present; an unsigned notification cron request was
rejected; health returned 200. The read-only email audit found no queued,
processing, failed or sent notification jobs in the preceding seven days;
its last provider-accepted message predates the pilot. This is not evidence
that a new guest request, Admin decision or Host assignment email reaches an
inbox. Those flows still require a separate-account delivery rehearsal.

The live homepage also exposed an expired, manually configured September
countdown as the "next gathering." The application now ignores past countdown
dates and requires a matching future, published **public** event before showing
the event's name or ticking timer. With no approved upcoming public event, it
shows a quiet date-to-be-shared state; the private October pilot remains
undisclosed. The Admin countdown control now offers a choice of future,
published public events and copies the chosen title, date and city; hiding an
old countdown remains possible even if no new event is available. The new contract
test and production build pass. Release `27a0103` is deployed: a live HTML
check and browser inspection confirmed the September title/date are gone, the
date-to-be-shared state is visible, and the private October pilot title is not
in the signed-out homepage.

The pilot draft starts on 6 October at 18:00 Nairobi time. The Host review
function will not publish a new draft less than 48 hours before it starts, so
its publication cutoff is **4 October at 18:00 Nairobi time**
(`2026-10-04T15:00:00Z`). The live audit now prints this cutoff and marks
draft basics unready once it passes. At the 20:08 UTC recheck on 2 October,
the cutoff had not passed, the registration-end guard was live, and the public
guest and payment flags remained closed. Seina's supplied email still had no
member profile. The engineering recommendation remains **hold**. If Host,
venue, safety, staff and live-journey gates cannot pass before the cutoff,
move the event date; do not bypass the database rule.

A fresh 2 October primary-Admin OTP request was accepted and the email reached
the designated inbox, but the body carried **DukaPilot** wording despite a
Her Africa Table subject. The code was not used or recorded. Supabase's shared
Magic Link/OTP template must be corrected before Admin or member OTP can be
accepted as launch evidence. [`AUTH_SETUP.md`](./AUTH_SETUP.md) includes the
dashboard path and a ready-to-paste branded template. The current browser
session does not have access to the Her Africa Table Supabase project, so this
requires the project owner's dashboard session; it is not a Vercel setting.
The live Admin launch checklist now records `admin_email_otp` as **blocked**
with this observation, without storing the code. The read-only pilot audit
also requires passed Admin OTP, member OTP and notification-delivery checks;
at 20:17 UTC all three were still unaccepted. Delivery to one inbox is not
proof of a completed sign-in or of application-notification delivery.

At 20:28 UTC on 2 October, deployed release `98328d5` passed the live health
and database-boundary audit. The pilot remained a private, closed draft with
zero future published public events. The venue/address and basic timing passed;
the on-sale free place, active Host, approved Host content, named safety
contact, scoped arrival lead and separate tagged Admin remained open. The
ticket is configured at KES 0 with 20 places but is still a **draft**;
registration remains closed. No test result authorises opening it early.

The Admin event setup card now checks an active Host profile, ticket sale
window and unreserved stock, remaining event capacity, and unexpired arrival
staff access. It fails closed if the order list is incomplete. These are setup
signals only; the five Public event guests release checks and live journeys
remain separate.

### Next owner actions, in order

1. Confirm the Geco booking and capacity of 20, complete Seina N's membership
   journey, name the safety contact for the supplied telephone number,
   and assign a check-in lead. Six October is the chosen public pilot; keep this existing draft
   private and registration closed until the gates pass and the owner records
   a go/no-go decision. Do not create a duplicate event. Repeat the read-only
   audit with `npm run ops:events:audit-live -- --pilot-slug=the-founding-table-nairobi-2026-10-06`.
   The audit checks only this selected event's content, exact arrival details,
   free on-sale place, active Host, approved Host draft, safety contact and
   active scoped check-in staff.
2. Designate a separate, tagged Super Admin rehearsal account, with the
   product owner's explicit approval of the email and access. Keep the primary
   owner account distinct from test evidence; do not silently promote an
   existing member. This account is needed for the positive Admin rehearsal.
3. Review the complete event page, registration method and a zero-price on-sale
   ticket before publishing. On a disposable staging project, rehearse a member
   and a guest separately through OTP, request, Admin decision, email, pass,
   check-in and after-event follow-up. Production guest access remains off
   during this rehearsal.
4. Record the five evidence-backed Public event guests release checks in Admin
   Release, then make a human go/no-go decision. Only after those checks pass
   should Super Admin enable the guest flag for a small live pilot; never flip
   it directly in SQL. Repeat the guest journey on live with a limited cohort.

A critical capability is finished only when the attendee, member, Host,
Moderator and Super Admin roles pass their applicable live journeys with
separate accounts. Postgres or server permission checks must protect every
private action. Empty, loading, error, retry and success states must work on
mobile. Email and payment decisions must match database state. No critical or
high-severity access, privacy, payment, accessibility or data-loss defect may
remain open. The final go/no-go record must cite actual evidence, not a static
readiness percentage.
