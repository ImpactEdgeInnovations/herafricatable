# 60-day invited-member pilot — controlled acceptance

Updated: 5 October 2026. This is the evidence sheet for `JOIN-01` in the [implementation taskboard](./UX_EVENTS_IMPLEMENTATION_TASKBOARD.md). The migration adds controls; it does **not** turn automatic approval on.

## Intended journey

1. Super Admin chooses **Auto-welcome invited people for 60 days** under Admin → Members. The database stores an end date. Admin can return to manual review or pause requests at any time.
2. Super Admin enters a tester's email in **Invite your first members**. The existing Resend worker sends the invitation. A Community owner or Event Host can also invite someone to her approved destination, subject to the existing Admin review of new external emails.
3. The invitee verifies the *same* email with OTP, completes the short membership application, and is approved into profile setup while the setting and invitation remain valid. A non-invited verified applicant still waits for Admin review.
4. After 60 days, new applications return to manual review automatically. People already approved keep their memberships. Admin may suspend a particular member separately.

## Deployment and release order

1. Apply [20261005120000_invited_membership_pilot_window.sql](../supabase/migrations/20261005120000_invited_membership_pilot_window.sql) to the production Supabase project. The earlier [application-order migration](../supabase/migrations/20261005110000_invited_member_application_order.sql) must already be applied.
2. Deploy the matching code. No new Vercel secret is needed; the existing notification worker requires `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_SITE_URL` and its scheduler settings.
3. Confirm the functions exist, without changing settings:

   ```sql
   select
     to_regprocedure('public.get_membership_pilot_window()') as window_function,
     to_regprocedure('public.invite_pilot_member(text,text)') as invite_function,
     to_regprocedure('public.revoke_pilot_member_invitation(uuid,text)') as revoke_function;
   ```

4. Only then should Super Admin deliberately enable the timed setting in Admin → Members. Do not enter test credentials or OTPs in this sheet.

## Acceptance record

Use controlled inboxes and distinct test identities. Record date, role and result, not the address, OTP or private application content.

| Check | Expected result | Result/date/role |
| --- | --- | --- |
| Default off | Migration and deploy alone do not change manual review, unless the existing trusted-invitation mode was already on; that mode receives a 60-day sunset | Not run |
| Timed on | Super Admin enables invited-only approval; the end date is visible and is no more than 60 days away | Not run |
| Invite delivery | Super Admin sends a controlled invitation; queue record, provider ID and recipient inbox agree; repeated processing sends no second email | Not run |
| Invited application | OTP on the invited email leads to the short application, then automatic approval and profile setup | Not run |
| Uninvited application | Another verified email completes the application but remains under manual review | Not run |
| Revocation | An unused invitation is withdrawn; its queued email is suppressed and it cannot auto-approve a later application | Not run |
| Early off | Admin changes to manual review; existing approved members keep access, new applications wait | Not run |
| Expiry | A controlled time-bound database test proves the 60-day window falls back to manual review without a cron job | Not run |
| Member pause | Admin can suspend one approved test member without pausing all intake | Not run |
| Boundary | Invitation never grants Super Admin, Event Staff, Event Host or Community owner permissions | Not run |

`JOIN-01` remains In progress until the separate-account checks and Admin release evidence are recorded. Automatic event publication is **not** part of this setting.
