import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";

const base = (process.env.BASE_URL ?? "https://www.herafricatable.com").replace(/\/$/, "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const adminEmail = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const adminPassword = process.env.HAT_PRIMARY_ADMIN_PASSWORD;
const pilotSlug = process.env.HAT_PILOT_EVENT_SLUG ?? "the-founding-table-nairobi-2026-10-06";
const rehearsalSlug = process.env.HAT_REHEARSAL_EVENT_SLUG ?? "hat-private-host-rehearsal-20260924";
assert(url && key && password, "Tagged role credentials and Supabase public settings are required");
assert(/^https:\/\//.test(base), "Use the HTTPS production site for live role acceptance");
assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rehearsalSlug), "Invalid rehearsal event slug");
assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pilotSlug), "Invalid pilot event slug");

const roles = [
  { name: "community_moderator", email: "community.moderator@hat-test.invalid", host: false },
  { name: "member", email: "community.member.one@hat-test.invalid", host: false },
  { name: "event_host", email: "community.member.two@hat-test.invalid", host: true },
];
let moderatorCommunitySlug = null;

function hiddenNotFound(response, body) {
  return (response.status === 404 || body.includes("NEXT_HTTP_ERROR_FALLBACK;404")) &&
    /<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(body);
}

function redirectsTo(response, body, target) {
  const location = response.headers.get("location");
  return location ? new URL(location, base).pathname === target :
    body.includes(`NEXT_REDIRECT;replace;${target};`) ||
    body.includes(`NEXT_REDIRECT;push;${target};`);
}

function sessionClient() {
  const cookieJar = new Map();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach(({ name, value }) => value
        ? cookieJar.set(name, value) : cookieJar.delete(name)),
    },
  });
  return {
    client,
    cookieHeader: () => [...cookieJar].map(([name, value]) =>
      `${encodeURIComponent(name)}=${encodeURIComponent(value)}`).join("; "),
  };
}

async function getPage(cookie, path) {
  const response = await fetch(`${base}${path}`, {
    headers: { cookie, "user-agent": "HerAfricaTable-RoleAcceptance/1.0" },
    redirect: "manual",
  });
  return { response, body: await response.text() };
}

