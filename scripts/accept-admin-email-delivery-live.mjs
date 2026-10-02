import assert from "node:assert/strict";
import { createServerClient } from "@supabase/ssr";

const base = (process.env.BASE_URL ?? "https://www.herafricatable.com").replace(/\/$/, "");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.HAT_PRIMARY_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.HAT_PRIMARY_ADMIN_PASSWORD;

assert(url && publishableKey && email && password,
  "Supabase and primary Admin test credentials are required");
assert(process.env.HAT_CONFIRM_ADMIN_EMAIL_TEST === "yes",
  "Set HAT_CONFIRM_ADMIN_EMAIL_TEST=yes to send one live test email to the primary Admin");

const jar = new Map();
const supabase = createServerClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: true },
  cookies: {
    getAll() { return [...jar].map(([name, value]) => ({ name, value })); },
    setAll(items) {
      for (const { name, value, options } of items) {
        if (options?.maxAge === 0) jar.delete(name);
        else jar.set(name, value);
      }
    },
  },
});

try {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  assert.equal(data.user?.email?.toLowerCase(), email,
    "The signed-in account must be the intended primary Admin");
  assert(jar.size > 0, "No browser-compatible session cookie was generated");

  const response = await fetch(`${base}/api/admin/notifications/test`, {
    method: "POST",
    headers: {
      cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      "content-type": "application/json",
    },
    body: "{}",
    redirect: "manual",
  });
  const result = await response.json().catch(() => ({}));
  assert.equal(response.status, 200,
    `Live Admin delivery test returned ${response.status}: ${String(result.error ?? "unknown error").slice(0, 160)}`);
  assert.equal(result.deliveredTo?.toLowerCase(), email,
    "The delivery test did not target the signed-in Admin address");
  assert(result.providerId, "Email provider did not confirm acceptance");
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(),
    destination: email, providerAccepted: true, inboxReceiptVerified: false,
    testRoute: "/api/admin/notifications/test", secretsPrinted: false }, null, 2));
} finally {
  await supabase.auth.signOut({ scope: "local" });
}
