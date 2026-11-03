# Approval endpoint permission hardening

Delivered: 3 November 2026.

Removed inherited `PUBLIC` and explicit `anon` execution permission from these four existing review functions:

- `review_member(uuid,text,text)` — membership decisions.
- `review_community_host_application(uuid,text,text,text)` — new Community applications.
- `review_member_event_proposal(uuid,text,text)` — member event proposals.
- `review_event_host_workspace(uuid,text,text)` — finished Host draft review.

Signed-in execution is retained because the Admin screens use the operator's authenticated Supabase session. The unchanged function bodies still require Super Admin permission; ordinary signed-in members do not gain approval rights. Existing service-role execution is unchanged. No business logic, default privileges, other endpoints, user roles or real application decisions were modified.

## Verification

| Level | Evidence | Limit |
| --- | --- | --- |
| L1 — implementation | Scoped migration/source checks and the full repository suite passed. The readiness script now requires a real database error code, so a failed network request cannot masquerade as a successful access-denial test. | Source tests alone are not live proof. |
| L2 — database and API | **28 rollback database assertions** passed: four functions × anonymous grant denial, no inherited public execution, authenticated grant retained, service grant retained, actual anonymous `42501` denial, ordinary-member Super Admin denial, and temporary Super Admin reaching normal target validation. A real public-key API check passed for nine protected operations; all four hardened functions returned `42501`. Function-definition hashes match the pre-change baseline. | The Super Admin checks used NULL targets: they prove permission continuity, not successful approval of an application. |
| L3 — user journey | No UI or navigation changes were made. Existing Admin screens call the same functions with the same arguments. | Fresh submit → Admin approve → member access → inbox browser rehearsals remain separate and open. |

All database fixtures rolled back. Follow-up queries confirmed zero remaining test users, temporary test roles or notification jobs. No real approval or provider email was sent.

Security advisors: anonymous privileged-function notices decreased from **550 to 546**. Authenticated notices remained 682; private-table notices remained 51; the existing leaked-password-protection notice remained. This is a four-operation hardening fix, not a project-wide security sign-off. [Supabase's function permission guidance](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable) informed the per-function public/anonymous revocation rather than a blanket change that could break legitimate public features.

## Configuration and files

Migration `supabase/migrations/20261103054825_approval_endpoint_permissions.sql` is already applied to the live project. **No owner SQL or new Vercel variables are needed.**

`supabase/tests/076_approval_endpoint_permissions.sql` is a rollback-only test, **not a migration**. Do not stage it in production migration history.

The migration reloads the PostgREST schema cache. The Node readiness script uses only the public key and nonexistent target IDs; it does not authenticate an Admin or approve any real item.
