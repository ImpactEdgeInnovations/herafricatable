# Table Guide operations

The Table Guide is an optional member concierge. It answers platform questions,
surfaces member-safe events and Communities, and shows deterministic connection
suggestions. It does not approve access, publish content, send messages, create
connections, process payments or read private conversations.

## Privacy boundary

- Every member chooses whether to use the Guide.
- Inclusion in recommendations is a second, separate choice.
- A recommended member must be active, fully onboarded, visible, unblocked, open
  to direct introductions and explicitly opted in to recommendations.
- Candidate ranking uses only industry, country, city, shared interests and shared
  goals. Private contacts, messages, reports and Admin data are excluded.
- Her Africa Table stores usage totals and outcomes, not prompt or response text.
- The OpenAI Responses API is called with `store: false` and a hashed, stable
  `safety_identifier` that does not contain the member's email.
- All model input is assembled server-side after the signed-in member's Supabase
  authorization checks pass.

## Required Vercel configuration

Add to Production and the intended Preview environment:

- `OPENAI_API_KEY`: server-only OpenAI project API key.
- `OPENAI_MODEL`: optional model override; defaults to `gpt-5.6-luna`.
- `AI_SAFETY_SALT`: random server-only value of at least 32 characters.

Never prefix these values with `NEXT_PUBLIC_`. Redeploy after adding or rotating
them. Keep the Admin feature switch closed until the live acceptance checks pass.

## Release sequence

1. Apply `20260811210000_table_guide_foundation.sql`.
2. Add the three Vercel variables and redeploy.
3. Open Admin → All tools → People and confirm the key and migration checks.
4. Leave the feature closed while one Super Admin and two test members complete
   the acceptance journeys.
5. Opt one test member into recommendations and keep the other opted out.
6. Confirm only the opted-in, visible member can appear as a suggestion.
7. Confirm hidden, paused, blocked, pending and suspended members never appear.
8. Confirm the Guide cannot expose private messages, contacts, safety reports or
   unavailable Communities.
9. Confirm a member must explicitly approve a human support handoff.
10. Open the Admin feature switch only after every boundary passes.

## Operational controls

The Super Admin control shows opt-in totals, recommendation participation, the
last 24 hours of requests and human handoffs. It never exposes member prompts or
responses. Closing the switch immediately stops new AI requests while preserving
member choices and privacy-safe operational totals.

Each member is limited to 60 recorded requests per day. Provider errors return a
plain-language retry message. The support route remains available when the provider
or feature is unavailable.