async function inspectRole(role) {
  const { client, cookieHeader } = sessionClient();
  try {
    const signed = await client.auth.signInWithPassword({ email: role.email, password });
    assert.ifError(signed.error);
    assert(signed.data.user, `${role.name} did not sign in`);
    const profile = await client.from("profiles")
      .select("access_status,is_test_account")
      .eq("id", signed.data.user.id).single();
    assert.ifError(profile.error);
    assert.equal(profile.data.access_status, "active", `${role.name} must be active`);
    assert.equal(profile.data.is_test_account, true, `${role.name} must be tagged`);
    const cookie = cookieHeader();
    assert(cookie, `${role.name} did not receive a session cookie`);
    const get = (path) => getPage(cookie, path);

    const home = await get("/home");
    assert.equal(home.response.status, 200, `${role.name} member home did not load`);
    assert(home.body.includes("Your Table Today"), `${role.name} did not receive the member home`);
    assert(!redirectsTo(home.response, home.body, "/sign-in"), `${role.name} was sent to sign-in`);

    const admin = await get("/admin");
    assert.equal(admin.response.status, 200, `${role.name} member-only Admin explanation did not load`);
    assert(admin.body.includes("This email opens the member space."), `${role.name} received Admin authority`);

    const memberAdmin = await get("/admin/members");
    assert(redirectsTo(memberAdmin.response, memberAdmin.body, "/admin"),
      `${role.name} was not redirected from member decisions`);
    const launchBoard = await get("/admin/operations?area=release-tools");
    assert.equal(launchBoard.response.status, 200);
    assert(launchBoard.body.includes("Admin role required."),
      `${role.name} was not denied the launch taskboard`);
    assert(!launchBoard.body.includes("pilot launch checks accepted with evidence"),
      `${role.name} received private pilot launch evidence`);

    for (const path of [`/events/${pilotSlug}`, `/events/${pilotSlug}/register`]) {
      const page = await get(path);
      assert(hiddenNotFound(page.response, page.body),
        `${role.name} could see or index the private pilot at ${path}`);
    }
    const pilotDirect = await client.from("events").select("id").eq("slug", pilotSlug);
    assert.ifError(pilotDirect.error);
    assert.equal(pilotDirect.data.length, 0,
      `${role.name} could read the private pilot directly from the database`);

    const hostPage = await get(`/events/${rehearsalSlug}/host`);
    if (role.host) {
      assert.equal(hostPage.response.status, 200, "Assigned Host workspace did not load");
      assert(hostPage.body.includes("Introduce the gathering"), "Assigned Host did not receive drafting controls");
    } else {
      assert(hiddenNotFound(hostPage.response, hostPage.body),
        `${role.name} could access or index the private Host workspace`);
      assert(!hostPage.body.includes("Introduce the gathering"),
        `${role.name} received private Host drafting controls`);
    }
    const communities = await client.rpc("list_communities");
    assert.ifError(communities.error);
    if (role.name === "community_moderator") {
      const moderated = (communities.data ?? []).find((item) =>
        item.membership_status === "active" && item.membership_role === "moderator");
      assert(moderated?.slug, "Tagged moderator has no active Community moderator seat");
      moderatorCommunitySlug = moderated.slug;
      const moderatorPage = await get(`/communities/${encodeURIComponent(moderatorCommunitySlug)}/host`);
      assert.equal(moderatorPage.response.status, 200, "Community moderator workspace did not load");
      assert(moderatorPage.body.includes("Lead with clarity"),
        "Community moderator did not receive the moderation workspace");
    } else {
      assert(moderatorCommunitySlug, "Moderator Community must be checked first");
      const membership = (communities.data ?? []).find((item) => item.slug === moderatorCommunitySlug);
      assert(!["owner", "moderator"].includes(membership?.membership_role ?? ""),
        `${role.name} is not an ordinary member for this boundary check`);
      const moderatorPage = await get(`/communities/${encodeURIComponent(moderatorCommunitySlug)}/host`);
      assert(!moderatorPage.body.includes("Lead with clarity"),
        `${role.name} received the Community moderator workspace`);
      assert(redirectsTo(moderatorPage.response, moderatorPage.body,
        `/communities/${moderatorCommunitySlug}`) ||
        redirectsTo(moderatorPage.response, moderatorPage.body, "/communities") ||
        hiddenNotFound(moderatorPage.response, moderatorPage.body),
      `${role.name} was not redirected or hidden from Community moderation`);
    }
    return {
      role: role.name,
      memberHome: "loaded",
      adminDecisions: "denied",
      launchTaskboard: "denied",
      pilotDetailsAndRegistration: "hidden while draft",
      pilotDatabaseRow: "denied",
      privateHostWorkspace: role.host ? "scoped access" : "hidden",
      communityModeratorWorkspace: role.name === "community_moderator" ? "scoped access" : "denied",
    };
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

async function inspectPrimaryAdmin() {
  assert(adminEmail && adminPassword, "Primary Admin read-only credentials are required");
  const { client, cookieHeader } = sessionClient();
  try {
    const signed = await client.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
    assert.ifError(signed.error);
    assert(signed.data.user, "Primary Admin did not sign in");
    const [profile, adminRole, managedEvents, memberRows] = await Promise.all([
      client.from("profiles").select("is_test_account").eq("id", signed.data.user.id).single(),
      client.from("user_roles").select("role").eq("user_id", signed.data.user.id)
        .eq("role", "super_admin").maybeSingle(),
      client.rpc("list_managed_events"),
      client.rpc("list_admin_members_v3"),
    ]);
    assert.ifError(profile.error);
    assert.ifError(adminRole.error);
    assert.ifError(managedEvents.error);
    assert.ifError(memberRows.error);
    assert.equal(profile.data.is_test_account, false, "Primary Admin must remain separate from tagged rehearsal accounts");
    assert.equal(adminRole.data?.role, "super_admin", "Primary Admin role is missing");
    const pilot = (managedEvents.data ?? []).find((event) => event.slug === pilotSlug);
    assert(pilot?.event_id, "Selected pilot is not visible to the primary Admin");
    const pilotDirect = await client.from("events").select("id").eq("slug", pilotSlug);
    assert.ifError(pilotDirect.error);
    assert.equal(pilotDirect.data?.length, 1, "Primary Admin cannot read the selected private pilot");
    assert.equal(pilotDirect.data[0].id, pilot.event_id,
      "Primary Admin's private pilot row does not match the selected event");
    const memberIds = [...new Set((memberRows.data ?? []).map((member) => member.user_id))];
    const testFlags = memberIds.length
      ? await client.from("profiles").select("id,is_test_account").in("id", memberIds)
      : { data: [], error: null };
    assert.ifError(testFlags.error);
    assert.equal(testFlags.data?.length, memberIds.length, "Admin member test labels are incomplete");
    const testById = new Map((testFlags.data ?? []).map((row) => [row.id, row.is_test_account]));
    const realPending = (memberRows.data ?? []).filter((member) =>
      member.access_status === "pending" &&
      ["submitted", "in_review"].includes(member.application_status ?? "") &&
      testById.get(member.user_id) === false).length;
    const cookie = cookieHeader();
    assert(cookie, "Primary Admin did not receive a session cookie");

    const home = await getPage(cookie, "/admin");
    assert.equal(home.response.status, 200);
    assert(home.body.includes("Today, at a glance."), "Primary Admin cockpit did not render");
    assert(home.body.includes(`${realPending} real request${realPending === 1 ? "" : "s"} waiting`),
      "Admin cockpit did not separate real requests from tagged test applications");
    const members = await getPage(cookie, "/admin/members");
    assert.equal(members.response.status, 200);
    assert(members.body.includes("Welcome carefully. Support quietly."),
      "Primary Admin membership desk did not render");
    const editor = await getPage(cookie, `/admin/events?view=edit&event=${encodeURIComponent(pilot.event_id)}`);
    assert.equal(editor.response.status, 200);
    assert(editor.body.includes(`value="${pilot.title}"`),
      "Event-specific Admin editor did not select the pilot");
    const hostReview = await getPage(cookie, `/admin/events?view=host&event=${encodeURIComponent(pilot.event_id)}`);
    assert.equal(hostReview.response.status, 200);
    assert(hostReview.body.includes("Prepare, review, then publish"),
      "Primary Admin Host-review page did not render");
    const launchBoard = await getPage(cookie, "/admin/operations?area=release-tools");
    assert.equal(launchBoard.response.status, 200);
    assert(launchBoard.body.includes("What is done. What is left."),
      "Primary Admin taskboard did not render");
    assert(launchBoard.body.includes("pilot launch checks accepted with evidence"),
      "Primary Admin taskboard did not load the live launch-check summary");
    assert(!launchBoard.body.includes("Pilot status unavailable"),
      "Primary Admin taskboard could not read the selected pilot");
    for (const path of [`/events/${pilotSlug}`, `/events/${pilotSlug}/register`]) {
      const page = await getPage(cookie, path);
      assert(hiddenNotFound(page.response, page.body),
        `Primary Admin could see or index the private pilot at ${path}`);
    }
    return {
      account: "primary Admin, not tagged rehearsal Admin",
      cockpit: "loaded",
      memberOversight: "loaded",
      selectedPilotEditor: "loaded",
      hostReview: "loaded",
      launchTaskboard: "loaded with live evidence",
      pilotDetailsAndRegistration: "hidden while draft",
      pilotDatabaseRow: "Admin only",
      realRequestCount: "matches live non-test applications",
    };
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}

const results = [];
const anonymousBoard = await getPage("", "/admin/operations?area=release-tools");
assert(redirectsTo(anonymousBoard.response, anonymousBoard.body, "/admin/sign-in"),
  "Signed-out visitors must not open the launch taskboard");
assert(!anonymousBoard.body.includes("pilot launch checks accepted with evidence"),
  "Signed-out visitors received private pilot launch evidence");
for (const role of roles) results.push(await inspectRole(role));
const primaryAdmin = await inspectPrimaryAdmin();
console.log(JSON.stringify({ releaseScope: "read-only signed-in pages", anonymousLaunchTaskboard: "denied", results, primaryAdmin }, null, 2));
