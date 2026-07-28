# Temporary Admin access

Temporary Admin accounts must expire at the database authorization boundary.
An authentication password alone never grants Admin access.

## Before provisioning

Apply
[`20260730210000_expiring_admin_access.sql`](../supabase/migrations/20260730210000_expiring_admin_access.sql)
in the production Supabase SQL editor. The migration:

- adds a hard expiry to team-role assignments;
- updates every `is_admin(...)` database decision to reject expired roles;
- backfills expiry from accepted beta invitations where possible;
- provides audited grant and immediate-revocation operations.

## Provision a beta Admin

Run this from the project directory. The password is read into a temporary shell
variable so it is not stored in Git:

```sh
read -s "HAT_PASSWORD?Temporary Admin password: "
echo
HAT_BETA_ADMIN_PASSWORD="$HAT_PASSWORD" \
  npm run ops:provision-beta-admin -- admin@example.com 60
unset HAT_PASSWORD
```

The command is deliberately idempotent. It creates or updates the Supabase Auth
identity, tags it as a test account so it is excluded from production member
metrics, grants `super_admin`, records the 60-day expiry, and then signs in with
the supplied credentials to verify the role.

Successful output must include:

```json
{
  "durationDays": 60,
  "expiryEnforced": true,
  "role": "super_admin",
  "verified": true
}
```

Do not share a temporary password in source files, screenshots, issue trackers,
or chat channels. Revoke access immediately when testing is complete.
