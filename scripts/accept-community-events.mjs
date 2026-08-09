import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const communityPassword = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const adminEmail = process.env.HAT_ADMIN_TEST_EMAIL;
const adminPassword = process.env.HAT_ADMIN_TEST_PASSWORD;

if (
  !url ||
  !publishable ||
  !communityPassword ||
  communityPassword.length < 8 ||
  !adminEmail ||
  !adminPassword
) {
  throw new Error(
    "Supabase public credentials, Community test password and Admin test credentials are required.",
  );
}

const identities = {
  host: "community.host@hat-test.invalid",
  memberOne: "community.member.one@hat-test.invalid",
  memberTwo: "community.member.two@hat-test.invalid",
  moderator: "community.moderator@hat-test.invalid",
};
const communitySlug = "hat-community-event-acceptance";
const eventTitle = "Community gathering acceptance rehearsal";

async function signedInClient(email, password) {
  const client = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error) throw new Error(`${email}: test sign-in failed`);
  return client;
}

async function rpc(client, name, parameters) {
  const result = await client.rpc(name, parameters);
  if (result.error) throw new Error(`${name}: ${result.error.message}`);
  return result.data;
}

async function ensureInvitation(admin, member, communityId, email, role) {
  const memberships = await rpc(admin, "list_community_members", {
    p_community_id: communityId,
  });
  const existing = (memberships ?? []).find(
    (membership) => membership.user_id === member.userId,
  );
  if (existing?.status === "active") return existing;
  if (!existing || ["declined", "removed"].includes(existing.status)) {
    await rpc(admin, "invite_community_member", {
      p_community_id: communityId,
      p_email: email,
      p_role: role,
    });
  }
  await rpc(member.client, "respond_to_community_invitation", {
    p_accept: true,
    p_community_id: communityId,
  });
  const refreshed = await rpc(admin, "list_community_members", {
    p_community_id: communityId,
  });
  return refreshed.find((membership) => membership.user_id === member.userId);
}

const [adminClient, hostClient, memberOneClient, memberTwoClient, moderatorClient] =
  await Promise.all([
    signedInClient(adminEmail, adminPassword),
    signedInClient(identities.host, communityPassword),
    signedInClient(identities.memberOne, communityPassword),
    signedInClient(identities.memberTwo, communityPassword),
    signedInClient(identities.moderator, communityPassword),
  ]);

const clients = {
  admin: adminClient,
  host: hostClient,
  memberOne: memberOneClient,
  memberTwo: memberTwoClient,
  moderator: moderatorClient,
};
const users = {};
for (const [name, client] of Object.entries(clients)) {
  const result = await client.auth.getUser();
  if (result.error || !result.data.user) throw new Error(`${name}: identity missing`);
  users[name] = { client, userId: result.data.user.id };
}

let communityId = null;
let eventId = null;
let eventSlug = null;
let proposalId = null;
let startsAt = null;
let endsAt = null;
let acceptanceSummary = null;

