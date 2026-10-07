# Her Africa Table — implementation plan and taskboard

Updated: 5 October 2026. Baseline release: `b4be9ca`.

This board turns the 4 October UI/UX and Events audit (saved separately on the Product Owner's Desktop) into implementation work. It tracks delivery and acceptance for the audit recommendations. The Product Owner paused the former ten-sprint execution on 4 October so engineering can focus on this board. The Admin **Launch gates** remain the source for production release evidence. A task marked Done here does not automatically pass a launch gate or publish an event.

## 7 October execution alignment

The 4–5 October observations below are historical checkpoints, not a fresh live-readiness audit. Later pilot decisions allow founding-cohort automatic free-event publication and Community creation with Admin pause/expiry controls. Old invited-only/private-draft descriptions are superseded, but real onboarding/event-to-Community acceptance is still required.

The [Community completion board](./FOUNDING_PILOT_JOURNEY_UPGRADE.md#remaining-work--phased-taskboard) is a sub-workstream. Its phases 4–7 do not replace this board's phases 0–5 or complete the paused ten-sprint roadmap.

| Main task IDs | Carried forward into | Open proof/work |
|---|---|---|
| UX-01, UX-02, DISC-01, DISC-02, DETAIL-01 | Community phase 4 and event/member UI work | Populated mobile/desktop review, plain wording, lifecycle/error states and server-side topic/search paging |
| COMMS-01 | Community phase 5 and event communication acceptance | Faster targeted safety delivery, real inbox/provider/retry evidence and event change-message acceptance |
| HOST-01, HOST-02 | Community phases 4–5 and event Host/Admin work | Scoped Host usability, draft/attachment guards, selected-event reads, queue paging and role checks |
| JOIN-01, HOST-03 | Community phase 6 and current pilot onboarding rehearsal | Open membership/founding-cohort journey, expiry/pause, free-event publication, invitations and return destinations |
| PILOT-01, PILOT-02 | Community phase 6 and specific-event preparation | Fresh named-event readiness audit and booking/capacity/check-in rehearsal with separate accounts |
| PILOT-03 | Community phase 7 and main launch gates | Recorded end-to-end evidence and owner go/no-go |

Always distinguish **implemented**, **tested automatically**, and **accepted with real users/devices/inboxes**. A green build is not launch acceptance. Advanced paid creator settlement and other paused roadmap modules remain outside this limited Community/event pilot.

## Outcome and scope

The first useful journey is: discover an event → understand its date, place, cost and entry rule → verify email → request one place → see whether it is pending or confirmed → retrieve the pass and arrival details → attend → find a relevant follow-up or Community.

An Event Host prepares a scoped draft. Admin reviews it, assigns the safety and arrival team, manages registrations and makes the publication decision. The work below connects existing capabilities and removes friction. Paid creator settlement, native video, public attendee contacts and a new global navigation system are outside this plan.

## Board rules

- **Status:** `Ready` = scoped and actionable; `In progress` = implementation underway; `Review` = code complete, waiting for verification; `Blocked` = cannot meet its exit condition until the named dependency is resolved; `Done` = acceptance criteria met and recorded.
- **Priority:** P0 blocks a safe journey or public opening; P1 is a major usability or reliability issue; P2 is a meaningful refinement.
- **Evidence:** a source change, green build or installed database function alone is not an end-to-end pass. Record route, account role, device, result and date for the relevant acceptance test. Avoid secrets and private member content.
- **Scope:** one work item per implementation slice. Preserve permission, consent, capacity, manual review, payment and audit boundaries. Prefer existing RPCs and components.
- **Update cadence:** refresh this table after each completed implementation slice and after each controlled acceptance run. Use stable task IDs in commit/PR descriptions and conversation updates. If the live state differs, state the observation time.

## Current checkpoint

The read-only live audit at 08:40 EAT on 4 October found a healthy deployed app and reachable database, but **zero future public published events**. The named October 6 pilot is still a private draft. `event_guest_access` and automatic event payments are off. The pilot has basic place details and a prepared free ticket, while the on-sale ticket, designated Host account/assignment/content, safety-contact record and scoped door staff remain incomplete. All probed technical readiness functions returned true. **Zero of the ten pilot launch checks are accepted**; one is recorded blocked and two in progress. This is a release hold, not a percentage of code completed.

The current publication policy requires the October 6 pilot to be ready 48 hours before its 18:00 EAT start, which is **4 October at 18:00 EAT**. If the requirements cannot be completed by then, the Product Owner must decide whether to reschedule the pilot. Do not override the safeguard to preserve the original date.

**5 October reschedule:** The Product Owner moved the same founding event to **Friday 9 October 2026, 18:00–20:00 EAT** at Geco Cafe, Mbaazi Rd, Lavington. The URL slug now ends `2026-10-09`; the event ID remains `836f9030-a69e-4e2b-8599-29470d39ab17`. `epayments.elbrim@gmail.com` is the verified, active, event-scoped Host. The event remains a private draft with registration closed and zero orders. Its 48-hour publication cutoff is **7 October at 18:00 EAT**. A live read-only audit on 5 October confirmed Host readiness and private-route hiding; it still recommends **hold** because the free ticket is not on sale, Host content is unapproved, safety contact and door staff are missing, and the release checks remain unaccepted. The 4 October audit above is historical.

**5 October owner/role checkpoint:** The Product Owner reports the Geco Cafe booking confirmed for 20 and names Lex Sam as both the safety contact and intended check-in lead. The safety contact was saved and read back on the private event. Multi-role production page acceptance passed for anonymous, ordinary member, Community moderator, tagged Event Host and primary Admin boundaries; it does not substitute for Lex's own Host session. Check-in assignment is paused pending an explicit choice: the current `event_staff` role grants wider event-scoped management and guest-record access than check-in alone. Ticket sale, Host content review and launch-gate acceptance remain open. Do not infer an independent venue booking receipt from the owner's confirmation.

**5 October preflight recheck:** The live audit now reports `hostReady=true`, `safetyContactReady=true`, `placeReady=true` and the private routes hidden from unsigned visitors. The private event description no longer calls the owner-confirmed venue “proposed.” The event remains a draft with registration closed. Remaining event-level blockers are the on-sale free/manual ticket, submitted and approved Host content, scoped door staffing and public publication; wider launch-gate acceptance is still incomplete. Engineering recommendation remains **hold**.

**5 October free-ticket and door-only slice:** The existing ticket is now read back as 20 free KES places, `draft`, with sales ending one hour before the 9 October start. The event remains `draft`/`closed`; no guest can reserve a place yet. A new door-only migration and screen avoid granting Lex the broad `event_staff` role. They require database application and a Lex-session rehearsal before being treated as live. [Proposed Host copy](./PILOT_HOST_CONTENT_FOR_LEX.md) is ready for Lex to verify and submit from her own scoped account. The 5 October 11:58 EAT read-only live audit reports `freeTicketPrepared=true`, but `hostDraftSubmitted=false`, `doorStaffAssigned=false`, zero accepted launch checks and recommendation **hold**. The copy is not silently submitted on Lex's behalf, and no event has been published.

A later read-only audit attempt on 4 October could not complete because the local machine could not resolve the live domain. The successful 5 October audit in the reschedule note above supersedes that temporary verification gap.

## Critical path

```text
PILOT-01 owner/venue/Host/door assignments
      + PILOT-02 controlled authentication, booking and permission rehearsal
      + EVT-01 protected arrival and EVT-02 personal booking hub
      + COMMS-01 delivery and change-message acceptance
          → PILOT-03 full event rehearsal and recorded go/no-go
```

Engineering can build EVT and COMMS work while the Product Owner resolves PILOT-01. Public guest access stays off until the relevant checks pass.

## Taskboard

| ID | Priority | Status | Owner | Concrete task | Done when / evidence | Dependency |
| --- | --- | --- | --- | --- | --- | --- |
| PILOT-01 | P0 | **Blocked** | Product Owner + Event team | Preserve the owner-confirmed Geco Café booking for 20; have Lex verify and submit [Host copy](./PILOT_HOST_CONTENT_FOR_LEX.md); apply the door-only migration and assign her; approve the free ticket only with the publication decision | Read-only pilot audit shows each prerequisite ready; owner confirms physical arrangements | Host submission, migration, door rehearsal and live launch checks |
| PILOT-02 | P0 | **Ready** | Engineering + Admin + test attendees | Rehearse member/Admin OTP, guest and member booking, approval/decline, last-place concurrency, cancellation, role denials, pass issue/revocation and check-in | Separate controlled accounts and inboxes; outcome recorded against the ten launch gates | PILOT-01 for Host/door tests; guest flag rehearsal in controlled environment |
| EVT-01 | P0 online / P1 in-person | **Review** | Engineering | Make confirmed guests' arrival instructions, directions/map or protected online joining action available from event and pass | Confirmed guest can get there/join; anonymous, pending and cancelled users cannot retrieve private link; mobile and keyboard pass | Live role and device acceptance still required |
| EVT-02 | P1 | **Review** | Engineering | Combine personal request state, pass, receipt/manage-place and calendar entry within the event journey | One event page explains pending vs confirmed and provides correct next action; existing cancel/refund RPCs still govern | Live booking-state acceptance still required |
| EVT-03 | P1 | **Review** | Engineering | Explain event-only eligibility before OTP and preserve the event return path through `/continue` and onboarding | Guest-off state does not promise immediate booking; approved member/eligible guest returns to intended event | Guest-on and guest-off browser acceptance still required |
| COMMS-01 | P1 | **In progress** | Engineering + Admin | Prove existing registration/decision/cancellation email queue and delivery; add a minimum standalone reminder and reviewed material-change message where existing contracts do not cover them | Outbox, provider result, controlled inbox, retry, preference and duplicate-send evidence; no mail on cosmetic edits | Apply new migration, deploy, then run [controlled acceptance](./EVENT_COMMUNICATIONS_ACCEPTANCE.md) |
| DISC-01 | P2 | **Review** | Engineering + Product | Replace full-summary cards with date and time, venue/online, free/price, booking availability, bounded summary and one action | Person can answer when/where/cost/state from a card at 320/390/768px; no N+1 roster reads | Populated mobile and role acceptance still required |
| DISC-02 | P2 | **Review** | Engineering | Add Events-local “My events” using existing personal records; keep public Upcoming/Past and handle ongoing/paused/cancelled honestly | Pending/confirmed/waitlisted entries and pass route found within Events; private records never leak | Multi-account and mobile acceptance still required |
| DETAIL-01 | P2 | **In progress** | Engineering + Product | Reorder detail: title/key facts/action first; group optional Community, programme, Q&A, menu, gallery, networking and follow-up by lifecycle | Populated mobile page exposes decision/action before long optional content; empty/past/cancelled/error states are accurate | Populated responsive and lifecycle acceptance still required |
| HOST-01 | P1 | **Ready** | Engineering + Event Host + Admin | Show selected-event stage, next requirement and accountable person in Admin; preserve two-stage Host review and all guards | Reviewer knows next action; Host cannot see roster/payment/other events; selection and Back persist | Existing proposal/Host RPCs |
| HOST-02 | P1 | **In progress** | Engineering | Load full registrations/refunds only for selected event/work area; consider earlier safe proposal draft save | Overview no longer fetches every event's full roster/refunds; partial draft survives exit; submission still validates safety | Apply aggregate-count migration; draft persistence and live role review remain |
| JOIN-01 | P1 | **In progress** | Product Owner + Engineering | Deliver a 60-day, invited-email-only membership pilot with Admin invitation, expiry, audit and per-member pause | OTP proves email, completed application reaches the intended decision path, trial expires without a manual timer, Admin can turn it off | Apply timed pilot migration, deploy and run [controlled acceptance](./INVITED_PILOT_ACCEPTANCE.md) |
| HOST-03 | P1 | **In progress** | Product Owner + Engineering | Directly invited pilot members may receive a private event draft and scoped Host workspace automatically after submitting a free event idea; keep publication, safety and payment gates with Admin | Host has only her event workspace; Admin can pause a Host/event and disable the trial; no public event appears without final review | Apply private-event migration and run scoped multi-account acceptance |
| UX-01 | P2 | **Ready** | Engineering + Product | Plain-language pass for sign-in, receipt, search errors, footer, public loading and event labels | No raw order status or misleading “account loading” on public pages; one consistent destination vocabulary | Can run alongside EVT work |
| UX-02 | P2 | **Ready** | Engineering | Keep three Home suggestions; surface urgent event status; isolate optional network-query failures; check Nia/mobile dock, focus and type sizes | Member finds next event; optional network failure does not blank directory; keyboard/zoom/mobile checks recorded | Representative member test accounts |
| PILOT-03 | P0 | **Blocked** | Product Owner + Super Admin | Run complete event-to-Community rehearsal and record go/no-go | All required launch checks passed with evidence and owner decision recorded; public flags changed only under authorized release procedure | PILOT-01, PILOT-02, EVT-01/02/03, COMMS-01, essential mobile checks |

### Task decomposition and acceptance notes

**4 October engineering checkpoint:** EVT-01/02/03 are code-complete for review. The confirmed pass now shows authorized arrival details, directions or online joining, plus calendar and manage-place actions. Existing request states surface the order link; a new visitor sees the current guest-access rule before OTP. `npm run build` and the full `npm test` suite passed on the local checkout. These are implementation checks, **not** live role/device acceptance or a Launch-gate pass. The October 6 private draft has not been published or changed by this slice.

**Events discovery checkpoint:** Upcoming cards show local day/time, venue or online format, the lowest published ticket price, a booking cue and a two-line summary. Tickets are loaded in one public query rather than one request per card. TypeScript, the journey contracts and production build passed locally.

**Booking-state refinement:** Cards now assess shared event capacity and ticket inventory from one paginated server-side order read across the listed events. Full events can say “Fully booked”; free/manual-review events say “Requests open” only when a ticket is actually available. A failed ticket or reservation read falls back to “Check availability” or “See event for price” rather than a false promise. This is code-complete but still needs a populated 320/390/768px browser review and a live last-place test.

**Personal Events checkpoint:** A signed-in visitor now sees an Events-local “My events” link and upcoming request/confirmed-place rows, each loaded through her own registration and attendance permissions. Confirmed rows lead to the protected pass; requests return to their event state. The public Upcoming/Past views remain unchanged. The local full test suite and production build passed; two-account visibility and mobile acceptance remain to be recorded.

**Event detail checkpoint:** The key facts now include cost and who may book, and the booking action sits before the optional linked Community. A confirmed Community-gathering guest can still reach her entry pass. Empty programme scaffolding no longer adds a long section; a past event with a published recap links directly to it. The hero is shorter. The full local test suite and production build passed; populated mobile and permission-state review remain open.

**Communications checkpoint:** The standalone event pass now offers an explicit reminder choice for a confirmed attendee more than one day before the event. A private migration defines the choice, due queue, reschedule/cancellation suppression and pre-delivery eligibility check; the existing worker and Resend template are connected. Publishing a new Admin update now asks for confirmation and explains that guest notices are queued. Full local tests and production build passed. This is not live until the migration is applied, deployed and the [inbox acceptance sheet](./EVENT_COMMUNICATIONS_ACCEPTANCE.md) is completed. No pilot launch gate changed.

**Admin event data checkpoint:** Registrations and Guest Arrival now request detailed records only for the selected event. Event Details, Stories and other unrelated views no longer fetch registration/refund rosters, and proposals are loaded only where needed. Overview still loads all rosters to calculate counts; replace that with aggregate counts before calling `HOST-02` Done. TypeScript and the relevant journey, pilot and admin contracts passed; live role review remains open.

**5 October counts checkpoint:** Admin Event overview now requests only scoped aggregate counts through `list_event_work_counts()`. The confirmed figure comes from actual event memberships, not application states. Waiting-work links open the relevant event. Until the new migration is applied, the overview shows counts as unavailable rather than a misleading zero; the selected-event Registrations work area remains available. Draft persistence and live role/device acceptance still keep `HOST-02` In progress.

**60-day trial request:** The joining switch retains manual review, verified-invitation automatic review and closed modes; it never auto-approves every new verified email. The new timed migration closes the indefinite trusted-invitation window. The previous migration closes an invitation shortcut: an ordinary invited person now verifies her email, completes the short application, and only then receives the trusted-invitation decision. A member who proposes an event becomes that event's Host only after Admin accepts the idea; she is not a platform Admin. Public publication remains a second Admin decision. A related Community can be applied for separately before or after the event; the event's follow-up Community link requires an approved/published Community and guest opt-in. `JOIN-01` and `HOST-03` track the requested trial controls. Do not turn on open automatic access or public event publication merely to accelerate the pilot.

**Invited pilot implementation:** Admin → Members now has a direct tester invitation form. The timed database setting gives invited-only automatic approval a 60-day end, while a new invitation is valid for at most 30 days and the Admin form limits a rolling 60-day pilot to 100 invitations. Invitations use the Resend queue, can be withdrawn while pending, and are checked again before delivery. The switch is not enabled by migration or deploy. See the [acceptance sheet](./INVITED_PILOT_ACCEPTANCE.md); no claim of live inbox delivery or expiry rehearsal is made yet.

**Private pilot event implementation:** The separate Admin → Members Pilot events switch defaults off. When enabled during the timed invited-member window, a directly invited, active member who submits a free event idea at least seven days ahead receives a private event and event-scoped Host workspace immediately (maximum two automatic drafts per Host). Tickets remain drafts. The setting can be turned off independently, and it expires effectively with the membership window. Public publication, guest booking, paid tickets and safety review do not auto-approve. Separate-account acceptance remains outstanding.

**5 October live activation:** Both pilot migrations were present, and production reported deployed release `cc5ebdc` with a reachable database. Super Admin enabled invited-only membership approval until **4 December 2026, 11:16 EAT** and separately enabled automatic *private* event drafts for directly invited pilot members. Read-back confirmed both settings. Two previously pending applications remained pending. `JOIN-01` and `HOST-03` remain In progress until invitation delivery, invited/uninvited accounts, event-scoped Host access, publication boundaries and off-switch behavior are rehearsed with separate accounts. See the [acceptance sheet](./INVITED_PILOT_ACCEPTANCE.md).

**PILOT-01:** This is an owner and operations task. The Product Owner has reassigned the existing pilot to the active member at `epayments.elbrim@gmail.com` and reported Geco Cafe booked for 20; do not create a duplicate event or treat the previous Seina account audit as current. Lex Sam is saved as the safety contact. Engineering can verify records and explain next steps, but must not treat an owner statement as independent venue evidence or grant broader door permissions without the owner's informed choice. Host content, door scope and ticket readiness remain open.

**PILOT-02:** Run changes only with explicitly designated test identities and safe data. The separate tagged Super Admin is not yet available; the primary real owner cannot substitute for an independent role test. Keep OTP values and private messages out of gate notes. Record negative and positive paths.

**EVT-01:** Physical details and private online links already enter Admin/Host data, but the standalone attendee views do not offer a complete arrival action. Reuse approved Host arrival text. Keep the online link out of anonymous SSR output, JSON-LD, event cards and publicly downloadable calendar files. The existing migration publication guard is useful but does not itself provide a guest UI.

**EVT-02:** The booking form is embedded, which is good. Preserve one seat per email, manual review, capacity and duplicate prevention. The order page already owns cancellation/refund RPC calls; expose it clearly from the personal event state rather than duplicating financial logic. A request is not a confirmed place.

**EVT-03:** `event_guest_access` is off now. A new visitor should know this before asking for a code. Eligibility copy must match the actual flag and still allow an existing event guest to reach her record after new guest entry is paused.

**COMMS-01:** Registration notifications and the Resend worker exist. A queue item and accepted API call are not proof of recipient delivery. Confirm via separate inboxes. Community reminders exist; a standalone public event needs a small equivalent only if the guest can consent to it. Have Admin preview and confirm substantial date/venue changes; avoid sending on every edit.

**DISC-01 / DISC-02:** Keep the existing two public views. “My events” is an Events-local view, not another global navigation item. Search/filter controls and large pagination systems are deferred until event volume warrants them; the Past page's existing 30-row limit should receive Show more before the archive exceeds 30 records.

**DETAIL-01:** Many sections are conditional but together can become dense. Use state-dependent grouping, not a new mega-menu. A cancelled registrant needs a useful state and support path; a private draft must remain undiscoverable to unauthorized people. An ended date and an Admin-completed event are separate facts.

**HOST-01 / HOST-02:** Keep idea approval separate from publication. Current Admin Events has eight views and queries every event's detailed registrations/refunds on each view. A task-first selected-event view and targeted reads reduce cognitive load and unnecessary sensitive-data handling. The Host remains scoped.

**UX-01 / UX-02:** Use existing wine/cream identity, MemberHeader, Community tabs and the three-suggestion Home. Improve functional readability and error recovery where touched. Do not broaden this into an unrelated redesign.

## Phase monitor

| Phase | Focus | Status | Tasks | Next proof or action |
| --- | --- | --- | --- | --- |
| 0 | Owner setup and acceptance baseline | **Blocked** | PILOT-01, PILOT-02 | Owner confirms venue/capacity and real Host, safety and door identities; then controlled rehearsal |
| 1 | A usable event place | **Review** | EVT-01, EVT-02, EVT-03 | Confirmed, pending and unauthorized accounts on mobile and desktop |
| 2 | Reliable communication | **In progress** | COMMS-01 | Apply migration, deploy, then controlled inbox/provider trace, retry/dedupe and material-update evidence |
| 3 | Find and understand events | **In progress** | DISC-01, DISC-02, DETAIL-01 | Populated responsive review of cards and personal rows; then simplify event detail |
| 4 | Run the event confidently | **In progress** | HOST-01, HOST-02, JOIN-01, HOST-03 | Apply counts migration; add draft persistence; decide 60-day joining scope before adding timed pilot controls |
| 5 | Platform polish and final rehearsal | **Polish ready; sign-off blocked** | UX-01, UX-02, PILOT-03 | Finish plain-language/mobile checks, then record owner go/no-go after prior gates |

Wave 0 owner actions and Wave 1 engineering work may proceed in parallel. No wave requires enabling automatic payments. Reassess priorities after a real populated event is available; visual estimates based only on empty states must be checked against real content.

## What to monitor here in Codex

For each update, report:

1. Task IDs moved and the new status.
2. The actual change or owner decision, with commit or document link if one exists.
3. What was tested, by role and device; what remains unproved.
4. Launch-gate effect, if any, sourced from the Admin evidence records.
5. The next actionable item and its owner.

This file is the durable task index. In conversation, a compact board can use the same IDs; do not turn `Ready` into a numeric completion percentage. The [existing Admin board](../components/admin/roadmap-overview.tsx) summarizes the ten original pilot sprints, while **Admin → Release → Launch gates** is the authoritative acceptance register.
