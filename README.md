# Her Africa Table

A trusted professional network for African women, built around real-world events.

Production: [herafricatable.vercel.app](https://herafricatable.vercel.app)

## Delivery documents

- [Production process map](docs/HAT_Process_Map_Developer_Spec.html)
- [30-day production roadmap](docs/ROADMAP.md)
- [Production architecture](docs/ARCHITECTURE.md)
- [Email OTP setup](docs/AUTH_SETUP.md)
- [Beta access and first Admin](docs/BETA_ACCESS.md)
- [Landing-page content requirements](docs/CONTENT_REQUIREMENTS.md)
- [Production release checklist](docs/RELEASE_CHECKLIST.md)

## Local setup

1. Use Node.js 22 (`nvm use`).
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` if it does not already exist.
4. Fill in `NEXT_PUBLIC_SUPABASE_URL` and the remaining environment values. The
   Supabase URL must be the base `https://PROJECT_REF.supabase.co` URL, without
   `/rest/v1`.
5. Start the application with `npm run dev`.
6. Open [http://localhost:3000](http://localhost:3000).

The local `.env.local` file is ignored by Git. Never commit Supabase secret keys,
Paystack secret keys, webhook secrets, database passwords, or Resend API keys.

## Deployment

The `main` branch deploys through the Vercel project connected to
`ImpactEdgeInnovations/herafricatable`. Add the values from `.env.example` to
Vercel's Development, Preview, and Production environment settings.

- `main` is production.
- Use `codex/<feature-name>` branches for implementation work.
- Every feature branch receives a Vercel Preview deployment before merge.
- Production and non-production must use separate Supabase projects before live
  member or payment data is introduced.

## Database changes

All schema and Row Level Security changes belong in versioned SQL files under
`supabase/migrations`. Production database changes must be reproducible from Git.

Production authentication uses Supabase email OTP. Temporary password access exists
only for controlled pre-SMTP testing. Authentication proves identity; registration,
payment or an audited admin approval grants product membership.
