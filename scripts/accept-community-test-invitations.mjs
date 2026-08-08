import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const communitySlug = process.env.HAT_COMMUNITY_TEST_SLUG ?? "nairobi-founding-table";

if (!url || !publishable || !password || password.length < 12) {
  throw new Error(
    "Supabase public credentials and a 12+ character HAT_COMMUNITY_TEST_PASSWORD are required.",
  );
}

const emails = [
  "community.member.one@hat-test.invalid",
  "community.member.two@hat-test.invalid",
  "community.host@hat-test.invalid",
  "community.moderator@hat-test.invalid",
];

const results = [];
for (const email of emails) {
  const client = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`${email}: test sign-in failed`);

  const before = await client.rpc("list_communities");
  if (before.error) throw new Error(`${email}: Community rehearsal is unavailable`);
  const community = (before.data ?? []).find(
    (candidate) => candidate.slug === communitySlug,
  );
  if (!community) throw new Error(`${email}: rehearsal Community not found`);

  if (community.membership_status === "invited") {
    const accepted = await client.rpc("respond_to_community_invitation", {
      p_accept: true,
      p_community_id: community.community_id,
    });
    if (accepted.error) {
      throw new Error(
        `${email}: invitation acceptance failed — ${accepted.error.message}`,
      );
    }
  }

  const after = await client.rpc("list_communities");
  const membership = (after.data ?? []).find(
    (candidate) => candidate.slug === communitySlug,
  );
  if (after.error || membership?.membership_status !== "active") {
    throw new Error(`${email}: active Community membership was not confirmed`);
  }
  results.push({
    email,
    membershipRole: membership.membership_role,
    status: membership.membership_status,
  });
  await client.auth.signOut();
}

process.stdout.write(
  `${JSON.stringify({ communitySlug, passwordPrinted: false, results }, null, 2)}\n`,
);
