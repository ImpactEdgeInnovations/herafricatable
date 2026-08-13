import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const communitySlug =
  process.env.HAT_COMMUNITY_TEST_SLUG ?? "nairobi-founding-table";
if (!url || !secret || !password || password.length < 12) {
  throw new Error("Supabase server credentials and a 12+ character HAT_COMMUNITY_TEST_PASSWORD are required.");
}

const identities = [
  ["community.member.one@hat-test.invalid", "Test Member One"],
  ["community.member.two@hat-test.invalid", "Test Member Two"],
  ["community.host@hat-test.invalid", "Test Community Host"],
  ["community.moderator@hat-test.invalid", "Test Backup Moderator"],
  ["community.scale@hat-test.invalid", "Test Scale Member"],
];
const admin = createClient(url, secret, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: listed, error: listError } = await admin.auth.admin.listUsers({
  page: 1,
  perPage: 1000,
});
if (listError) throw listError;

const results = [];
for (const [email, displayName] of identities) {
  let user = listed.users.find((candidate) => candidate.email === email);
  let created = false;
  if (!user) {
    const result = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, test_account: true },
    });
    if (result.error || !result.data.user) throw result.error ?? new Error(`Could not create ${email}`);
    user = result.data.user;
    created = true;
  } else {
    const result = await admin.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: { ...user.user_metadata, full_name: displayName, test_account: true },
    });
    if (result.error) throw result.error;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({
      access_status: "active",
      display_name: displayName,
      is_test_account: true,
      onboarding_completed_at: new Date().toISOString(),
      profile_completion: 100,
    })
    .eq("id", user.id);
  if (profileError) throw profileError;
  results.push({ created, displayName, email, userId: user.id });
}

const scaleIdentity = results.find(
  (identity) => identity.email === "community.scale@hat-test.invalid",
);
const community = await admin
  .from("communities")
  .select("id")
  .eq("slug", communitySlug)
  .maybeSingle();
if (community.error) throw community.error;
let scaleMembershipPrepared = false;
if (community.data && scaleIdentity) {
  const membership = await admin.from("community_memberships").upsert(
    {
      community_id: community.data.id,
      joined_at: new Date().toISOString(),
      role: "member",
      status: "active",
      updated_at: new Date().toISOString(),
      user_id: scaleIdentity.userId,
    },
    { onConflict: "community_id,user_id" },
  );
  if (membership.error) throw membership.error;
  scaleMembershipPrepared = true;
}

process.stdout.write(
  `${JSON.stringify(
    {
      communitySlug,
      identities: results,
      passwordPrinted: false,
      scaleMembershipPrepared,
    },
    null,
    2,
  )}\n`,
);
