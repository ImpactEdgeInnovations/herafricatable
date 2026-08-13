import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const confirmed = process.env.HAT_CONFIRM_TEST_ADMIN_PASSWORD_SYNC === "yes";
const accounts = [
  {
    email: process.env.HAT_PRIMARY_ADMIN_EMAIL?.trim().toLowerCase(),
    password: process.env.HAT_PRIMARY_ADMIN_PASSWORD,
    purpose: "primary_admin",
  },
  {
    email: process.env.HAT_ADMIN_TEST_EMAIL?.trim().toLowerCase(),
    password: process.env.HAT_ADMIN_TEST_PASSWORD,
    purpose: "test_admin",
  },
];

if (!url || !publishable || !secret || !confirmed) {
  throw new Error(
    "Supabase credentials and HAT_CONFIRM_TEST_ADMIN_PASSWORD_SYNC=yes are required.",
  );
}
for (const account of accounts) {
  if (!account.email || !account.password || account.password.length < 12) {
    throw new Error("Both Admin test identities need passwords of at least 12 characters.");
  }
}

const service = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
assert.equal(listed.error, null, "Admin identities could not be inspected");

for (const account of accounts) {
  const user = listed.data.users.find(
    (candidate) => candidate.email?.toLowerCase() === account.email,
  );
  assert(user, `${account.purpose} identity does not exist; password sync stopped`);
  const updated = await service.auth.admin.updateUserById(user.id, {
    password: account.password,
    user_metadata: {
      ...user.user_metadata,
      must_change_temporary_password: true,
    },
  });
  assert.equal(updated.error, null, `${account.purpose} password could not be synchronized`);
}

for (const account of accounts) {
  const verifier = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await verifier.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  assert.equal(signedIn.error, null, `${account.purpose} password verification failed`);
  await verifier.auth.signOut();
}

process.stdout.write(
  `${JSON.stringify({
    accountsSynchronized: accounts.length,
    confirmationRequired: true,
    rolesChanged: false,
    secretsPrinted: false,
  })}\n`,
);
