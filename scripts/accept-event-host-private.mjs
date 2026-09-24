import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const adminEmail = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const adminPassword = process.env.HAT_PRIMARY_ADMIN_PASSWORD;
const testPassword = process.env.HAT_COMMUNITY_TEST_PASSWORD;

if (
  !url || !publishable || !adminEmail || !adminPassword || !testPassword ||
  process.env.HAT_CONFIRM_PRIVATE_EVENT_REHEARSAL !== "yes"
) {
  throw new Error("Set Supabase and tagged test credentials, plus HAT_CONFIRM_PRIVATE_EVENT_REHEARSAL=yes. This creates one private, closed test event.");
}

function client() {
  return createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const admin = client();
const firstHost = client();
const secondHost = client();
const clients = [admin, firstHost, secondHost];
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const slug = `hat-private-host-rehearsal-${today}`;
const firstEmail = "community.member.one@hat-test.invalid";
const secondEmail = "community.member.two@hat-test.invalid";
const checks = [];

async function rpc(target, name, args = {}) {
  const result = await target.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.code ?? "unknown error"} ${result.error.message}`);
  return result.data;
}

async function hostWorkspace(target) {
  return (await rpc(target, "get_my_event_host_workspace", { p_slug: slug })) ?? [];
}

try {
  for (const [target, email, password] of [
    [admin, adminEmail, adminPassword],
    [firstHost, firstEmail, testPassword],
    [secondHost, secondEmail, testPassword],
  ]) {
    const signed = await target.auth.signInWithPassword({ email, password });
    assert.equal(signed.error, null, `Could not sign in a rehearsal account: ${signed.error?.code ?? "unknown"}`);
  }

  for (const target of [firstHost, secondHost]) {
    const { data: { user } } = await target.auth.getUser();
    const profile = await target.from("profiles")
      .select("access_status,is_test_account").eq("id", user.id).single();
    assert.equal(profile.error, null);
    assert.equal(profile.data.access_status, "active");
    assert.equal(profile.data.is_test_account, true);
  }
  checks.push("distinct tagged Admin and Host accounts signed in");

  const existing = await admin.from("events")
    .select("id,status").eq("slug", slug).maybeSingle();
  assert.equal(existing.error, null);
  assert.equal(existing.data, null, "A rehearsal event with today's slug already exists; do not alter it automatically");

  const starts = new Date(Date.now() + 14 * 86_400_000);
  const ends = new Date(starts.getTime() + 2 * 3_600_000);
  const eventId = await rpc(admin, "save_event", {
    p_event_id: null,
    p_title: "[TEST] Private Event Host Rehearsal",
    p_slug: slug,
    p_summary: "Internal acceptance rehearsal only. This is not a public gathering or an invitation to register.",
    p_format: "virtual",
    p_status: "draft",
    p_starts_at: starts.toISOString(),
    p_ends_at: ends.toISOString(),
    p_timezone: "Africa/Nairobi",
    p_venue_name: "",
    p_city: "Nairobi",
    p_country: "Kenya",
    p_address_line: "",
    p_map_url: "",
    p_online_url: "https://example.invalid/hat-private-host-rehearsal",
    p_capacity: 20,
    p_registration_mode: "closed",
    p_is_featured: false,
  });
  assert.equal(typeof eventId, "string");
  checks.push("private, closed, unfeatured rehearsal event created");

  await rpc(admin, "assign_event_host", { p_event_id: eventId, p_email: firstEmail });
  assert.equal((await hostWorkspace(firstHost)).length, 1);
  assert.equal((await hostWorkspace(secondHost)).length, 0);
  const adminPermission = await rpc(firstHost, "can_manage_event", { check_event_id: eventId });
  assert.equal(adminPermission, false, "Host must not receive event staff permissions");
  checks.push("Host assignment scoped; unrelated member denied; Admin permission withheld");

  const programme = [{
    key: randomUUID(),
    title: "Rehearsal welcome",
    description: "Private test content, never intended for publication.",
    starts_at: new Date(starts.getTime() + 15 * 60_000).toISOString(),
    ends_at: new Date(starts.getTime() + 45 * 60_000).toISOString(),
    room: "",
    speaker_name: "Test Host",
  }];
  await rpc(firstHost, "save_event_host_workspace", {
    p_event_id: eventId,
    p_summary: "This is a private acceptance rehearsal for the Event Host workflow. It must never be published as a real gathering.",
    p_arrival_info: "Private test only. There is no real meeting link and no guests should join.",
    p_programme: programme,
    p_partners: [],
  });
  await rpc(firstHost, "submit_event_host_workspace", { p_event_id: eventId });
  const submitted = await rpc(admin, "list_admin_event_host_workspaces");
  assert.equal(submitted.find((item) => item.event_id === eventId)?.workspace_status, "submitted");
  checks.push("Host draft saved and submitted for Admin review");

  await rpc(admin, "review_event_host_workspace", {
    p_event_id: eventId,
    p_action: "request_changes",
    p_note: "Please clarify that this is a private rehearsal only.",
  });
  assert.equal((await hostWorkspace(firstHost))[0]?.workspace_status, "changes_requested");
  checks.push("Admin guidance returned to Host without publication");

  await rpc(firstHost, "save_event_host_workspace", {
    p_event_id: eventId,
    p_summary: "This is a private acceptance rehearsal for the Event Host workflow. It is not a public event and no guests may register.",
    p_arrival_info: "Private test only. There is no real meeting link and no guests should join.",
    p_programme: programme,
    p_partners: [],
  });
  await rpc(firstHost, "submit_event_host_workspace", { p_event_id: eventId });
  await rpc(admin, "set_event_host_status", {
    p_event_id: eventId,
    p_status: "paused",
    p_note: "Pausing this tagged test Host to verify private access boundaries.",
  });
  assert.equal((await hostWorkspace(firstHost)).length, 0);
  await rpc(admin, "set_event_host_status", {
    p_event_id: eventId,
    p_status: "active",
    p_note: "",
  });
  assert.equal((await hostWorkspace(firstHost)).length, 1);
  checks.push("Host pause and restore immediately changed workspace access");

  await rpc(admin, "save_event_safety_contact", {
    p_event_id: eventId,
    p_name: "Test Safety Lead",
    p_phone: "+254700000099",
  });
  const adminContact = await admin.from("event_safety_contacts")
    .select("contact_name").eq("event_id", eventId).single();
  assert.equal(adminContact.error, null);
  const hostContact = await firstHost.from("event_safety_contacts")
    .select("event_id").eq("event_id", eventId).maybeSingle();
  assert.equal(hostContact.error, null);
  assert.equal(hostContact.data, null, "Host must not read private safety contact data");
  checks.push("Admin saved private safety contact; Host could not read it");

  await rpc(admin, "assign_event_host", { p_event_id: eventId, p_email: secondEmail });
  assert.equal((await hostWorkspace(firstHost)).length, 0);
  assert.equal((await hostWorkspace(secondHost))[0]?.workspace_status, "draft");
  checks.push("replacement revoked former Host and reset inherited submission");

  const finalEvent = await admin.from("events")
    .select("status,registration_mode,is_featured").eq("id", eventId).single();
  assert.equal(finalEvent.error, null);
  assert.deepEqual(finalEvent.data, {
    status: "draft", registration_mode: "closed", is_featured: false,
  });
  checks.push("rehearsal event remained private, closed and unfeatured");

  process.stdout.write(`${JSON.stringify({ checks, eventSlug: slug, published: false, secretsPrinted: false }, null, 2)}\n`);
} finally {
  await Promise.all(clients.map((target) => target.auth.signOut()));
}
