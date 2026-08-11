# Beta Access and First Admin

## Automation-only password access

The public member and Admin sign-in pages accept email OTP only. Reserved `.invalid`
test identities may still have temporary Supabase passwords so automated acceptance
scripts can exercise multiple roles without sending email. The password is never
stored in this repository or exposed in browser code.

Production administrators use OTP. If a pre-production operational rehearsal requires
a time-limited password, create it directly in Supabase, never share it through the
application UI, and grant authority separately through the audited role workflow.

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.app_role
from auth.users
where lower(email) = 'impactedgeinnovations@gmail.com'
on conflict (user_id, role) do nothing;
```

Rotate or remove any real-person temporary password now that production SMTP works.
Automation-only `.invalid` credentials remain isolated from real members and are
suppressed by the notification worker.

Production does not use shared passwords or hard-coded credentials. Members and team
administrators authenticate with email OTP. Member access follows an approved
application or valid `beta_invites` record, and administrative authority comes
separately from `user_roles`.

Before the first administrator signs in, add an invite through the Supabase SQL Editor:

```sql
insert into public.beta_invites (email, intended_role)
values ('YOUR_ADMIN_EMAIL@example.com', 'super_admin');
```

Use the exact lowercase email the administrator will use with Google or OTP. On first
successful sign-in, the database trigger accepts the invite, creates the profile in
`onboarding` status, and grants `super_admin`.

Invite a beta member without an admin role:

```sql
insert into public.beta_invites (email)
values ('member@example.com');
```

An uninvited person may prove ownership of an email, but remains `pending` and cannot
enter member data. This is deliberate: identity verification and membership approval
are different decisions.
