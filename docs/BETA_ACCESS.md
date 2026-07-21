# Beta Access and First Admin

## Temporary password access

Until production email delivery is configured, the sign-in pages also accept a
temporary Supabase email/password account. The password is never stored in this
repository or exposed in browser code.

Create the temporary account in Supabase Dashboard → Authentication → Users, using
the approved administrator email. Mark the email as confirmed. Then grant the account
its role in the SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin'::public.app_role
from auth.users
where lower(email) = 'impactedgeinnovations@gmail.com'
on conflict (user_id, role) do nothing;
```

Remove or rotate the temporary password as soon as email OTP and production SMTP are
working. OTP remains the intended production sign-in method.

Production does not use shared passwords or hard-coded credentials. Members and team
administrators authenticate with email OTP. Access is granted through
`beta_invites`, and administrative authority comes from `user_roles`.

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
