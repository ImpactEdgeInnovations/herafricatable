import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const communitySlug =
  process.env.HAT_COMMUNITY_TEST_SLUG ?? "nairobi-founding-table";
const memberEmail = "community.member.two@hat-test.invalid";

if (!url || !publishable || !password || password.length < 12) {
  throw new Error(
    "Supabase public credentials and a 12+ character HAT_COMMUNITY_TEST_PASSWORD are required.",
  );
}

async function signIn(email) {
  const client = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user) {
    throw new Error(`${email}: test sign-in failed`);
  }
  return { client, user: result.data.user };
}

const hostIdentity = await signIn("community.host@hat-test.invalid");
const memberIdentity = await signIn(memberEmail);
const host = hostIdentity.client;
const member = memberIdentity.client;

async function communityFor(client) {
  const result = await client.rpc("list_communities");
  if (result.error) throw result.error;
  const community = (result.data ?? []).find(
    (candidate) => candidate.slug === communitySlug,
  );
  if (!community) throw new Error("Rehearsal Community not found");
  return community;
}

async function membership(communityId) {
  const result = await host.rpc("list_community_members", {
    p_community_id: communityId,
  });
  if (result.error) throw result.error;
  const target = (result.data ?? []).find(
    (candidate) => candidate.user_id === memberIdentity.user.id,
  );
  if (!target) throw new Error("Test membership not found");
  return target;
}

async function review(communityId, action) {
  const target = await membership(communityId);
  const result = await host.rpc("review_community_membership", {
    p_action: action,
    p_membership_id: target.membership_id,
  });
  if (result.error) throw result.error;
}

async function normalizeActive(communityId) {
  const target = await membership(communityId);
  if (target.status === "active") return;
  if (target.status === "invited") {
    const accepted = await member.rpc("respond_to_community_invitation", {
      p_accept: true,
      p_community_id: communityId,
    });
    if (accepted.error) throw accepted.error;
    return;
  }
  if (target.status === "requested") {
    await review(communityId, "approve");
    return;
  }
  if (["declined", "removed"].includes(target.status)) {
    const requested = await member.rpc("request_community_access", {
      p_community_id: communityId,
    });
    if (requested.error) throw requested.error;
    await review(communityId, "approve");
    return;
  }
  throw new Error(`Cannot normalize membership from ${target.status}`);
}

try {
  const community = await communityFor(host);
  const communityId = community.community_id;
  await normalizeActive(communityId);

  let result = await member.rpc("manage_my_community_membership", {
    p_action: "leave",
    p_community_id: communityId,
  });
  if (result.error) throw result.error;

  result = await member.rpc("request_community_access", {
    p_community_id: communityId,
  });
  if (result.error) {
    throw new Error(
      "Draft admission rehearsal is not ready. Apply the latest Community rehearsal migration first.",
    );
  }
  result = await member.rpc("manage_my_community_membership", {
    p_action: "cancel_request",
    p_community_id: communityId,
  });
  if (result.error) throw result.error;

  result = await host.rpc("invite_community_member", {
    p_community_id: communityId,
    p_email: memberEmail,
    p_role: "member",
  });
  if (result.error) throw result.error;
  result = await member.rpc("manage_my_community_membership", {
    p_action: "decline_invitation",
    p_community_id: communityId,
  });
  if (result.error) throw result.error;

  result = await host.rpc("invite_community_member", {
    p_community_id: communityId,
    p_email: memberEmail,
    p_role: "member",
  });
  if (result.error) throw result.error;
  result = await member.rpc("respond_to_community_invitation", {
    p_accept: true,
    p_community_id: communityId,
  });
  if (result.error) throw result.error;

  await review(communityId, "remove");
  result = await member.rpc("request_community_access", {
    p_community_id: communityId,
  });
  if (result.error) throw result.error;
  await review(communityId, "approve");

  const finalMembership = await membership(communityId);
  if (
    finalMembership.status !== "active" ||
    finalMembership.role !== "member"
  ) {
    throw new Error("Test member was not restored to active member access");
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        communitySlug,
        passwordPrinted: false,
        checks: {
          cancelRequest: "passed",
          declineInvitation: "passed",
          hostApproval: "passed",
          hostRemoval: "passed",
          invitationAcceptance: "passed",
          leaveAndRejoin: "passed",
          restoredStatus: finalMembership.status,
        },
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await Promise.all([host.auth.signOut(), member.auth.signOut()]);
}
