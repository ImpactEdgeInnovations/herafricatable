import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261005190000_founding_community_pilot.sql");
const admin = read("components/admin/community-command-centre.tsx");
const member = read("components/member/community-host-application.tsx");
const adminPage = read("app/admin/communities/page.tsx");
const memberPage = read("app/communities/page.tsx");

for (const contract of [
  "public.community_pilot_settings",
  "public.community_pilot_access",
  "public.get_membership_intake_mode() = 'trusted_auto'",
  "public.communities_enabled()",
  "public.is_active_member(p_user_id)",
  "(select count(*) from public.community_pilot_access) < 20",
  "source in ('existing_tester', 'member_activation')",
  "lower(account.email) = 'epayments.elbrim@gmail.com'",
  "public.is_admin(array['super_admin']::public.app_role[])",
  "set enabled = false, updated_at = now()",
  "application.pilot_auto_draft and application.status = 'approved'",
  "'private', 'draft', new.applicant_id",
  "'owner', 'active', now()",
  "created_community_id = saved_community",
  "after insert or update of status on public.community_host_applications",
]) assert(migration.includes(contract), `Community pilot is missing ${contract}`);

assert(adminPage.includes('rpc("get_community_pilot_admin")'));
assert(admin.includes('rpc("set_community_pilot_setting"'));
assert(memberPage.includes('rpc("community_pilot_member_ready")'));
assert(member.includes('privateDraftReady'));
assert(member.includes('members cannot join until'));
console.log("Founding Community pilot gates and member/Admin controls verified.");
