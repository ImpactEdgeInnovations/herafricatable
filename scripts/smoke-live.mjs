import assert from "node:assert/strict";

const base = (
  process.env.BASE_URL ?? "https://herafricatable.vercel.app"
).replace(/\/$/, "");
const headers = { "user-agent": "HerAfricaTable-UAT/1.0" };
const expectedRelease = process.env.EXPECTED_RELEASE?.trim();

async function page(path, expectedText) {
  const response = await fetch(`${base}${path}`, {
    headers,
    redirect: "manual",
  });
  assert.equal(response.status, 200, `${path} should return 200`);
  const body = await response.text();
  assert(
    body.includes(expectedText),
    `${path} is missing expected production content`,
  );
  if (path === "/") {
    assert.match(
      response.headers.get("content-security-policy") ?? "",
      /frame-ancestors 'none'/,
      "Production must prevent framing",
    );
    assert.equal(
      response.headers.get("x-content-type-options"),
      "nosniff",
      "Production must disable MIME sniffing",
    );
    assert.equal(
      response.headers.get("referrer-policy"),
      "strict-origin-when-cross-origin",
      "Production must use the approved referrer policy",
    );
  }
  return { path, status: response.status };
}

async function redirect(path, location) {
  const response = await fetch(`${base}${path}`, {
    headers,
    redirect: "manual",
  });
  if ([302, 303, 307, 308].includes(response.status)) {
    assert.equal(
      new URL(response.headers.get("location"), base).pathname,
      location,
      `${path} should redirect to ${location}`,
    );
    return { delivery: "http", location, path, status: response.status };
  }

  assert.equal(
    response.status,
    200,
    `${path} should redirect anonymously`,
  );
  const body = await response.text();
  const streamedRedirect =
    body.includes(`NEXT_REDIRECT;replace;${location};`) ||
    body.includes(`url=${location}`);
  assert(streamedRedirect, `${path} should stream a redirect to ${location}`);
  return { delivery: "next-stream", location, path, status: response.status };
}

const results = [];
results.push(await page("/", "Where African women"));
results.push(await page("/events", "What’s coming up"));
results.push(await page("/sign-in", "Email me a sign-in code"));
results.push(await redirect("/home", "/sign-in"));
results.push(await redirect("/communities", "/sign-in"));
results.push(await redirect("/learning", "/sign-in"));
results.push(await redirect("/referrals", "/sign-in"));
results.push(await redirect("/support", "/sign-in"));
results.push(await redirect("/settings", "/sign-in"));
results.push(await redirect("/notifications", "/sign-in"));
results.push(await redirect("/admin", "/admin/sign-in"));

const cron = await fetch(`${base}/api/cron/notifications`, {
  headers,
  redirect: "manual",
});
assert.equal(cron.status, 401, "Notification cron must reject unsigned requests");
results.push({ path: "/api/cron/notifications", status: cron.status });

const health = await fetch(`${base}/api/health`, { headers });
const healthBody = await health.json();
results.push({ body: healthBody, path: "/api/health", status: health.status });
if (expectedRelease) {
  assert.equal(
    healthBody.release,
    expectedRelease,
    `Production must run release ${expectedRelease}`,
  );
}
console.log(JSON.stringify({ base, results }, null, 2));

if (process.env.REQUIRE_HEALTHY === "1") {
  assert.equal(health.status, 200, "Production health must be fully ready");
} else {
  assert(
    [200, 503].includes(health.status),
    "Health endpoint must return an operational state",
  );
}
