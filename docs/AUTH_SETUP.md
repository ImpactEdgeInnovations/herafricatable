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
4. In Supabase Dashboard → Authentication → Email/SMTP, enable custom SMTP and use:
   - Host: `smtp.resend.com`
   - Port: `465` (or `587` with STARTTLS)
   - Username: `resend`
   - Password: a Resend API key stored only in Supabase
   - Sender name: `Her Africa Table`
   - Sender email: `community@caseready.africa` during the temporary-domain period
5. Rate-limit OTP requests and display a neutral response so the UI does not reveal
   whether an email already exists.
6. Do not log OTP values.

The Vercel `RESEND_API_KEY` does **not** configure Supabase Auth email. These are two
separate delivery paths:

- Supabase custom SMTP sends sign-in codes.
- The Vercel `RESEND_API_KEY` and `EMAIL_FROM` send application notifications from
  the protected notification worker.

Both can use Resend and the same verified domain, but each must be configured in its
own dashboard. The public DNS records for `caseready.africa` can be checked with
`npm run ops:email-readiness`; a successful DNS check does not replace the final
Resend dashboard status and inbox test.

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

## Member journey

1. The member enters her email and receives a six-digit code.
2. A new identity continues to the short membership request; a returning member
   continues to the correct account state.
   A verified team account using the ordinary sign-in page is sent directly to the
   Admin workspace; roles are never disclosed before authentication.
3. A submitted request remains private and pending until an Admin decides it.
4. An approved new member completes onboarding before entering the member home.
5. A declined, suspended or dormant member sees a safe status screen and cannot read
   private member or Community data.

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
