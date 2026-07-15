# Her Africa Table

A trusted professional network for African women, built around real-world events.

## Local setup

1. Use Node.js 22 (`nvm use`).
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local` if it does not already exist.
4. Fill in `NEXT_PUBLIC_SUPABASE_URL` and the remaining environment values.
5. Start the application with `npm run dev`.
6. Open [http://localhost:3000](http://localhost:3000).

The local `.env.local` file is ignored by Git. Never commit Supabase secret keys,
Paystack secret keys, webhook secrets, database passwords, or Resend API keys.

## Deployment

The `main` branch deploys through the Vercel project connected to
`ImpactEdgeInnovations/herafricatable`. Add the values from `.env.example` to
Vercel's Development, Preview, and Production environment settings.

## Database changes

All schema and Row Level Security changes belong in versioned SQL files under
`supabase/migrations`. Production database changes must be reproducible from Git.

