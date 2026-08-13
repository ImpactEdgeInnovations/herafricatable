import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim().toLowerCase();
const durationDays = Number(process.argv[3] ?? 60);
const password =
  process.env.HAT_BETA_ADMIN_PASSWORD ?? process.env.HAT_ADMIN_TEST_PASSWORD;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!email || !email.includes("@")) {
  throw new Error("Provide the beta Admin email as the first argument.");
}
if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
  throw new Error("Beta Admin duration must be between 1 and 365 days.");
}
if (!password || password.length < 8) {
  throw new Error("Set HAT_BETA_ADMIN_PASSWORD to at least 8 characters.");
}
if (!url || !publishableKey || !secretKey) {
  throw new Error("Supabase environment variables are required.");
}

const expiresAt = new Date(
  Date.now() + durationDays * 24 * 60 * 60 * 1000,
).toISOString();
const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: expirySchemaError } = await admin
  .from("user_roles")
  .select("expires_at")
  .limit(1);
if (expirySchemaError) {
  throw new Error(
    "Apply 20260730210000_expiring_admin_access.sql before provisioning temporary Admin access.",
  );
}

async function findUserByEmail() {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw error;
    const found = data.users.find(
      (user) => user.email?.toLowerCase() === email,
    );
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  throw new Error("User lookup exceeded the supported account range.");
}

let account = await findUserByEmail();
const invitePayload = {
  accepted_at: account ? new Date().toISOString() : null,
  accepted_by: account?.id ?? null,
  email,
  expires_at: expiresAt,
  intended_role: "super_admin",
  status: account ? "accepted" : "pending",
};
const { data: existingInvite, error: inviteLookupError } = await admin
  .from("beta_invites")
  .select("id")
  .eq("email", email)
  .in("status", ["pending", "accepted"])
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (inviteLookupError) throw inviteLookupError;

if (existingInvite) {
  const { error } = await admin
    .from("beta_invites")
    .update(invitePayload)
    .eq("id", existingInvite.id);
  if (error) throw error;
} else {
  const { error } = await admin.from("beta_invites").insert(invitePayload);
  if (error) throw error;
}

if (account) {
  const { data, error } = await admin.auth.admin.updateUserById(account.id, {
    email_confirm: true,
    password,
    user_metadata: {
      ...account.user_metadata,
      beta_admin: true,
      beta_admin_expires_at: expiresAt,
      full_name:
        account.user_metadata?.full_name ?? "Her Africa Table Beta Admin",
      must_change_temporary_password: true,
    },
  });
  if (error || !data.user) throw error ?? new Error("Account update failed.");
  account = data.user;
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      beta_admin: true,
      beta_admin_expires_at: expiresAt,
      full_name: "Her Africa Table Beta Admin",
      must_change_temporary_password: true,
    },
  });
  if (error || !data.user) throw error ?? new Error("Account creation failed.");
  account = data.user;
}

const { error: inviteAcceptanceError } = await admin
  .from("beta_invites")
  .update({
    accepted_at: new Date().toISOString(),
    accepted_by: account.id,
    expires_at: expiresAt,
    status: "accepted",
  })
  .eq("email", email)
  .eq("intended_role", "super_admin");
if (inviteAcceptanceError) throw inviteAcceptanceError;

const { error: roleError } = await admin.from("user_roles").upsert(
  {
    granted_at: new Date().toISOString(),
    role: "super_admin",
    user_id: account.id,
  },
  { onConflict: "user_id,role" },
);
if (roleError) throw roleError;

const { error: profileError } = await admin
  .from("profiles")
  .update({
    display_name: "Her Africa Table Beta Admin",
    is_test_account: true,
  })
  .eq("id", account.id);
if (profileError) throw profileError;

const { error: expiryError } = await admin
  .from("user_roles")
  .update({ expires_at: expiresAt })
  .eq("user_id", account.id)
  .eq("role", "super_admin");
if (expiryError) throw expiryError;

const verifier = createClient(url, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: signIn, error: signInError } =
  await verifier.auth.signInWithPassword({ email, password });
if (signInError || !signIn.user) {
  throw signInError ?? new Error("Credential verification failed.");
}
const { data: verifiedRole, error: verifiedRoleError } = await verifier
  .from("user_roles")
  .select("role")
  .eq("user_id", signIn.user.id)
  .eq("role", "super_admin")
  .maybeSingle();
await verifier.auth.signOut();
if (verifiedRoleError || !verifiedRole) {
  throw verifiedRoleError ?? new Error("Super Admin role verification failed.");
}

console.log(
  JSON.stringify({
    durationDays,
    email,
    expiresAt,
    expiryEnforced: true,
    role: verifiedRole.role,
    userId: account.id,
    verified: true,
  }),
);
