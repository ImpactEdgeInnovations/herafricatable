# Her Africa Table — Authentication Setup

Her Africa Table supports two separate passwordless entry methods:

1. **Continue with Google** using Google OAuth through Supabase Auth.
2. **Email me a code** using Supabase email OTP.

Google does not provide the email OTP flow. Supabase manages both methods and can link
identities belonging to the same user, subject to provider and email rules.

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

The application callback route will be:

- Local: `http://localhost:3000/auth/callback`
- Production: `https://herafricatable.vercel.app/auth/callback`

## Google OAuth setup

In Google Auth Platform:

1. Create/configure the Her Africa Table application and consent screen.
2. Request only `openid`, email and profile scopes for sign-in.
3. Create an OAuth Client ID of type **Web application**.
4. Add Authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://herafricatable.vercel.app`
   - final custom origin when available
5. Add the Supabase callback shown on the Supabase Google provider screen as the
   Authorized redirect URI. For a hosted project it resembles:
   `https://PROJECT_REF.supabase.co/auth/v1/callback`
6. Store the Google Client ID and Client Secret in the Supabase Google provider
   configuration. Do not put the Google Client Secret in browser/Vercel public values.
7. Complete Google branding/verification early because approval can take time.

The Google redirect URI is the Supabase callback, while the application's
`/auth/callback` route completes the PKCE code exchange and establishes the Next.js
cookie session.

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

Google OAuth credentials belong in the Supabase provider configuration. Paystack and
Resend secrets belong in server-only Vercel/Supabase secret stores.

## Authentication acceptance tests

- Google sign-in succeeds from localhost and production.
- Email OTP request, expiry, invalid code, retry and successful verification work.
- OAuth errors return to a helpful application screen.
- Redirects outside the allow list are rejected.
- An authenticated but unapproved user cannot access member data.
- An approved incomplete user is routed to onboarding.
- Active, dormant and suspended members receive the correct access.
- Signing out clears the session and protected pages cannot be restored from cache.
- The same email using Google and OTP does not create conflicting member profiles.
- Callback `next` parameters accept only safe internal paths.

## References

- [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase passwordless email](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Auth with Next.js](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
