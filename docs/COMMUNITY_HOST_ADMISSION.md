# Community host admission

Community creation is a controlled member-to-Admin workflow. A member proposal
never creates or publishes a public room by itself.

## Member journey

1. An active member opens **Community** and chooses **Create a community**.
2. She explains the shared purpose, intended members, expected size, admission
   approach, host experience and safety plan.
3. The application remains editable while `pending`. The member can also
   withdraw it.
4. An Admin can move it into review, request changes, decline it or approve it.
5. A changes request returns the form with the Admin note and allows a revised
   submission.
6. Approval creates a `private`, `draft` community and makes the applicant its
   active owner.

The approved host can then open the room and Host workspace, but members cannot
discover or join it until the existing Community release checks pass and a
Super Admin publishes it.

## Admin journey

The queue is under **Admin → Programmes → Community applications**.

- **Start review** tells the member the proposal is being assessed.
- **Request changes** requires a clear member-visible note.
- **Approve and create draft** confirms the final URL, creates the draft and
  active owner, seeds release checks through the existing database trigger and
  notifies the applicant.
- **Decline** requires a clear member-visible note and closes the proposal.

All state changes use security-definer functions, require the expected member
or Super Admin boundary and write audit events. Authenticated clients have no
direct insert or update grant on the application table.

## Production acceptance

- Apply `20260801170000_community_host_applications.sql`.
- Submit a proposal as an active member.
- Confirm a second open proposal is blocked for the same member.
- Start review as Super Admin and confirm the member sees the new state.
- Request changes and confirm the member can edit and resubmit.
- Approve with a unique URL and confirm a private draft plus active owner exist.
- Confirm the draft appears for its owner but not for an unrelated member.
- Confirm approval does not publish the room.
- Confirm the eight Community release checks were seeded.
- Confirm Activity contains the relevant application notification.
