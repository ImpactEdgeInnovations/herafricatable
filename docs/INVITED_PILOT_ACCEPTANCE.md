# 60-day invited-member pilot — controlled acceptance

Updated: 5 October 2026. This is the evidence sheet for `JOIN-01` and `HOST-03` in the [implementation taskboard](./UX_EVENTS_IMPLEMENTATION_TASKBOARD.md). The migrations add controls; activation is a separate Super Admin action.

## Live activation checkpoint

On 5 October 2026 at 11:16 EAT, the Super Admin authenticated to the production Supabase project and enabled `trusted_auto` plus the separate private-event-draft setting. Read-back returned `trusted_auto`, `privateEventDrafts=true` and a database expiry of **4 December 2026 at 11:16 EAT**. The deployed health endpoint reported release `cc5ebdc`, database reachable and server integration ready. Two applications already pending review remained pending. This confirms setting state, not invitation delivery or a real member/event journey.

## Intended journey

1. Super Admin chooses **Auto-welcome invited people for 60 days** under Admin → Members. The database stores an end date. Admin can return to manual review or pause requests at any time.
2. Super Admin enters a tester's email in **Invite your first members**. The existing Resend worker sends the invitation. A Community owner or Event Host can also invite someone to her approved destination, subject to the existing Admin review of new external emails.
3. The invitee verifies the *same* email with OTP, completes the short membership application, and is approved into profile setup while the setting and invitation remain valid. A non-invited verified applicant still waits for Admin review.
4. After 60 days, new applications return to manual review automatically. People already approved keep their memberships. Admin may suspend a particular member separately.

## Deployment and release order

1. Apply [20261005120000_invited_membership_pilot_window.sql](../supabase/migrations/20261005120000_invited_membership_pilot_window.sql) to the production Supabase project. The earlier [application-order migration](../supabase/migrations/20261005110000_invited_member_application_order.sql) must already be applied.
2. For private event creation by directly invited pilot members, apply [20261005130000_invited_pilot_private_event_drafts.sql](../supabase/migrations/20261005130000_invited_pilot_private_event_drafts.sql) after the timed membership migration. It defaults **off**. Deploy the matching code. No new Vercel secret is needed; the existing notification worker requires `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL` and its scheduler settings.
3. Confirm the functions exist, without changing settings:

   ```sql
   select
     to_regprocedure('public.get_membership_pilot_window()') as window_function,
     to_regprocedure('public.invite_pilot_member(text,text)') as invite_function,
     to_regprocedure('public.revoke_pilot_member_invitation(uuid,text)') as revoke_function;
   ```

4. Only then should Super Admin deliberately enable the timed setting in Admin → Members. The separate **Pilot events** switch may be enabled after a private-draft rehearsal. Do not enter test credentials or OTPs in this sheet.

## Acceptance record

Use controlled inboxes and distinct test identities. Record date, role and result, not the address, OTP or private application content.

| Check | Expected result | Result/date/role |
| --- | --- | --- |
| Default off | Migration and deploy alone do not change manual review, unless the existing trusted-invitation mode was already on; that mode receives a 60-day sunset | Not run |
| Timed on | Super Admin enables invited-only approval; the end date is visible and is no more than 60 days away | Passed, 5 Oct 2026, Super Admin RPC read-back; ends 4 Dec 2026 at 11:16 EAT |
| Invite delivery | Super Admin sends a controlled invitation; queue record, provider ID and recipient inbox agree; repeated processing sends no second email | Not run |
| Invited application | OTP on the invited email leads to the short application, then automatic approval and profile setup | Not run |
| Uninvited application | Another verified email completes the application but remains under manual review | Not run |
| Revocation | An unused invitation is withdrawn; its queued email is suppressed and it cannot auto-approve a later application | Not run |
| Early off | Admin changes to manual review; existing approved members keep access, new applications wait | Not run |
| Expiry | A controlled time-bound database test proves the 60-day window falls back to manual review without a cron job | Not run |
| Member pause | Admin can suspend one approved test member without pausing all intake | Not run |
| Boundary | Invitation never grants Super Admin, Event Staff, Event Host or Community owner permissions | Not run |
| Pilot private event | A directly invited active pilot member sends a free event idea at least seven days ahead and immediately receives only that event's private Host workspace | Not run |
| Event limits | The same Host cannot automatically create more than two private pilot events; an uninvited member still waits for event-team review | Not run |
| Event publication | The private event, draft ticket and Host page are not public or bookable; safety and public launch remain with Admin | Not run |
| Event off switch | Admin disables automatic private drafts; new proposals wait for review while existing event records remain intact | Not run |
| Event on switch | Super Admin enables private drafts separately after the timed membership setting | Passed, 5 Oct 2026, Super Admin RPC read-back |

`JOIN-01` and `HOST-03` remain In progress until separate-account checks and Admin release evidence are recorded. Automatic event publication is **not** part of either setting.
