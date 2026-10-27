# Event operations — refinement and acceptance

Updated: 27 October 2026 (Africa/Nairobi). Engineering and persistent multi-session API rehearsal passed; independent phone/inbox rehearsal remains open.

**Persistent integration evidence:** The 27 October rehearsal passed 26 checks using five existing tagged accounts, including three real timed rounds with no repeated pair and verified cleanup. See [recorded results and phase-3 acceptance](NETWORKING_API_REHEARSAL_20261027.md). The checklist below remains open wherever it requires physical devices, real inboxes, a paid-provider path or consenting browser interaction; the API run does not mark those outcomes complete.

## Delivered

1. **Scanner:** event identity stays prominent; large, distinct success/already-checked-in/not-accepted/unconfirmed states; recorded name/time; one Next guest action before reopening the scanner or manual entry. A network error is not mislabelled as a rejected pass. Manual codes remain available when native QR detection/camera permission is unavailable. Camera startup is locked against duplicate requests. Hiding/leaving the page stops the stream; a late permission response cannot leave a hidden camera running. Switching back does not automatically reactivate it.
2. **Host live panel:** one current-round/changeover clock, Ready to meet / Paired / Taking a break counts, and grouped Start/Pause/Resume/Finish controls. Paired includes offers awaiting mutual acceptance, not only accepted conversations. Counts disappear on failed refresh; a paused timer is not shown as continuing to run. Networking and helper management remain Host-operated without Super Admin approval; Admin safety disable and separate publication/payment gates remain.
3. **Guest reminder:** an inline Networking is live strip in the signed-in member shell, with event title, local finish time, Open networking and Not now. The server restricts it to checked-in guests with valid event access, a currently running session and no Admin disable. It is a read-only lookup, not a heartbeat, matching tick, join, booking change, email or push. Refreshes every 30 seconds while foregrounded; failed reads hide stale data and resume clears/reloads it. Not now hides that session for the mounted page visit, not permanently or across devices. Event detail/Host/scanner pages suppress this extra strip because they already have event-specific tools.
4. **Follow-through:** Home and Events have a compact, expandable People you met area linking to the relevant event's existing networking panel. Up to ten recent events within the existing 14-day eligibility window; completed, unblocked introductions only. The event panel distinguishes Request sent, Respond to her request, Connected and a new connection action. Status failure disables unknown actions rather than inventing availability. Relationship reads are cached for 30 seconds, refreshed immediately after sending, and never bypass the normal connection acceptance rules. Accepted connections remain in Your connections. No retention window or contact-sharing permission was expanded.
5. **Attendance download:** Host → Guests & check-in → Download attendance (CSV). Includes all current confirmed/attended guests, not only the visible page: event, timezone, report timestamp, name, arrival state, UTC/local check-in time, operator and QR/manual method. No emails, payment details, private codes or QR tokens. Undone arrivals are excluded from active arrivals. Files are private/no-store attachments, spreadsheet text is formula-neutralised/quoted, and every successful export writes an audit event. Helpers/other event Hosts are denied by the same event-scoped database manager guard. Exports over 5,000 guests return an explicit limit error rather than a truncated file.

## Database

`supabase/migrations/20261026115758_event_networking_followthrough_and_exports.sql` applied live. Three authenticated RPCs only; explicit auth/ownership/eligibility checks, empty search paths, no direct private-schema grants and no service key in clients. No roles, real event records or real invitations changed during verification. Tests ran in rollback-only transactions. Advisors retain the existing private deny-all RLS, legacy definer-RPC and leaked-password-protection notices; this is not a project-wide security clearance.

No owner SQL or Vercel environment change is required.

## Verification

| Level | Evidence | Still not demonstrated |
| --- | --- | --- |
| L1 — code/component | Actual scanner component states and scoped writes; duplicate/pending camera request, hidden late-permission cleanup, fallback/manual normalisation; CSV escaping/formula safety; actual download route 200/401/403/503 and private attachment headers; reminder dismissal/rendering/foreground polling; Host controls and connection-state labels. Included in `npm test`. TypeScript and production build required. | Browser camera hardware, true parallel devices and delivered emails. |
| L2 — real database integration | Expanded `supabase/tests/071_host_event_arrival.sql`: 67 rollback-only assertions, before and after application. Includes all prior event/helper isolation plus full 31-row export, operator attribution, no pass/email data, Host/helper export boundaries, live checked-in reminder, no automatic opt-in, pause suppression, other-event denial, completed history, outgoing/incoming/accepted states, block privacy and post-event export. | A committed human-browser rehearsal or provider/inbox delivery. |
| L3 — visual/outcome | Actual components with clearly labelled example data reviewed at 390px and desktop; no horizontal overflow. Scanner success has one next action. Host controls and bounded rosters are visible. | Signed-in multi-account production flows, physical iOS/Android scanning, screen-reader acceptance and notification delivery remain open. |

## Physical-device and operational rehearsal — still open

- [ ] Choose an isolated test event, one consenting Host, two consenting helpers and 5–10 guests. Include a free guest, a valid paid guest, someone not checked in and a second simultaneous event's pass.
- [ ] Host assigns both helpers without Admin approval; verify their own-account notification and link, then camera/manual check-in on physical Android and iPhone/PWA.
- [ ] Repeat a scan, try the other event's pass, interrupt camera permission/switch apps, and reconnect after a failed request. Confirm one arrival only.
- [ ] Host verifies individual times, operator totals and CSV after refresh; helper cannot open the report/export. Remove a helper with her scanner open and verify the next action is denied.
- [ ] Start networking; only checked-in guests receive the inline reminder. Not now must not register/opt in. Join on the event page, mutually accept, and run at least three rounds with one late arrival and an odd count.
- [ ] Verify shared timers after phone lock/reconnect, skip/early end on both devices, no repeat pair, Host pause/resume/finish, help handling and Admin safety disable.
- [ ] Complete an introduction, send a connection request, verify the other account's pending state, accept it and revisit from Home/Events. Confirm no contact details or messaging opened before acceptance.
- [ ] Inspect Resend delivery plus the actual consenting recipient's inbox/Spam for helper/booking emails. The current Hobby cron is once daily (`0 5 * * *`); a queued email cannot be treated as immediate same-day staffing communication. Share the authorised scanner link directly when necessary.

The next release decision should be based on this rehearsal's recorded results, not a visual completion percentage. Groups of three, online/video networking, AI pairing, a permanent introduction archive and offline check-in remain outside this release.
