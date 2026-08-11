import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const email = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const password = process.env.HAT_PRIMARY_ADMIN_PASSWORD;

if (!url || !publishable || !email || !password) {
  throw new Error("Supabase and primary Admin test credentials are required.");
}

const supabase = createClient(url, publishable, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const signedIn = await supabase.auth.signInWithPassword({ email, password });
assert.equal(signedIn.error, null, "Primary Admin sign-in failed");

const result = await supabase.rpc("get_membership_intake_admin");
assert.equal(result.error, null, "Membership intake migration is not ready");
assert.equal(result.data?.length, 1, "Membership intake singleton was not found");
const setting = result.data[0];
assert(
  ["manual_review", "trusted_auto", "closed"].includes(setting.mode),
  "Membership intake mode is invalid",
);
assert.equal(typeof setting.pending_applications, "number");
assert.equal(typeof setting.trusted_pending_invites, "number");

await supabase.auth.signOut();

process.stdout.write(
  `${JSON.stringify(
    {
      mode: setting.mode,
      pendingApplications: setting.pending_applications,
      ready: true,
      secretsPrinted: false,
      verifiedInvitations: setting.trusted_pending_invites,
    },
    null,
    2,
  )}\n`,
);
