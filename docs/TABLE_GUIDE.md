# Nia · Table Guide operations

Nia is the platform's clearly labelled AI Table Guide. She answers platform questions,
surfaces member-safe events and Communities, and shows deterministic connection
suggestions. It does not approve access, publish content, send messages, create
connections, process payments or read private conversations.

Nia may prepare a clearly labelled draft, summarise recent Community posts that the
signed-in member is already allowed to read, and offer one relevant next-step link.
The answer remains inside the panel. Following a link, sending a request, publishing
or registering is always a separate member-controlled action.

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

Each member is limited to 60 delivered or safely refused answers per day. Provider
errors do not consume that allowance: Nia falls back to permission-filtered platform
guidance while Admin receives a safe diagnostic code. The support route remains
available when the provider or feature is unavailable.

## Movable member companion

When the feature is active, Nia appears as a small wine-and-aubergine companion on
signed-in member pages. A member turns her on inside the floating panel, without a
redirect, then sees page-aware suggestions and a question box immediately. Nia can
be placed anywhere inside the safe viewport and kept still. Her saved position
remains on that browser only.

The visible conversation exists only in the current browser screen. **Clear
conversation** removes it immediately, and refreshing the page also starts fresh.
Prompts and answers are not stored as chat transcripts in Her Africa Table.

The companion uses restrained movement, honours `prefers-reduced-motion`, stays
clear of the mobile navigation and never reports internal development or deployment
activity to members. Its page-aware prompts explain the current member journey;
they do not expand the Guide's data access or action permissions.

## Community Host writing help

Approved Community owners and moderators can ask Nia for a welcome post,
discussion prompt, event outline or recap from the Host workspace. The endpoint
checks Community management permission on the server, moderates the supplied notes,
uses `store: false`, and returns an editable draft. It never saves or publishes the
draft. If the provider is unavailable, a restrained local template keeps the Host
workflow usable without weakening permissions.
