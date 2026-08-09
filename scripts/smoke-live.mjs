import assert from "node:assert/strict";

const base = (
  process.env.BASE_URL ?? "https://herafricatable.vercel.app"
).replace(/\/$/, "");
const headers = { "user-agent": "HerAfricaTable-UAT/1.0" };

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
results.push(await page("/", "The table for women"));
results.push(await page("/events", "What’s coming up"));
results.push(await page("/sign-in", "Take your seat"));
results.push(await redirect("/home", "/sign-in"));
results.push(await redirect("/communities", "/sign-in"));
results.push(await redirect("/learning", "/sign-in"));
results.push(await redirect("/referrals", "/sign-in"));
results.push(await redirect("/support", "/sign-in"));
results.push(await redirect("/settings", "/sign-in"));
results.push(await redirect("/notifications", "/sign-in"));
results.push(await redirect("/admin", "/admin/sign-in"));

const health = await fetch(`${base}/api/health`, { headers });
const healthBody = await health.json();
results.push({ body: healthBody, path: "/api/health", status: health.status });
console.log(JSON.stringify({ base, results }, null, 2));

if (process.env.REQUIRE_HEALTHY === "1") {
  assert.equal(health.status, 200, "Production health must be fully ready");
} else {
  assert(
    [200, 503].includes(health.status),
    "Health endpoint must return an operational state",
  );
}
