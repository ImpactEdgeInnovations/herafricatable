import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.HAT_COMMUNITY_TEST_PASSWORD;
const adminEmail = process.env.HAT_ADMIN_TEST_EMAIL;
const adminPassword = process.env.HAT_ADMIN_TEST_PASSWORD;
const communitySlug = process.env.HAT_COMMUNITY_TEST_SLUG ?? "nairobi-founding-table";
const isolatedFixture = communitySlug === "hat-community-event-acceptance";
if (
  !url ||
  !publishable ||
  !password ||
  password.length < 8 ||
  (isolatedFixture && (!adminEmail || !adminPassword))
) {
  throw new Error("Supabase public credentials and rehearsal account details are required.");
}

const identities = {
  host: "community.host@hat-test.invalid",
  memberOne: "community.member.one@hat-test.invalid",
  memberTwo: "community.member.two@hat-test.invalid",
  moderator: "community.moderator@hat-test.invalid",
};

async function signIn(email) {
  const client = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await client.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user) throw new Error(`${email}: test sign-in failed`);
  return { client, userId: result.data.user.id };
}

async function requireCommunity(identity, label) {
  const result = await identity.client.rpc("list_communities");
  if (result.error) throw new Error(`${label}: Community list failed`);
  const community = (result.data ?? []).find((item) => item.slug === communitySlug);
  if (!community || community.membership_status !== "active") {
    throw new Error(`${label}: active rehearsal Community is required`);
  }
  return community;
}

const signedIn = {};
let cleanupAdmin = null;
let cleanupCard = null;
let cleanupCommunityId = null;
const signInFailures = [];
for (const [label, email] of Object.entries(identities)) {
  try {
    signedIn[label] = await signIn(email);
  } catch {
    signInFailures.push(label);
  }
}
if (signInFailures.length) {
  await Promise.all(Object.values(signedIn).map((identity) => identity.client.auth.signOut()));
  throw new Error(`Refresh these reserved test identities before rehearsal: ${signInFailures.join(", ")}. Add SUPABASE_SECRET_KEY locally, then run npm run ops:provision-community-test-cohort.`);
}