try {
  const adminCommunities = await rpc(adminClient, "list_communities");
  const existingCommunity = (adminCommunities ?? []).find(
    (community) => community.slug === communitySlug,
  );
  communityId = await rpc(adminClient, "save_community", {
    p_community_id: existingCommunity?.community_id ?? null,
    p_description:
      "A private, archived-after-use Community for production event boundary acceptance.",
    p_name: "HAT Event Acceptance",
    p_slug: communitySlug,
    p_status: "draft",
    p_type: "private",
  });

  let hostMembership = await ensureInvitation(
    adminClient,
    users.host,
    communityId,
    identities.host,
    "member",
  );
  if (hostMembership.role !== "owner") {
    await rpc(adminClient, "review_community_membership", {
      p_action: "transfer_ownership",
      p_membership_id: hostMembership.membership_id,
    });
    hostMembership = {
      ...hostMembership,
      role: "owner",
    };
  }

  await ensureInvitation(
    hostClient,
    users.memberOne,
    communityId,
    identities.memberOne,
    "member",
  );
  await ensureInvitation(
    hostClient,
    users.moderator,
    communityId,
    identities.moderator,
    "moderator",
  );
  const preflightMemberships = await rpc(hostClient, "list_community_members", {
    p_community_id: communityId,
  });
  const existingOutsider = preflightMemberships.find(
    (membership) => membership.user_id === users.memberTwo.userId,
  );
  if (existingOutsider?.status === "active") {
    await rpc(hostClient, "review_community_membership", {
      p_action: "remove",
      p_membership_id: existingOutsider.membership_id,
    });
  }

  startsAt = new Date(Date.now() + 8 * 86_400_000);
  startsAt.setUTCHours(15, 0, 0, 0);
  endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
  const proposal = {
    p_accessibility_notes: "Step-free arrival information confirmed for rehearsal.",
    p_address_line: "Private rehearsal venue",
    p_capacity: 12,
    p_city: "Nairobi",
    p_community_id: communityId,
    p_country: "Kenya",
    p_ends_at: endsAt.toISOString(),
    p_format: "in_person",
    p_host_note: "Automated production acceptance record. No real gathering.",
    p_map_url: null,
    p_online_url: null,
    p_safety_contact_name: "Test Community Host",
    p_safety_contact_phone: "+254700000000",
    p_starts_at: startsAt.toISOString(),
    p_summary:
      "A controlled rehearsal proving that a Host can propose a useful gathering while publication remains with the Her Africa Table review team.",
    p_timezone: "Africa/Nairobi",
    p_title: eventTitle,
    p_venue_name: "Private acceptance venue",
  };

  proposalId = await rpc(hostClient, "save_community_event_proposal", {
    ...proposal,
    p_proposal_id: null,
    p_submit: false,
  });
  let hostProposals = await rpc(hostClient, "list_my_community_event_proposals", {
    p_community_id: communityId,
  });
  assert.equal(
    hostProposals.find((item) => item.proposal_id === proposalId)?.status,
    "draft",
    "Host draft was not saved privately",
  );

  await rpc(hostClient, "save_community_event_proposal", {
    ...proposal,
    p_proposal_id: proposalId,
    p_submit: true,
  });
  await rpc(adminClient, "review_community_event_proposal", {
    p_action: "start_review",
    p_proposal_id: proposalId,
    p_review_note: null,
  });
  await rpc(adminClient, "review_community_event_proposal", {
    p_action: "request_changes",
    p_proposal_id: proposalId,
    p_review_note: "Please confirm the private arrival information before approval.",
  });

  hostProposals = await rpc(hostClient, "list_my_community_event_proposals", {
    p_community_id: communityId,
  });
  const requestedChange = hostProposals.find(
    (item) => item.proposal_id === proposalId,
  );
  assert.equal(requestedChange?.status, "changes_requested");
  assert(requestedChange?.review_note, "Host did not receive review guidance");

  await rpc(hostClient, "save_community_event_proposal", {
    ...proposal,
    p_address_line: "Private rehearsal venue, arrival desk confirmed",
    p_proposal_id: proposalId,
    p_submit: true,
  });
  eventId = await rpc(adminClient, "review_community_event_proposal", {
    p_action: "approve",
    p_proposal_id: proposalId,
    p_review_note: "Acceptance checks complete.",
  });
  assert(eventId, "Approval did not create a canonical event");

  const approvedRows = await memberOneClient
    .from("events")
    .select("id,slug,audience,status,registration_mode")
    .eq("id", eventId);
  assert.ifError(approvedRows.error);
  assert.equal(approvedRows.data?.length, 1, "Active Community member cannot see event");
  assert.equal(approvedRows.data[0].audience, "community");
  assert.equal(approvedRows.data[0].registration_mode, "manual_review");
  eventSlug = approvedRows.data[0].slug;

  const anonymous = createClient(url, publishable, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anonymousEvent = await anonymous.from("events").select("id").eq("id", eventId);
  assert.ifError(anonymousEvent.error);
  assert.equal(anonymousEvent.data?.length, 0, "Anonymous visitor read a Community event");

  const outsiderEvent = await memberTwoClient
    .from("events")
    .select("id")
    .eq("id", eventId);
  assert.ifError(outsiderEvent.error);
  assert.equal(outsiderEvent.data?.length, 0, "Non-member read a Community event");

  await ensureInvitation(
    hostClient,
    users.memberTwo,
    communityId,
    identities.memberTwo,
    "member",
  );
  const joinedEvent = await memberTwoClient
    .from("events")
    .select("id")
    .eq("id", eventId);
  assert.equal(joinedEvent.data?.length, 1, "Newly joined member cannot see event");

  const tickets = await memberOneClient
    .from("ticket_types")
    .select("id,price_minor")
    .eq("event_id", eventId)
    .eq("status", "on_sale");
  assert.ifError(tickets.error);
  assert.equal(tickets.data?.length, 1, "Free Community ticket was not created");
  assert.equal(tickets.data[0].price_minor, 0, "Community ticket is not free");

  const multiSeat = await memberTwoClient.rpc("create_event_registration", {
    p_attendee_note: "Boundary rehearsal",
    p_event_id: eventId,
    p_manual_note: null,
    p_manual_reference: null,
    p_quantity: 2,
    p_ticket_type_id: tickets.data[0].id,
  });
  assert(multiSeat.error, "Member unexpectedly requested more than one Community place");

  const registration = await memberOneClient.rpc("create_event_registration", {
    p_attendee_note: "Acceptance rehearsal",
    p_event_id: eventId,
    p_manual_note: null,
    p_manual_reference: null,
    p_quantity: 1,
    p_ticket_type_id: tickets.data[0].id,
  });
  assert.ifError(registration.error);
  assert(registration.data, "One-seat registration was not created");

  acceptanceSummary = {
    checks: {
      adminApproval: "passed",
      adminChangeRequest: "passed",
      anonymousBoundary: "passed",
      freeManualRegistration: "passed",
      hostDraftAndResubmission: "passed",
      memberDiscovery: "passed",
      nonMemberBoundary: "passed",
      oneSeatLimit: "passed",
    },
    community: "isolated acceptance Community",
    event: "canonical Community event",
    participants: 5,
    secretsPrinted: false,
  };
} finally {
  const cleanupErrors = [];
  if (eventId && eventSlug && startsAt && endsAt) {
    const eventCleanup = await adminClient.rpc("save_event", {
      p_address_line: "Private rehearsal venue, arrival desk confirmed",
      p_capacity: 12,
      p_city: "Nairobi",
      p_country: "Kenya",
      p_ends_at: endsAt.toISOString(),
      p_event_id: eventId,
      p_format: "in_person",
      p_is_featured: false,
      p_map_url: null,
      p_online_url: null,
      p_registration_mode: "closed",
      p_slug: eventSlug,
      p_starts_at: startsAt.toISOString(),
      p_status: "cancelled",
      p_summary:
        "A controlled rehearsal proving that Community events remain inside their approved audience.",
      p_timezone: "Africa/Nairobi",
      p_title: eventTitle,
      p_venue_name: "Private acceptance venue",
    });
    if (eventCleanup.error) cleanupErrors.push("event cleanup");
  }
  if (communityId) {
    const communityCleanup = await adminClient.rpc("save_community", {
      p_community_id: communityId,
      p_description:
        "A private, archived-after-use Community for production event boundary acceptance.",
      p_name: "HAT Event Acceptance",
      p_slug: communitySlug,
      p_status: "archived",
      p_type: "private",
    });
    if (communityCleanup.error) cleanupErrors.push("Community cleanup");
  }
  await Promise.all(Object.values(clients).map((client) => client.auth.signOut()));
  if (cleanupErrors.length) {
    throw new Error(`${cleanupErrors.join(" and ")} failed`);
  }
}

if (acceptanceSummary) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ...acceptanceSummary,
        cleanup: "event cancelled and Community archived",
      },
      null,
      2,
    )}\n`,
  );
}
