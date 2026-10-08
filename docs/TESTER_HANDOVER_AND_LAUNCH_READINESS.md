# Her Africa Table — tester handover and launch readiness

Updated: 8 October 2026, 10:17 EAT. Live audit baseline: `d672d01`.
Website: https://www.herafricatable.com

## 1. Where we are

The platform has substantial working functionality, but the full live journey is not yet certified. Testing should be supervised and limited to agreed accounts and fixtures. Do not use the named real event as a destructive test fixture.

**Formal launch sign-off: 0% (0 of 10 required launch checks accepted).** Two checks are in progress, one is recorded blocked and seven are not started. This is the recorded acceptance percentage, not the percentage of features implemented. We do not have a defensible code-completion percentage; a high-looking estimate would hide missing real-user evidence.

**Technical readiness probes: 15/15 passed (100% of these limited probes).** These confirm installed/available guards and APIs, not complete journeys, delivery, usability or payment readiness. The live health endpoint returned HTTP 200 with database and server integration ready.

Current intake was read as `trusted_auto`, with two pending applications. Automatic admission still depends on the database's current eligibility rules. Do not assume every applicant receives cohort privileges. Guest event registration and automatic event payments were off at this observation. The site had one future public published event and one future private draft.

### Named event warning

“The Founding Table” (`the-founding-table-nairobi-2026-10-09`) is a private draft for 9 October, 18:00–20:00 EAT. Lex's account is confirmed, active, onboarded and assigned as Host. Venue/place and safety contact are present; a free ticket is prepared. Basics, submitted/approved Host content, a bookable free ticket and door-staff assignment are incomplete. Its 7 October, 18:00 EAT publication cutoff has passed. Recommendation: **hold this event; obtain an explicit operational reschedule/release decision.** No publication or cutoff override was performed.

## 2. What has actually been tested

“Current” means dated October evidence. “Historical” means an older successful rehearsal that needs regression testing after changes. “Automated” is not a human usability pass.

| Test and accounts | What worked | Evidence and limit |
| --- | --- | --- |
| Ordinary member, tagged Event Host, Community Moderator and primary Super Admin — 8 October | All authenticated. Tagged non-Admin accounts were active, had no Admin scope and were denied Admin release access. The named private draft was hidden from anonymous access. Admin could read its setup. | Current read-only live audit. No booking, moderation decision or door scan performed. Several rehearsal projections were unavailable because no suitable fixture was selected; those checks are **not passed**. |
| Owner, two members, moderator and scale member — 8 October | Each signed in and read 45 existing conversations across three pages without duplicates; existing reply was readable. | Current live API read rehearsal. The room is a draft: production search correctly rejects it. This is not a populated browser/search/posting rehearsal. |
| Two members, owner and backup moderator — 13 August | Publishing, replies, appreciation, following/saving, pin permissions, blocking, join/decline/cancel/leave/rejoin/removal/restoration passed. | Historical tagged-account rehearsal in [Community acceptance](./COMMUNITY_ACCEPTANCE_REPORT.md). Re-run on the current release before certifying these flows. |
| Member, Host, Moderator and Admin — 13 August | Isolated gathering questions, Host answers, live text, pinning, blocked-pair privacy and signed-out denial passed; fixtures were later cancelled/archived. | Historical live rehearsal; not proof of the revised gathering UI. |
| Current gathering permission SQL tests — 7–8 October | Suspended/removed access, archived rooms, own-message removal and reply-context boundaries passed in rollback tests. | No real account suspension/removal or retained test messages. Two-browser live updates still need testing. |
| Owner browser session — 7–8 October | Existing video discussion retained; compact desktop/mobile layout inspected. Host editor tab drafts survived navigation and could be discarded. 390 px views had no observed horizontal overflow. | No real image upload, new reply or invitation sent. Not a full device/keyboard audit. |
| Owner browser session — 8 October, deployed `7afc872` | “Test Run” with a valid description reached Step 2. All three choices were inspected: venue for In person, optional meeting link for Video call, and YouTube only for Watch a video together. | Separate new tab; no save/publication or email. Local screenshot `tmp/gathering-three-choices-20261008.png`. No user in-progress tab was altered. This is form-interaction acceptance, not actual gathering creation/playback. |
| Official Admin email — 8 October | One labelled application test email reached Gmail Inbox from Her Africa Table at `community@caseready.africa`; expected Admin link rendered. | Actual provider plus Inbox evidence. Does not prove OTP, welcome, invitation return, retry or urgent safety delivery. |
| Repository and worker checks — 8 October | Full local test suite, TypeScript and production build passed. Single-email worker skips unrelated batch preparation, never broad-falls back and rejects unsafe scope opt-out. | Automated source/behaviour tests; provider/database mocked for worker tests. |

