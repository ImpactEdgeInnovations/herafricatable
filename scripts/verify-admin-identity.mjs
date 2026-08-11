import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const primaryEmail = process.env.HAT_PRIMARY_ADMIN_EMAIL;
const primaryPassword = process.env.HAT_PRIMARY_ADMIN_PASSWORD;
const targetEmail = process.env.HAT_TARGET_ADMIN_EMAIL?.trim().toLowerCase();
const targetPassword = process.env.HAT_TARGET_ADMIN_PASSWORD;
const grantDays = Number(process.env.HAT_GRANT_ADMIN_DAYS ?? 0);
const confirmedGrantEmail = process.env.HAT_CONFIRM_SUPER_ADMIN_GRANT
  ?.trim()
  .toLowerCase();

if (!url || !publishable || !primaryEmail || !primaryPassword || !targetEmail) {
  throw new Error("Supabase, primary Admin and target Admin details are required.");
}

function client() {
  return createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const primary = client();
const primarySignIn = await primary.auth.signInWithPassword({
  email: primaryEmail,
  password: primaryPassword,
});
assert.equal(primarySignIn.error, null, "Primary Admin sign-in failed");

let team = await primary.rpc("list_admin_team_access");
assert.equal(team.error, null, "Admin team access could not be inspected");
let assignment = (team.data ?? []).find(
  (row) => row.email?.toLowerCase() === targetEmail,
);

if (grantDays > 0) {
  assert.equal(
    confirmedGrantEmail,
    targetEmail,
    "Set HAT_CONFIRM_SUPER_ADMIN_GRANT to the target email to confirm full Super Admin access",
  );
  assert(
    Number.isInteger(grantDays) && grantDays <= 365,
    "Admin grant duration must be between 1 and 365 days",
  );
  const expiresAt = new Date(
    Date.now() + grantDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const grant = await primary.rpc("grant_time_bounded_admin_access", {
    p_email: targetEmail,
    p_expires_at: expiresAt,
    p_reason: "Time-limited production administration requested by platform owner",
    p_role: "super_admin",
  });
  assert.equal(grant.error, null, "Time-limited Admin access could not be granted");
  team = await primary.rpc("list_admin_team_access");
  assert.equal(team.error, null, "Admin access could not be verified after grant");
  assignment = (team.data ?? []).find(
    (row) => row.email?.toLowerCase() === targetEmail,
  );
}

let passwordAccepted = null;
if (targetPassword) {
  const target = client();
  const targetSignIn = await target.auth.signInWithPassword({
    email: targetEmail,
    password: targetPassword,
  });
  passwordAccepted = !targetSignIn.error;
  await target.auth.signOut();
}

await primary.auth.signOut();

process.stdout.write(
  `${JSON.stringify(
    {
      account: targetEmail,
      activeAdmin:
        assignment?.role === "super_admin" && assignment.access_state !== "expired",
      accessState: assignment?.access_state ?? "no_admin_assignment",
      expiresAt: assignment?.expires_at ?? null,
      grantDays: grantDays || null,
      passwordAccepted,
      role: assignment?.role ?? null,
      secretsPrinted: false,
    },
    null,
    2,
  )}\n`,
);
