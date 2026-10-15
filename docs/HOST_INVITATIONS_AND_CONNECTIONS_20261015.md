# Host invitations and member connections

## Connection requests

1. Open a member's profile, Community People list, event attendee list or member directory.
2. Choose Ask to connect. Add an optional note, for example: “We met at Geco Cafe. I would love to keep in touch.”
3. The recipient sees an in-platform update and, if her connection-email preference is enabled, receives an email naming the requester.
4. She can open the requester's shared profile and read the private note before choosing Accept or Not now.
5. Private messaging opens only after acceptance. Phone/WhatsApp details remain hidden unless connected and explicitly shared. Visibility, blocking and request limits still apply.

The email does not copy the note text, and a legitimate later request generates a new alert. Declines remain private and existing 30-day/7-day re-request cooldowns are unchanged.

## Invite several people

In Community Host tools → People, or Event Host tools → Invite people:

- Paste email addresses separated by commas, semicolons or new lines.
- Check the recipient chips; duplicates are removed and invalid addresses are highlighted.
- Add an optional message or choose a prepared note.
- Choose Review & send and confirm. Each person receives her own invitation; no CC list is used.
- Check Recent invitations → Refresh status. Unsuccessful addresses stay in the box for correction. Existing own invitations are reused rather than emailed twice.

The limit remains 20 invitations in 24 hours, across events and Communities. An invitation does not reserve an event seat, bypass Community entry rules or grant membership. New visitors complete the existing Her Africa Table onboarding; current pilot/approval rules remain authoritative.

“Email sent” means Resend accepted the message, not that it appeared in the inbox. Queued messages await the existing worker/retry schedule; failed ones need support. Invitation progress (open, continued, joined/requested) is separate from email delivery.

## Missing invitation investigation

The Food, Fitness, Fashion invitation reported on 15 October was accepted by Resend at 09:36 EAT, with one attempt and no sending error. It was not resent during investigation. The send-only key cannot retrieve later provider events; this is expected restricted access, not a reason to expose or broaden the key.

Product Owner: in Resend → Emails, inspect message `01a13e46-fdaf-7516-9ced-121b1f5f208b` and its delivered/bounced status. Ask the recipient to check Spam/Promotions and search for Her Africa Table. The provider's [retrieve-email documentation](https://resend.com/docs/api-reference/emails/retrieve-email) distinguishes dispatch from later delivery events. The platform currently reports provider acceptance; it does not claim a verified inbox receipt or open tracking.

## Host workspace

- Overview: useful totals, unanswered questions, alerts and practical shortcuts.
- People: invitations, join requests, members and welcome tools.
- Meetups: plan a meetup or link an event you currently host.
- Images & style: Community branding/location and photo tools.
- Settings: who can join, member limits and advanced tools.

Switching areas does not discard forms or selected files. Existing deep links open their correct area without a separate page redirect. Moderator/owner permissions are unchanged. Paid decisions remain with Admin.

## Release verification

Already applied: `20261015074506_connection_alerts_and_invitation_batches.sql`. Do not rerun manually; direct SQL application does not itself write Supabase migration history.

Test (not a migration): `supabase/tests/061_connection_alerts_and_invitation_batches.sql`. It uses only tagged `.invalid` accounts and synthetic rollback records. It verified pre-acceptance profile/note access, contact privacy, repeat alerts, email opt-out, invitation normalization/idempotency, separate recipient jobs, the 20/day limit, own-Host delivery visibility and anonymous/ordinary-member denial. No external email was sent by the rehearsal.

Automated tests cover cancelled confirmation, uncertain delivery, partial failures, route ownership/cross-origin checks and retained accessible Host areas. Full populated multi-account/browser acceptance, real mobile devices, concurrent stress and the reported recipient's inbox placement remain separate checks. Existing historical database replay/security-advisor work is not declared resolved by this release.
