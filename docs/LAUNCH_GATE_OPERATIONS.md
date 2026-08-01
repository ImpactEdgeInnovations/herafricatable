# Launch Gate Operations

The Launch Gate workspace is the operational source of truth for the final
go-live decision. Product metrics remain useful signals, but they do not replace
human acceptance, security rehearsal or accountable sign-off.

## Access and boundaries

- Only a Super Admin can list or update launch-gate evidence.
- Event staff, moderators and members cannot read the records.
- Every update writes an audit event containing the check key, status and whether
  evidence exists. The evidence text itself is deliberately excluded from audit
  metadata.
- Do not enter passwords, OTP values, payment credentials, private member
  content or secret configuration values.

## Status meanings

- `Not started`: no acceptance work has begun.
- `In progress`: an accountable owner is actively completing the check.
- `Blocked`: the release cannot proceed; record the blocker and accountable owner.
- `Passed`: the full check completed successfully and concise evidence was recorded.

A required check cannot be marked passed without useful evidence. Open and
blocked checks require an accountable owner.

## Operating sequence

1. Open **Admin → All tools → Release**.
2. Review the environment indicators. They confirm only that required variables
   exist, not that providers have accepted a real transaction.
3. Assign every open check to a named person or operational role.
4. Run the complete check described on the card.
5. Record the date, environment/device, outcome and any follow-up in concise
   language.
6. Mark the check passed only after the evidence can be independently understood.
7. Leave the final governance sign-off open until every other required check has
   passed and the approved rollback owner is available.

## Release interpretation

- Any required `Blocked` check means no-go.
- Any required check that is not `Passed` means not ready.
- All required checks passed means ready for the final human launch decision; it
  does not deploy or enable feature flags automatically.
- Rolling back a release does not erase evidence. Update affected checks and record
  the new rehearsal or decision.

Feature-specific acceptance remains separate from the platform launch gate. Open
**Admin → Release → Module opening checks** for Communities, Community host
payments, Learning, Referrals, Membership checkout, Circles and Partner benefits.
Each controlled module needs:

1. every mapped database capability to be present;
2. a completed two-account member journey;
3. verified privacy and permission boundaries;
4. rehearsed Admin support; and
5. a rehearsed pause-and-recovery path.

Supabase prevents a controlled feature from being enabled until these checks pass.
Turning a feature off remains available at all times. Existing enabled features are
not automatically disabled when the gate migration is installed; review any such
module immediately and either complete its evidence or pause it deliberately.

Communities also retain their room-level eight-check workflow in **Admin → Founding
cohort**. That separate guard prevents a published room with incomplete evidence
from being exposed through the global Communities flag.
