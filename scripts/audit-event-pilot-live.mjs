import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const base = (process.env.BASE_URL ?? "https://www.herafricatable.com").replace(/\/$/, "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
assert(url && publishableKey && secretKey, "Supabase URL, publishable key and secret key are required");

const options = { auth: { autoRefreshToken: false, persistSession: false } };
const service = createClient(url, secretKey, options);
const admin = createClient(url, publishableKey, options);
const testEventId = "00000000-0000-4000-8000-000000000000";

async function functionInstalled(name) {
  const { error } = await service.rpc(name, { p_event_id: testEventId });
  if (!error || error.code === "P0001") return true;
  if (error.code === "PGRST202") return false;
  throw new Error(`Could not check ${name}: ${error.code || "network error"}`);
}

async function tableInstalled(name) {
  const { error } = await service.from(name).select("event_id").limit(0);
  if (!error) return true;
  if (error.code === "PGRST205") return false;
  throw new Error(`Could not check ${name}: ${error.code || "network error"}`);
}

const healthResponse = await fetch(`${base}/api/health`, {
  headers: { "user-agent": "HerAfricaTable-PilotAudit/1.0" },
});
const health = await healthResponse.json();
const [guestFeedback, hostOutcomes, introductions, rounds, flagResult, eventResult] =
  await Promise.all([
    functionInstalled("can_leave_event_feedback"),
    functionInstalled("get_event_host_outcomes"),
    tableInstalled("event_intro_settings"),
    tableInstalled("event_round_settings"),
    service.from("feature_flags").select("enabled").eq("key", "event_guest_access").maybeSingle(),
    service.from("events")
      .select("id,slug,title,status,audience,registration_mode,starts_at,ends_at,capacity")
      .gte("starts_at", new Date().toISOString())
      .in("status", ["draft", "published"]),
  ]);
assert.ifError(flagResult.error);
assert.ifError(eventResult.error);

const events = eventResult.data ?? [];
const rehearsal = (event) => event.title?.startsWith("[TEST]") || event.slug?.startsWith("hat-private-host-rehearsal-");
const realEvents = events.filter((event) => !rehearsal(event));
const publicFuture = realEvents.filter((event) => event.status === "published" && event.audience === "public");
const privateDrafts = realEvents.filter((event) => event.status === "draft");
const rehearsalEvent = events.find((event) => event.status === "draft" && rehearsal(event));
let adminEvidence = { authenticated: false, tagged: false, usesPrimaryAccount: false, releaseChecks: [] };
const email = process.env.HAT_ADMIN_TEST_EMAIL;
const password = process.env.HAT_ADMIN_TEST_PASSWORD;
if (email && password) {
  try {
    const { data: session, error: signInError } = await admin.auth.signInWithPassword({ email, password });
    if (signInError || !session.user) throw new Error("Tagged Admin sign-in failed");
    const [profile, release] = await Promise.all([
      admin.from("profiles").select("is_test_account").eq("id", session.user.id).single(),
      admin.rpc("list_module_release_acceptance"),
    ]);
    if (profile.error || release.error) throw new Error("Tagged Admin release read failed");
    adminEvidence = {
      authenticated: true,
      tagged: profile.data.is_test_account === true,
      usesPrimaryAccount: email.toLowerCase() === process.env.HAT_PRIMARY_ADMIN_EMAIL?.toLowerCase(),
      releaseChecks: (release.data ?? [])
        .filter((row) => row.feature_key === "event_guest_access")
        .map((row) => ({ key: row.check_key, status: row.status })),
    };
  } catch {
    adminEvidence = { authenticated: false, tagged: false, usesPrimaryAccount: false, releaseChecks: [] };
  } finally {
    await admin.auth.signOut();
  }
}

async function inspectTaggedRole(emailAddress) {
  const client = createClient(url, publishableKey, options);
  try {
    const signed = await client.auth.signInWithPassword({
      email: emailAddress,
      password: process.env.HAT_COMMUNITY_TEST_PASSWORD,
    });
    if (signed.error || !signed.data.user) return { authenticated: false };
    const [profile, adminScope, adminRelease, hostWorkspace, moderatorSeat] = await Promise.all([
      client.from("profiles").select("access_status,is_test_account")
        .eq("id", signed.data.user.id).single(),
      rehearsalEvent
        ? client.rpc("can_manage_event", { check_event_id: rehearsalEvent.id })
        : Promise.resolve({ data: null, error: null }),
      client.rpc("list_module_release_acceptance"),
      rehearsalEvent
        ? client.rpc("get_my_event_host_workspace", { p_slug: rehearsalEvent.slug })
        : Promise.resolve({ data: [], error: null }),
      client.from("community_memberships").select("id").eq("user_id", signed.data.user.id)
        .eq("role", "moderator").eq("status", "active").limit(1),
    ]);
    if (profile.error || adminScope.error || hostWorkspace.error || moderatorSeat.error)
      return { authenticated: true, readError: true };
    return {
      authenticated: true,
      active: profile.data.access_status === "active",
      tagged: profile.data.is_test_account === true,
      adminScope: adminScope.data === true,
      adminReleaseDenied: adminRelease.error?.code === "P0001",
      rehearsalHostWorkspace: (hostWorkspace.data ?? []).length > 0,
      communityModeratorSeat: (moderatorSeat.data ?? []).length > 0,
    };
  } finally {
    await client.auth.signOut();
  }
}

const taggedRoles = process.env.HAT_COMMUNITY_TEST_PASSWORD
  ? {
      member: await inspectTaggedRole("community.member.one@hat-test.invalid"),
      eventHost: await inspectTaggedRole("community.member.two@hat-test.invalid"),
      communityModerator: await inspectTaggedRole("community.moderator@hat-test.invalid"),
    }
  : null;

const result = {
  checkedAt: new Date().toISOString(),
  site: { base, healthStatus: healthResponse.status, release: health.release ?? null,
    databaseReachable: health.database === "reachable", serverReady: health.server_integration === "ready" },
  database: { guestFeedback, hostOutcomes, introductions, rounds },
  guestRegistrationOpen: flagResult.data?.enabled === true,
  events: { futurePublicPublished: publicFuture.length, futurePrivateDrafts: privateDrafts.length,
    futureRehearsalDrafts: events.filter((event) => event.status === "draft" && rehearsal(event)).length,
    futureFreeManualPublic: publicFuture.filter((event) => event.registration_mode === "manual_review").length },
  adminSession: adminEvidence,
  taggedRoles,
  pilotDecision: "not_decided",
};
console.log(JSON.stringify(result, null, 2));
