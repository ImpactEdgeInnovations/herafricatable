# Event creator, Host, Admin and member preview

Updated: 17 October 2026.

## Changes

- Corrected the creator lookup to `member_event_proposals.canonical_event_id`. It no longer queries a nonexistent `event_id` column.
- Event creator history, current Host authority and event Admin/staff oversight are separate presentation inputs. Invitation permission no longer makes someone appear to be the Host. A former creator does not regain Host controls from the creator record.
- Creator label: **You created this event.** Assigned Host label: **You are hosting this event.** Admin-only label: **You have Admin access to this event.** Host tools lead to the scoped Host workspace; Admin oversight leads to `/admin/events?event=…&view=overview`.
- **Preview the member view** is available to the creator, assigned Host and authorised event manager. It is a read-only view for a prospective member who has not booked, not account impersonation or a permissions change. An ordinary member supplying the preview query string receives their normal member page.
- Preview omits invitations, Host editing, live registration/Community-joining components, menu feedback, personal orders/passes, introductions, attendee preference controls and archive uploads. Ticket options are rendered statically with a disabled booking button. Questions omit hidden items and management flags; all five question write handlers also reject read-only invocation, and retained composer state cannot expose forms.
- Role-read failures do not infer Host authority or show a booking form. Reload remains available. Preview URLs are noindex; normal canonical metadata is retained.
- Existing database authorisation functions, role assignments, RLS, ticket inventory and payment flows are unchanged. No migration is needed.

## Verification

**Level 1 — passed:** actual full-page server rendering for creator+Host, assigned Host, Admin-only, former creator, ordinary member, past Host and role failure. Controlled service calls verify the canonical creator filter, correct workspace destination and no preview private-account reads/mutable widgets. The real questions component renders no forms/actions even with retained composer/answer state, and read-only handlers return before accessing mutation dependencies. Confirmed members and confirmed event-only guests retain pass/introduction access outside preview. Full tests, typecheck and production build passed.

**Level 2 — read-only live capability verification passed:** authenticated-role database contexts on Food & Tech Event returned:

| Account | Creator | Current Host | Event manager |
| --- | --- | --- | --- |
| herafricatable@gmail.com | Yes | Yes | No |
| impactedgeinnovations@gmail.com | No | No | Yes |
| epayments.elbrim@gmail.com | No | No | No |

The role-context check used only temporary results and transaction rollback. It did not authenticate a browser session, change accounts/assignments, create bookings or send messages. Supabase guidance kept database capabilities authoritative and preview state presentation-only.

**Level 3 — pending deployment/browser check:** check the existing Host session's creator wording, Preview link, disabled booking/Community actions and return path. Independent Admin/member browser sessions and physical-device acceptance remain separate until actually exercised.

## Tester checklist

1. Creator/Host opens Food & Tech Event: verify You created this event, Manage your event and Preview the member view.
2. Open preview: verify the read-only notice, ticket options, disabled booking/Community actions and absence of Host/invitation tools. No request, payment, post or message should be sent.
3. Refresh preview, then Return to your event view. Management must return without a role or inventory change.
4. As Admin only, verify Admin wording and the event-filtered Admin controls link—not the Host workspace. As an ordinary member, verify normal booking eligibility and no creator/Host claim.
5. Check a replaced/former creator, past Host and failed role read. Creator history alone must not confer management. Confirmed guests must still see their pass outside preview.