Internal tagged dummy accounts use private test credentials and are excluded from member metrics. Their successful password-based runners do **not** certify the public email-code journey. Never share test passwords, keys or OTPs in a report.

## 3. Gathering journey testers should expect

Community → Gatherings → **Create a gathering** → name and short description → choose:

- **In person:** venue, city, date/time and guest limit. Existing 24-hour notice rule remains.
- **Video call:** date/time and optional Meet/Zoom link. With no call link, members use text chat. Calls open in the external meeting service.
- **Watch a video together:** date/time and a YouTube video/livestream link. Members watch and discuss inside the gathering. Online gatherings can start today.

The Host supplies a responsible contact and opens the gathering for Community members. Existing private drafts and hybrid drafts remain supported. Only the selected type's link is submitted; switching types retains unfinished text without accidentally publishing hidden links. YouTube is an optional viewing source, not a separate Community or membership type. YouTube access outside our platform is governed by YouTube, not Community membership.

Photos can be added to the gathering's linked album after opening, subject to the existing upload rules. **No poster is required.** A dedicated optional poster uploader/display inside Community gathering creation is not part of this simplified flow yet; ordinary Events already have their separate poster controls. If testers need gathering posters, record this as a product gap rather than pretending an album is a poster.

## 4. Tester checklist

New clarity pass: Community search supports words in any order and name suggestions, with scoped result counts. Inside each joined Community, **Your membership** explains leaving; leaders see handover guidance. Host/Admin **Remove member** explains access loss without account deletion or automatic refund. Re-test T07/T13 on the deployed release; no real leave/removal was performed by engineering in this slice.

Use two separate browser profiles/accounts, a controlled Community, one free test event and controlled inboxes. The test organiser must provision membership/Host/moderator roles; do not give all testers Super Admin. Start on desktop Chrome, then iPhone Safari and Android Chrome. Agree which writes/emails are allowed before testing. Never cancel real members' bookings or post test safety reports about real people.

For every row record **Pass / Fail / Blocked / Not run**. Pass requires observed behaviour, not just a visible button.

| ID / role | Do this | Expected result |
| --- | --- | --- |
| T01 New visitor | Register with a controlled new email, receive and enter the code, submit profile/application. Repeat with a wrong and expired code. | Useful errors; no duplicate account. Explain whether application is pending or approved according to current settings; no premature privileged access. |
| T02 Member + Admin | Test both pilot-eligible admission and an applicant outside the cohort; Admin switches/reviews only within the agreed test window. | Eligibility enforced; pending screen is clear; official Admin gets agreed notice; approval/welcome arrives and login returns to member home. Restore the prior settings. |
| T03 Member + Super Admin | Sign in/out by email code in separate sessions; visit protected and Admin URLs as ordinary member. | Correct destination and logout on both sides; ordinary member cannot read Admin data or perform decisions. |
| T04 Pilot Host | Create a free event with address/map, capacity and optional poster; link an existing Community or choose no Community. | Eligible automatic path works; ineligible path honestly says review. Creator/Host identity is clear; poster really saves/displays; linking is optional. |
| T05 Two attendees | Book the last available place concurrently; repeat a booking; test full event/waitlist and cancellation. | No overbooking/duplicate fulfilment. Clear confirmed/pending/full state; proper private pass and host/member notices. |
| T06 Host + door lead | Open a test event pass, scan/check in, repeat scan, revoke/cancel and try again. | Door role limited to its event; duplicate/revoked passes rejected; no broader Admin, payments or private guest-list access. |
| T07 Host + two members | Create open and private Communities; join/request/approve; decline/cancel/leave/rejoin; upload allowed branding. | Correct join policy and role boundaries; image actually visible; private content hidden; exit/post-retention explanation understandable. |
| T08 Gathering Host | Try all three gathering choices, including “Test Run” with a short/valid description, an online session within an hour and invalid YouTube link. | Field-specific guidance; only relevant inputs shown; online session opens without in-person notice requirement. Video/call/text behaviour matches the choice. |
| T09 Two Community members | Open the same gathering; send/reply, observe the other browser, remove own message; attempt removal of someone else's; try after removal/suspension. | Updates/replies visible in context; own removal works; others' removal denied; current access enforced. Video discussions do not appear as unrelated topics. |
| T10 Host + member | Invite a controlled member and a new email to event/Community; complete OTP/application and accept. Withdraw and reuse invitations. | Email really arrives; correct destination retained; join policy respected; withdrawn/expired links do not grant access; no duplicate membership/delivery. |
| T11 Host + member + moderator | Toggle album uploads; add small/oversized/wrong-type files; approve/remove/report; open private file as outsider. | Upload requires Host permission and linked album; limits enforced; proper attribution/moderation; private delivery protected; deletion really reaches Storage. |
| T12 Member + safety/Admin | Report controlled test content, handle the report and exercise support/notification preferences; simulate agreed delivery failure/retry. | Private report routed to authorised team; clear response; notices respect preferences; retry not duplicated; urgent response timing demonstrated. |
| T13 Every role | Use keyboard/mobile, search/paginate populated rooms, Back/refresh drafts, tabs, Nia, loading/empty/error states. | Readable controls; no clipping; no lost draft or confusing redirect; useful recovery; Nia respects access and requires action confirmation. |
| T14 Host + Admin | Cancel a test published event with reason, archive/hand over a test Community and complete post-event recap/follow-up. | Correct authorisation and audit; guests informed; old content retained appropriately; paid/refund paths remain disabled or separately accepted. |

