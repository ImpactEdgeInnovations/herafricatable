import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const pilot = read("supabase/migrations/20261007100100_founding_pilot_self_service.sql");
const invitations = read("supabase/migrations/20261007100200_pilot_invitation_and_publication_completion.sql");
const consistency = read("supabase/migrations/20261007100300_pilot_control_consistency.sql");
const route = read("app/api/member/invitations/deliver/route.ts");
for (const contract of ["public.founding_pilot_member_ready(auth.uid())", "public.get_pilot_free_event_setting()", "public.can_host_event(p_event_id)", "proposal.proposed_by = auth.uid()", "event.status = 'published'", "public.community_pilot_member_ready(auth.uid())", "a.applicant_id = auth.uid()", "Paid Communities still need team approval", "community_release_ready_standard", "from public, anon, authenticated"])
  assert(pilot.includes(contract), `Missing pilot boundary: ${contract}`);
assert(invitations.includes("public.create_table_invitation_reviewed"));
assert(invitations.includes("'table_invitation'"));
assert(invitations.includes("null::text"), "Never return the recipient's invitation token to the sender");
assert(consistency.includes("invitation.expires_at>now()"));
assert(consistency.includes("blocked.updated_at>=invitation.sent_at"));
assert(consistency.includes("not profile.is_test_account"));
assert(route.includes('.eq("inviter_id", user.id)'));
assert(route.includes('data.status !== "sent"'));
assert(route.includes("strictTarget: true"));
assert(read("lib/notifications/worker.ts").includes("dedupeKey && !strictTarget"));
assert(read("components/events/event-host-workspace.tsx").includes('hidden={section !== "programme"}'));
assert(read("app/events/[slug]/page.tsx").includes("if (eventLoadError)"));
assert(read("app/events/[slug]/page.tsx").includes('href={user ? "/home" : "/"}'));
assert(read("app/sign-in/page.tsx").includes("if (user) redirect(safeNext(next))"));
assert(read("components/events/event-host-workspace.tsx").includes('["image", "Poster"]'));
for (const path of ["app/events/page.tsx", "app/events/past/page.tsx"]) {
  assert(read(path).includes("Back to home"), `${path} needs an obvious return route`);
}
console.log("Founding self-service, owned invitation delivery and pause boundaries verified.");
const cancel = read("supabase/migrations/20261007110000_pilot_host_event_cancellation.sql");
for (const boundary of ["public.can_self_publish_pilot_event(p_event_id)", "p_action = ''cancel''", "review_status <> 'pending'", "Tickets will not be restored", "alter table public.pilot_event_cancellations enable row level security", "from public, anon"]) {
  // Review copy uses the same no-restoration policy in plain language.
  if (boundary === "Tickets will not be restored") assert(read("components/events/pilot-event-cancellation.tsx").includes("Tickets will not be restored"));
  else assert(cancel.includes(boundary), `Missing cancellation boundary: ${boundary}`);
}
assert(!cancel.includes("set status = 'confirmed'"), "Admin review must never restore tickets");
assert(read("components/applications/application-image-quick-edit.tsx").includes('saved.status === "approved"'));
