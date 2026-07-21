# Her Africa Table — Authentication Setup

Her Africa Table uses one passwordless entry method: a six-digit email OTP delivered
through Supabase Auth. Gmail, Google Workspace and other valid email providers are
supported. Google does not issue the code and Google OAuth is not enabled.

During pre-SMTP testing, the sign-in interface also supports a temporary Supabase
email/password account. This is a migration aid, not the intended production method;
remove or rotate it after email OTP delivery is ready.

## Required application URLs

### Local application

`http://localhost:3000`

### Production application

`https://herafricatable.vercel.app`

Replace the Vercel alias with the final custom domain once attached.

## Supabase URL configuration

In Supabase Dashboard → Authentication → URL Configuration:

- Site URL: `https://herafricatable.vercel.app`
- Additional redirect URLs:
  - `http://localhost:3000/**`
  - `https://herafricatable.vercel.app/**`
  - the approved Vercel preview wildcard for the project/team

Use exact production paths where possible. Wildcards are intended for localhost and
preview deployments, not as a substitute for a precise production allow list.

## Email OTP setup

1. Keep email authentication enabled in Supabase.
2. Configure the email template to send a visible one-time token (`{{ .Token }}`), not
   only a magic link.
3. Add clear expiry and “ignore this email” language.
4. Configure Resend/custom SMTP before production volume; the default Supabase sender
   is for limited development use.
5. Rate-limit OTP requests and display a neutral response so the UI does not reveal
   whether an email already exists.
6. Do not log OTP values.

For an invite-gated flow, authentication may create an identity, but the application
keeps that identity in `pending` state until a valid registration, payment entitlement,
or admin approval exists.

## Environment values

Browser-safe:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Server-only:

```env
SUPABASE_SECRET_KEY=
```

Paystack and Resend secrets belong in server-only Vercel/Supabase secret stores.

## Authentication acceptance tests

- Email OTP request, expiry, invalid code, retry and successful verification work.
- An authenticated but unapproved user cannot access member data.
- An approved incomplete user is routed to onboarding.
- Active, dormant and suspended members receive the correct access.
- Signing out clears the session and protected pages cannot be restored from cache.

## References

- [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Auth with Next.js](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
