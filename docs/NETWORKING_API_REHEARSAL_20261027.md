# Networking rehearsal — results and remaining acceptance

Recorded: 27 October 2026, 07:12–07:20 EAT. Application baseline: `8506127`.

## Outcome

**Passed: 26 checks, three real timed rounds, three distinct pairings. Cleanup passed.**

Run reference: `dc36a595-ec57-405c-88ae-e90fc9edc59f`. Five existing tagged test accounts authenticated through independent Supabase Auth sessions. Two fresh `[TEST]` events were private, registration-closed, unlinked to Communities and invisible to public discovery. Three attendees used approved zero-value manual test orders; no payment provider was invoked.

The Host and helpers used their own public-key authenticated API sessions, not service-role impersonation. Server credentials provisioned only the fresh fixtures and inspected their scope. An existing Super Admin session was reserved for audited fixture closure, not Host commands or role grants. Existing account credentials, profile fields, roles, relationships and real event records were unchanged.

## Verified against real persisted data

| Area | Result |
| --- | --- |
| Access | Anonymous visibility and signed-out attendance denied. Host assigned helpers without Super Admin. A helper could not open the simultaneous unassigned event or export attendance. |
| Check-in | Wrong-event QR rejected. Three arrivals saved through two helpers using QR payload and manual-code paths. Duplicate scan returned Already checked in. Host totals and operator activity reconciled after fresh reads. |
| Attendance export | Three guests and operator attribution returned to the Host; no email or private pass code. This checks the database export RPC, not an actual browser CSV download. |
| Revocation | Removing a helper immediately denied another scan in that same authenticated session. |
| Invitation | A checked-in guest received the running-session reminder. Reading it did not join networking. Host pause removed it; resume restored the session. |
| Consent and shared timing | Separate guests accepted their offers. A later fresh request preserved the match ID and authoritative end time. |
| Real rotation | Two-minute conversations, 30-second changeovers; a third guest joined after the first pair became active. Round 1: Guest A/B. Round 2: A/C. Round 3: B/C. All three completed introductions were observed by both participants; each guest finished with two People you met entries. |
| Help and follow-through | A guest's help request reached the Host API, resolution persisted, and completed-pair relationship states reloaded. No connection request or message was sent. |
| Host finish | Host finished networking without Super Admin approval. |
| Cleanup | Both events cancelled through the audited lifecycle; event, guest-place and zero-value order states read back cancelled; helper access removed and Host assignments paused. Audit evidence and the tagged test venue remain. |

The successful run recorded 42 observations over about seven minutes. It used real server time, not a rewritten clock. Detailed machine evidence is retained locally at `tmp/networking-api-rehearsal-dc36a595-ec57-405c-88ae-e90fc9edc59f.json`; it is not a public credential or a production acceptance certificate.

## Test-runner corrections

Two earlier attempts did **not** establish timed-rotation acceptance. One exposed an incorrect cleanup assumption: PostgREST builders are thenable, not native promises with `.catch()`. Both had incomplete continuous observation. Their isolated events were subsequently closed through the supported audited lifecycle; no real event was cancelled.

The runner now checkpoints results, limits requests, uses monotonic elapsed time, fails if observation pauses for more than 45 seconds, and uses supported lifecycle cleanup instead of direct status updates. The successful attempt remained continuously supervised. Earlier incomplete attempts are not counted as passing evidence or proof of a matching-engine failure.

## Three verification levels

| Level | Current evidence | Boundary |
| --- | --- | --- |
| L1 — Code/component | Existing component tests, clock states, permission/error handling and new rehearsal safety contracts. | Controlled execution is not a real person's device. |
| L2 — Integration | Existing rollback SQL assertions plus this persistent, independent-session Auth/API run. | SDK QR payload submission is not a physical camera scan. Fresh API reads are not browser refresh or phone lock. |
| L3 — End-to-end outcome | Earlier example-data desktop/mobile visual checks only. | Independent real-device and operational acceptance below is still open. |

## Phase 3 — ordered handover checklist

Use a consenting, isolated test event. Record device/browser, exact action, expected result, actual result, evidence and cleanup for each row. Do not use real customer passes or send messages without consent.

- [ ] **Door flow:** physical iPhone/PWA and Android QR scan; camera denial/manual fallback; background/resume; wrong-event and duplicate pass; network failure/retry. Confirm only one saved arrival and the correct helper/time.
- [ ] **Guest/Host UI:** normal browser sign-in, event navigation and Host assignment. Refresh each screen; ensure data persists and helper cannot see roster/export/Admin tools. Test the CSV download and file contents.
- [ ] **Networking:** two physical guests accept, compare table/end time, lock/unlock and reconnect. Check Skip, unanswered offer, early end on both screens, Find someone else and Leave networking. Confirm no stale portrait or involuntary rejoin.
- [ ] **Safety:** Host pause/resume/finish, Admin disable and denied Host override, block/revoked place, private help and another event's denial. Some have rollback integration coverage, but still need operational UI acceptance.
- [ ] **Connections:** after a completed introduction, explicitly request and accept/decline using consenting accounts. Confirm private contact details and messaging remain closed before acceptance. No such request was sent in this API run.
- [ ] **Email:** inspect provider result and recipient Inbox/Spam for helper/booking/connection messages. DNS currently verifies DKIM, SPF and return-path MX for `caseready.africa`; the send-only key cannot prove dashboard delivery or inbox placement. Vercel Hobby's once-daily job does not guarantee immediate queued email; share the scoped helper link directly for staffing.
- [ ] **Paid eligibility:** PSP sandbox paid/fulfilled, cancelled and refunded order paths. This rehearsal used free zero-value records only.
- [ ] **Scale/accessibility:** 10–20 consenting guests over several rounds; keyboard/screen-reader use; reduced motion; legible mobile controls and Host workload.

## Running the tool again

This is an explicit live-write operation, not part of `npm test`:

```sh
HAT_CONFIRM_NETWORKING_REHEARSAL=yes npm run ops:events:accept-networking
```

It requires the existing ignored local Supabase and tagged-account test configuration, including the owner cleanup login. Do not paste secrets into Git, documentation or chat. The command is pinned to the intended project and refuses non-test participants. Keep the process continuously supervised until its cleanup summary appears; inspect the report if interrupted. Never weaken eligibility, reset passwords or grant global roles to force a pass.

No new migration, Vercel environment variable or UI change is needed for this tooling. The next release decision should use the remaining acceptance evidence, not a fabricated overall completion percentage.