### Issue report — copy for each finding

```text
ID / checklist row:
Date/time (EAT), release, URL:
Role/account alias (no password), browser/device:
Steps (1, 2, 3):
Expected / actually happened:
Screenshot or short recording (redact private content):
Can you continue? Yes / No
Severity: access/privacy or blocked core flow / major confusion / minor polish
Owner / fix reference / retest date and result:
```

## 5. Launch gaps and owners

These are the ten current Admin launch checks. Keep formal status separate from partial evidence; engineering must not silently mark checks accepted.

| Check | Recorded status | Evidence still needed / owner |
| --- | --- | --- |
| Member email code | Not started | Actual new/returning inbox → code → intended destination; tester + engineering |
| Admin email code | Blocked | Re-test official Admin OTP and correct workspace; current blocker must be re-evaluated, not assumed resolved by application test mail |
| Migration parity | Not started | Repository-to-live inventory/history and required rollback verification; engineering |
| Authorisation | In progress | Complete separate-session member/Host/moderator/door/Admin negative and positive journeys |
| Backup restore | Not started | Agreed backup, isolated restore and recovery evidence; project owner + engineering |
| Registration | Not started | Free/manual booking, duplicate/last-seat/cancellation/inventory acceptance |
| Publication/check-in | Not started | Final content/roles, publication decision, pass issue/revoke and door rehearsal; Host + Admin |
| Notifications | In progress | OTP/invite/welcome/reminder/cancellation receipt, preference, retry/dedupe and safety timing |
| Safety/support/privacy | Not started | Named coverage, reports, escalation, private media/contacts and closure/handover acceptance |
| Devices/accessibility | Not started | Populated Chrome/Safari/iPhone/Android plus keyboard/screen-reader and non-technical tester sign-off |

Also open: dedicated current private-published rehearsal fixture, populated Community search and simultaneous chat, real file upload/cleanup/concurrency, distributed email rate limiting and narrower legacy worker-RPC grants. Automatic creator payouts and paid commerce remain outside the accepted pilot until payment/refund/settlement/legal acceptance is completed.

### Finish in this order

1. **Tester setup:** controlled accounts/inboxes, role assignments and appropriate published private fixture; verify current pilot/cohort switches without broadening access.
2. **Core journey:** T01–T06, T08–T10; fix blockers and repeat failed cases on the deployed release.
3. **Community/media and usability:** T07, T11–T14; human mobile/keyboard review and real Storage acceptance.
4. **Operational acceptance:** notification recovery, restore, safety coverage and complete named-event setup; record all applicable formal gates.
5. **Owner go/no-go:** review open high-severity issues and dated evidence. Only then widen the pilot; do not treat passing test scripts as permission to publish or turn on payments.

Detailed engineering progress: [taskboard](./UX_EVENTS_IMPLEMENTATION_TASKBOARD.md). Historical evidence: [launch evidence](./LAUNCH_READINESS_EVIDENCE.md). Email-specific sheet: [communications acceptance](./EVENT_COMMUNICATIONS_ACCEPTANCE.md).
