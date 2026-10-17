# Community join messages — handover

Updated: 17 October 2026.

## Member and Host flow

- Ask to join opens a small in-page dialog with **Message to the Host (optional)** and **Send request**. Blank messages are allowed; notes are trimmed and limited to 500 characters.
- The directory, Community About page and linked event's Community button use the same new guarded operation. Open joining and explicit invitation acceptance do not require a message dialog. The directory also offers an optional note when joining a full Community's waiting list.
- Failed submissions retain the submitted message in component memory for retry, not device storage. Cancel sends no request. Synchronous locks prevent duplicate prompts/submissions.
- Host tools → People → Waiting for your decision shows the note beside the pending member. Waiting-list notes appear under Member places. A failed message read is visible and disables the affected review buttons until reloaded.
- Existing Approve and Decline actions remain. Decline requires a private reason of 5–500 characters; the existing decision notification path includes that explanation for the applicant.
- Applicant messages are not Community posts and are not added to notification emails or audit metadata. RLS limits reading to the active requester, active authorised reviewers and Super Admin. Notes are removed when a membership request is resolved/cancelled or the person leaves the waiting list; an approval request still pending after a waitlist transition retains its note.

## Database and verification

Migration `20261016135714_community_optional_join_message.sql` is applied to the live project. No owner SQL action is needed. Existing approval, invitation, capacity, payment and notification functions are reused rather than replaced.

**Level 1 — passed:** actual three entry handlers exercised with controlled dependencies: optional/trimmed messages, cancel, duplicate prompt lock, returned/thrown error recovery, retained retry notes, open/invited behavior and waiting-list results. The shared Host note render escapes markup and distinguishes no message from failed reads. Full automated suite, typecheck and production build passed.

**Level 2 — passed for core database behavior:** rollback-only test `supabase/tests/067_community_optional_join_message.sql` used tagged accounts and the archived acceptance Community. Saved/trimmed notes, blank notes, 500-character Unicode boundary, overlong/duplicate rejection, open admission, full capacity, waiting-list removal, decline-reason persistence and resolved-note cleanup passed. Requester/owner/moderator/Super Admin reads passed; unrelated-member and suspended-Host reads and direct note writes were denied. Anonymous execution/read and authenticated direct writes are not granted. Readback confirmed the fixture restored to archived and zero fixture notes remained. No live email was delivered. A further attempted rehearsal of email-queue content was interrupted by connector errors and is not claimed as passed; the retained test file is the core version that returned PASS.

Security advisors identify the intentionally authenticated security-definer join RPC. It authenticates the actor, uses an empty search path and delegates to the existing scoped joining function. The cleanup trigger is not executable by authenticated clients; the note table has RLS and a SELECT-only authenticated grant. Existing unrelated project-wide advisory findings remain on the security audit track. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

**Level 3 — open:** two-person browser/device walkthrough and inbox delivery were not exercised by this implementation. Test 067 is a test, not a migration; do not paste it into production setup as a migration.

## Tester checklist

1. In an authorised test Community with Review each request enabled, ask to join with a short message. Try cancelling first, then submit. Refresh the applicant and Host pages; the request and private note should remain.
2. Check the same flow from a linked event and the About page. Open joining and accepting a genuine invitation must not add unnecessary message steps.
3. With another ordinary account, confirm the note is absent from Community content and member views. A removed moderator must not retain access.
4. Host reads the message, then approves or declines. Decline requires a reason. Confirm the applicant sees the private decision and reason under Updates; separately verify email delivery if enabled.
5. Repeat with a blank message, a full waiting list, and a disconnected connection. Retrying must preserve text, recover controls and not create duplicate membership requests.
6. Check the dialog, focus, Cancel/Escape, wrapped note and Host review controls on desktop and mobile. No unrelated real Community membership or email should be changed for rehearsal.