try {
  const communities = Object.fromEntries(await Promise.all(
    Object.entries(signedIn).map(async ([label, identity]) => [label, await requireCommunity(identity, label)]),
  ));
  const communityId = communities.memberOne.community_id;
  cleanupCommunityId = communityId;
  if (!Object.values(communities).every((item) => item.community_id === communityId)) {
    throw new Error("The rehearsal identities do not share one Community");
  }
  if (communities.memberOne.membership_role !== "member" || communities.memberTwo.membership_role !== "member" || communities.moderator.membership_role !== "moderator" || communities.host.membership_role !== "owner") {
    throw new Error("The two-member, owner and moderator role coverage is incomplete");
  }

  const cardResult = await signedIn.memberOne.client.rpc("list_community_gathering_cards", { p_community_id: communityId });
  if (cardResult.error) throw cardResult.error;
  const card = (cardResult.data ?? []).find((item) => new Date(item.ends_at).getTime() > Date.now());
  if (!card) throw new Error("Schedule one future linked Community event before running the Gathering rehearsal");
  cleanupCard = card;

  const roomResult = await signedIn.memberOne.client.rpc("get_community_gathering_room", { p_community_id: communityId, p_event_id: card.event_id });
  const room = roomResult.data?.[0];
  if (roomResult.error || !room) throw roomResult.error ?? new Error("Gathering room unavailable");

  for (const [identity, discoverable] of [[signedIn.memberOne, true], [signedIn.memberTwo, false]]) {
    const response = await identity.client.rpc("set_community_gathering_rsvp", {
      p_discoverable: discoverable, p_room_id: room.room_id, p_status: "going",
    });
    if (response.error) throw response.error;
  }
  const attendeeResult = await signedIn.memberOne.client.rpc("list_community_gathering_attendees", { p_room_id: room.room_id });
  if (attendeeResult.error || !attendeeResult.data?.some((item) => item.user_id === signedIn.memberOne.userId) || attendeeResult.data.some((item) => item.user_id === signedIn.memberTwo.userId)) {
    throw attendeeResult.error ?? new Error("Attendee visibility consent was not enforced");
  }

  const run = new Date().toISOString();
  const questionResult = await signedIn.memberOne.client.rpc("submit_community_gathering_question", {
    p_body: `Rehearsal ${run}: What one useful next step should members carry forward?`,
    p_room_id: room.room_id,
  });
  if (questionResult.error) throw questionResult.error;
  const supportResult = await signedIn.memberTwo.client.rpc("toggle_community_gathering_question_support", { p_question_id: questionResult.data });
  if (supportResult.error || supportResult.data !== true) throw supportResult.error ?? new Error("Question support was not recorded");
  const answerResult = await signedIn.host.client.rpc("review_community_gathering_question", { p_question_id: questionResult.data, p_status: "answered" });
  if (answerResult.error) throw answerResult.error;

  const liveChecks = { liveText: "requires an open rehearsal window", moderation: "requires an open rehearsal window" };
  if (room.chat_phase === "open") {
    const messageResult = await signedIn.memberOne.client.rpc("send_community_gathering_message", {
      p_body: `Gathering rehearsal ${run}: a useful live contribution.`, p_room_id: room.room_id,
    });
    if (messageResult.error) throw messageResult.error;
    const pinResult = await signedIn.moderator.client.rpc("manage_community_gathering_message", { p_action: "pin", p_message_id: messageResult.data });
    if (pinResult.error) throw pinResult.error;
    const visible = await signedIn.memberTwo.client.rpc("list_community_gathering_messages", { p_limit: 200, p_room_id: room.room_id });
    if (visible.error || !visible.data?.some((item) => item.message_id === messageResult.data && item.is_pinned)) throw visible.error ?? new Error("Pinned live message was not visible");

    const block = await signedIn.memberTwo.client.rpc("block_member", { p_member_id: signedIn.memberOne.userId, p_reason: "Gathering rehearsal" });
    if (block.error) throw block.error;
    try {
      const blocked = await signedIn.memberTwo.client.rpc("list_community_gathering_messages", { p_limit: 200, p_room_id: room.room_id });
      if (blocked.error || blocked.data?.some((item) => item.message_id === messageResult.data)) throw blocked.error ?? new Error("Blocked live message remained visible");
    } finally {
      const unblock = await signedIn.memberTwo.client.rpc("unblock_member", { p_member_id: signedIn.memberOne.userId });
      if (unblock.error) throw unblock.error;
    }
    liveChecks.liveText = "passed";
    liveChecks.moderation = "pin and blocked-pair boundaries passed";
  }

  const anonymous = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } });
  const anonymousRoom = await anonymous.rpc("get_community_gathering_room", { p_community_id: communityId, p_event_id: card.event_id });
  if (anonymousRoom.error || (anonymousRoom.data?.length ?? 0) !== 0) throw anonymousRoom.error ?? new Error("Anonymous visitor received a Gathering room");

  process.stdout.write(`${JSON.stringify({ communitySlug, eventSlug: card.event_slug, passwordPrinted: false, checks: {
    anonymousBoundary: "passed", attendeeConsent: "passed", questions: "submit, support and answer passed", roleCoverage: "passed", ...liveChecks,
  } }, null, 2)}\n`);
} finally {
  if (isolatedFixture && cleanupCard && cleanupCommunityId) {
    cleanupAdmin = createClient(url, publishable, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const adminSignIn = await cleanupAdmin.auth.signInWithPassword({
      email: adminEmail,
      password: adminPassword,
    });
    if (adminSignIn.error) throw new Error("Isolated Gathering cleanup Admin sign-in failed");
    const eventCleanup = await cleanupAdmin.rpc("save_event", {
      p_address_line: "Private rehearsal venue, arrival desk confirmed",
      p_capacity: 12,
      p_city: cleanupCard.city,
      p_country: cleanupCard.country,
      p_ends_at: cleanupCard.ends_at,
      p_event_id: cleanupCard.event_id,
      p_format: cleanupCard.format,
      p_is_featured: false,
      p_map_url: null,
      p_online_url: null,
      p_registration_mode: "closed",
      p_slug: cleanupCard.event_slug,
      p_starts_at: cleanupCard.starts_at,
      p_status: "cancelled",
      p_summary: cleanupCard.summary,
      p_timezone: cleanupCard.timezone,
      p_title: cleanupCard.title,
      p_venue_name: cleanupCard.venue_name,
    });
    if (eventCleanup.error) throw new Error("Isolated Gathering event cleanup failed");
    const communityCleanup = await cleanupAdmin.rpc("save_community", {
      p_community_id: cleanupCommunityId,
      p_description:
        "A private, archived-after-use Community for production event boundary acceptance.",
      p_name: "HAT Event Acceptance",
      p_slug: communitySlug,
      p_status: "archived",
      p_type: "private",
    });
    if (communityCleanup.error) throw new Error("Isolated Gathering Community cleanup failed");
    await cleanupAdmin.auth.signOut();
  }
  await Promise.all(Object.values(signedIn).map((identity) => identity.client.auth.signOut()));
}
