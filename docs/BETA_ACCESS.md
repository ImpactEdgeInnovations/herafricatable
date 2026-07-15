# Beta Access and First Admin

The beta does not use shared passwords or hard-coded credentials. Members and team
administrators authenticate with Google or email OTP. Access is granted through
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
