import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  OrderHistory,
  type MemberOrder,
} from "@/components/member/order-history";
import { MemberHeader } from "@/components/member/member-header";
import {
  TableJourney,
  type TableJourneyState,
} from "@/components/member/table-journey";
import {
  type HomeCommunity,
} from "@/components/member/community-return-card";
import {
  YourTableToday,
  type TableTodaySuggestion,
} from "@/components/member/your-table-today";

export const dynamic = "force-dynamic";

type NextEvent = {
  format: string;
  id: string;
  registration_mode: string;
  slug: string;
  starts_at: string;
  title: string;
  venues: { city: string; country: string; name: string } | null;
};

type RegistrationStatus =
  | "approved"
  | "cancelled"
  | "pending_payment"
  | "pending_review"
  | "rejected"
  | "waitlisted";

type ActivationJourney = {
  accepted_connections: number;
  cohort_id: string | null;
  cohort_membership_status: "active" | "invited" | null;
  cohort_name: string | null;
  cohort_slug: string | null;
  confirmed_events: number;
  guidelines_accepted: boolean;
  introduction_complete: boolean;
  profile_complete: boolean;
};
type DueConnectionFollowup = {
  connection_id: string;
  display_name: string;
  next_step: string;
  remind_on: string;
};
type HomeMemberSuggestion = {
  display_name: string | null;
  industry: string | null;
  city: string | null;
  match_reasons: string[];
  user_id: string;
};

export default async function MemberHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "display_name, access_status, onboarding_completed_at, is_test_account",
    )
    .eq("id", user.id)
    .maybeSingle();

  const accessStatus = profile?.access_status ?? "pending";
  if (accessStatus === "onboarding") redirect("/onboarding");
  if (accessStatus === "active") {
    const { data: completion } = await supabase
      .from("profiles")
      .select("profile_completion")
      .eq("id", user.id)
      .maybeSingle();
    if (completion && completion.profile_completion < 100)
      redirect("/onboarding");
  }
  const isApproved = ["onboarding", "active", "dormant"].includes(accessStatus);
  const isSuspended = accessStatus === "suspended";
  const membershipApplicationResult =
    accessStatus === "pending"
      ? await supabase
          .from("membership_applications")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null, error: null };
  const applicationStatus = membershipApplicationResult.data?.status ?? null;
  const { data: nextEventRow } = await supabase
    .from("events")
    .select(
      "id,slug,title,format,starts_at,registration_mode,venues(name,city,country)",
    )
    .eq("status", "published")
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const nextEvent = nextEventRow as unknown as NextEvent | null;
  const { data: nextRegistration } = nextEvent
    ? await supabase
        .from("registration_requests")
        .select("status")
        .eq("event_id", nextEvent.id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };
  const nextRegistrationStatus = nextRegistration?.status as
    | RegistrationStatus
    | undefined;
  const { data: orderRows } = await supabase
    .from("orders")
    .select(
      "id,reference,status,processing_mode,currency,total_minor,created_at,order_type,events(title,slug),order_items(ticket_types(name),courses(title,slug),membership_plans(name,slug),community_offers(name,communities(name,slug)),community_host_plans(name)),community_host_plan_orders(communities(name,slug))",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  const orderIds = (orderRows ?? []).map((order) => order.id);
  const { data: refunds } = orderIds.length
    ? await supabase
        .from("refund_requests")
        .select("order_id")
        .in("order_id", orderIds)
    : { data: [] };
  const orders: MemberOrder[] = (orderRows ?? []).map((order) => {
    const item = (
      order.order_items as unknown as {
        ticket_types: { name: string } | null;
        courses: { slug: string; title: string } | null;
        membership_plans: { slug: string; name: string } | null;
        community_offers: {
          name: string;
          communities: { name: string; slug: string } | null;
        } | null;
        community_host_plans: { name: string } | null;
      }[]
    )[0];
    const hostContext = order.community_host_plan_orders as unknown as {
      communities: { name: string; slug: string } | null;
    } | null;
    const community =
      item?.community_offers?.communities ?? hostContext?.communities ?? null;
    return {
      community,
      course: item?.courses ?? null,
      host_plan: item?.community_host_plans ?? null,
      membership: item?.membership_plans ?? null,
      created_at: order.created_at,
      currency: order.currency,
      event: order.events as unknown as { slug: string; title: string } | null,
      id: order.id,
      order_type: order.order_type,
      processing_mode: order.processing_mode,
      reference: order.reference,
      status: order.status,
      ticket_name:
        item?.ticket_types?.name ??
        (item?.courses
          ? "Course access"
          : item?.membership_plans
            ? "Membership term"
            : item?.community_offers
              ? item.community_offers.name
              : item?.community_host_plans
                ? `${item.community_host_plans.name} host plan`
                : "Event ticket"),
      total_minor: order.total_minor,
    };
  });
  const opportunityResult =
    accessStatus === "active"
      ? await supabase.rpc("list_marketplace_posts", {
          p_category: null,
          p_limit: 3,
          p_offset: 0,
          p_post_type: null,
          p_search: null,
        })
      : { data: [], error: null };
  const communityFlagResult =
    accessStatus === "active"
      ? await supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "communities")
          .maybeSingle()
      : { data: null, error: null };
  const communityAcceptanceFlagResult =
    accessStatus === "active" && profile?.is_test_account
      ? await supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "community_acceptance_mode")
          .maybeSingle()
      : { data: null, error: null };
  const communityEnabled =
    communityFlagResult.data?.enabled === true ||
    (profile?.is_test_account === true &&
      communityAcceptanceFlagResult.data?.enabled === true);
  const [homeCommunityResult, homeCommunityActivityResult] = communityEnabled
    ? await Promise.all([
        supabase.rpc("list_communities"),
        supabase.rpc("list_my_community_activity"),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const activityByCommunity = new Map(
    ((homeCommunityActivityResult.data as
      | {
          community_id: string;
          latest_activity_at: string | null;
          new_activity_count: number;
          new_conversation_count: number;
          new_reply_count: number;
        }[]
      | null) ?? []).map((activity) => [activity.community_id, activity]),
  );
  const homeCommunities = (
    (homeCommunityResult.data as HomeCommunity[] | null) ?? []
  ).map((community) => ({
    ...community,
    ...(activityByCommunity.get(community.community_id) ?? {}),
  }));
  const learningFlagResult =
    accessStatus === "active"
      ? await supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "learning")
          .maybeSingle()
      : { data: null, error: null };
  const referralFlagResult =
    accessStatus === "active"
      ? await supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "referrals")
          .maybeSingle()
      : { data: null, error: null };
  const membershipFlagResult = ["active", "dormant"].includes(accessStatus)
    ? await supabase
        .from("feature_flags")
        .select("enabled")
        .eq("key", "memberships")
        .maybeSingle()
    : { data: null, error: null };
  const circleFlagResult =
    accessStatus === "active"
      ? await supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "circles")
          .maybeSingle()
      : { data: null, error: null };
  const perkFlagResult =
    accessStatus === "active"
      ? await supabase
          .from("feature_flags")
          .select("enabled")
          .eq("key", "partner_perks")
          .maybeSingle()
      : { data: null, error: null };
  const opportunities =
    (opportunityResult.data as
      | {
          author_name: string;
          category: string;
          post_id: string;
          post_type: string;
          title: string;
        }[]
      | null) ?? [];
  const pastEventResult =
    accessStatus === "active"
      ? await supabase.rpc("list_my_past_events")
      : { data: [], error: null };
  const activationResult =
    accessStatus === "active"
      ? await supabase.rpc("get_my_activation_journey")
      : { data: [], error: null };
  const tableJourneyResult =
    accessStatus === "active"
      ? await supabase.rpc("get_my_table_journey")
      : { data: [], error: null };
  const activation = ((activationResult.data as ActivationJourney[] | null) ??
    [])[0];
  const tableJourney = (
    (tableJourneyResult.data as TableJourneyState[] | null) ?? []
  )[0];
  const [
    conversationResult,
    unreadNotificationResult,
    dueFollowupResult,
    consentMemberSuggestionResult,
  ] =
    accessStatus === "active"
      ? await Promise.all([
          supabase.rpc("list_my_conversations"),
          supabase
            .from("notifications")
            .select("id", { count: "exact", head: true })
            .is("read_at", null),
          supabase.rpc("list_due_connection_followups", { p_limit: 3 }),
          supabase.rpc("list_consent_led_member_recommendations", {
            p_limit: 1,
          }),
        ])
      : [{ data: [] }, { count: 0 }, { data: [] }, { data: [] }];
  const memberSuggestionResult =
    accessStatus === "active" && consentMemberSuggestionResult.error
      ? { data: [], error: null }
      : consentMemberSuggestionResult;
  const unreadMessages = (
    (conversationResult.data as { unread_count: number }[] | null) ?? []
  ).reduce((total, conversation) => total + Number(conversation.unread_count), 0);
  const unreadNotifications = unreadNotificationResult.count ?? 0;
  const dueFollowups =
    (dueFollowupResult.data as DueConnectionFollowup[] | null) ?? [];
  const memberSuggestion = (
    (memberSuggestionResult.data as HomeMemberSuggestion[] | null) ?? []
  )[0];
  const acceptedConnections = Number(activation?.accepted_connections ?? 0);
  const activationComplete = activation
    ? [
        activation.profile_complete && activation.guidelines_accepted,
        Number(activation.confirmed_events) > 0,
        activation.cohort_membership_status === "active",
        activation.introduction_complete,
        acceptedConnections >= 2,
      ].filter(Boolean).length
    : 0;
  const feedbackPrompt = (
    (pastEventResult.data as
      | { feedback_id: string | null; slug: string; title: string }[]
      | null) ?? []
  ).find((event) => !event.feedback_id);
  const firstName = profile?.display_name?.trim().split(/\s+/)[0];
  const memberState =
    accessStatus === "active"
      ? {
          label: "Membership active",
          title: `Welcome${firstName ? `, ${firstName}` : ""}.`,
          description:
            "Your membership is ready. Meet members, join an event, or continue a conversation from here.",
          action: "Find members",
          href: "/network",
        }
      : accessStatus === "dormant"
        ? {
            label: "Renewal needed",
            title: `Welcome back${firstName ? `, ${firstName}` : ""}.`,
            description:
              "Your profile is safe, but member access needs to be renewed. Review your membership or ask the team for help.",
            action: membershipFlagResult.data?.enabled
              ? "Review membership"
              : "Contact support",
            href: membershipFlagResult.data?.enabled
              ? "/membership"
              : "/support",
          }
        : isSuspended
          ? {
              label: "Access paused",
              title: "Your access is paused.",
              description:
                "Your account remains secure, but member features are temporarily unavailable. Contact the team if you need help.",
              action: "Contact support",
              href: "mailto:support@herafricatable.com",
            }
          : !membershipApplicationResult.error && !applicationStatus
            ? {
                label: "One short step",
                title: "Tell us a little about you.",
                description:
                  "Your email is verified. Complete a short private request so our membership team can prepare your seat thoughtfully.",
                action: "Request membership",
                href: "/apply",
              }
            : applicationStatus === "declined"
              ? {
                  label: "Request update",
                  title: "You can update your request.",
                  description:
                    "We could not approve your earlier request. You may revise it or contact the team if you would like help.",
                  action: "Update my request",
                  href: "/apply",
                }
              : {
                  label: "Approval pending",
                  title: "Your request is with our team.",
                  description:
                    "We are reviewing your request privately. You can explore upcoming gatherings while your seat is being considered.",
                  action: "Explore events",
                  href: "/events",
                };
  const registrationState = nextRegistrationStatus
    ? ({
        approved: {
          label: "Seat confirmed",
          description:
            "Your place at the table is confirmed. Event updates will appear in your notifications.",
          action: "View event details",
        },
        pending_payment: {
          label: "Payment needed",
          description:
            "Your place is being held. Complete payment to confirm your seat.",
          action: "Complete registration",
        },
        pending_review: {
          label: "Under review",
          description:
            "The team has your registration and payment details. We will notify you after review.",
          action: "View registration",
        },
        waitlisted: {
          label: "Waitlist joined",
          description:
            "You are on the guest list waitlist. We will notify you as soon as a seat opens.",
          action: "View event details",
        },
        rejected: {
          label: "Registration not approved",
          description:
            "This registration was not approved. Contact support if you would like help.",
          action: "View event details",
        },
        cancelled: {
          label: "Registration cancelled",
          description:
            "Your previous registration is closed. You can review the event for current options.",
          action: "View event details",
        },
      }[nextRegistrationStatus] ?? {
        label: "Registration received",
        description: "Your registration is recorded for this event.",
        action: "View event details",
      })
    : {
        label:
          nextEvent?.registration_mode === "waitlist"
            ? "Waitlist open"
            : nextEvent?.registration_mode === "closed"
              ? "Registration closed"
              : "Registration open",
        description:
          nextEvent?.registration_mode === "closed"
            ? "Registration is currently closed. View the event for updates."
            : "Request your place at the next table and follow your confirmation here.",
        action:
          nextEvent?.registration_mode === "closed"
            ? "View event details"
            : nextEvent?.registration_mode === "waitlist"
              ? "Join the waitlist"
              : "Request your seat",
      };
  const activationNext =
    activation && activationComplete < 5
      ? !activation.profile_complete || !activation.guidelines_accepted
        ? {
            action: "Finish your profile",
            description:
              "Complete the details that help trusted members understand your work.",
            href: "/onboarding",
            label: "Complete your setup",
          }
        : Number(activation.confirmed_events) === 0
          ? {
              action: "Find your next event",
              description:
                "Choose a gathering before moving into attendee introductions.",
              href: "/events",
              label: "Confirm a table",
            }
          : activation.cohort_membership_status !== "active"
            ? {
                action:
                  activation.cohort_membership_status === "invited"
                    ? "Review your invitation"
                    : "View communities",
                description:
                  "Your private room opens only after you deliberately accept.",
                href: "/communities",
                label: "Join your room",
              }
            : !activation.introduction_complete
              ? {
                  action: "Introduce yourself",
                  description:
                    "Share what you are building, offering and looking for.",
                  href: activation.cohort_slug
                    ? `/communities/${activation.cohort_slug}`
                    : "/communities",
                  label: "Share your context",
                }
              : {
                  action: "Discover members",
                  description:
                    "Build two mutual connections before starting private conversations.",
                  href: "/network",
                  label: "Meet the right people",
                }
      : null;
  const tableJourneyNext = tableJourney
    ? !tableJourney.profile_ready
      ? {
          action: "Finish your profile",
          description:
            "Share enough context for the right women to understand your work.",
          href: "/onboarding",
          label: "Make your profile useful",
        }
      : communityEnabled && !tableJourney.introduction_shared
        ? {
            action: tableJourney.community_joined
              ? "Introduce yourself"
              : "Find a Community",
            description: tableJourney.community_joined
              ? `Take your seat in ${tableJourney.community_name ?? "your Community"} with a short, useful introduction.`
              : "Choose one focused Community where you can contribute and build trust.",
            href: tableJourney.community_slug
              ? `/communities/${tableJourney.community_slug}`
              : "/communities",
            label: "Enter the Community",
          }
        : !tableJourney.gathering_reserved
          ? {
              action: "Find a gathering",
              description:
                "Reserve one gathering where a useful conversation can begin.",
              href: "/events",
              label: "Join a real table",
            }
          : !tableJourney.trusted_connection_made
            ? {
                action: "Meet members",
                description:
                  "Choose one relevant woman. Conversation opens only after you both agree.",
                href: "/network",
                label: "Make one trusted connection",
              }
            : !tableJourney.follow_up_planned
              ? {
                  action: "Plan a follow-up",
                  description:
                    "Record one private next step so a valuable relationship keeps moving.",
                  href: "/network",
                  label: "Continue the relationship",
                }
              : null
    : null;
  const nextBestAction =
    accessStatus !== "active"
      ? null
      : feedbackPrompt
        ? {
            action: "Share private feedback",
            description: `Reflect on ${feedbackPrompt.title}. Nothing becomes public without separate permission.`,
            href: `/events/${feedbackPrompt.slug}/feedback`,
            label: "After the table",
          }
        : unreadMessages > 0
          ? {
              action: "Open conversations",
              description: `${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"} waiting for your response.`,
              href: "/messages",
              label: "Continue a conversation",
            }
          : dueFollowups.length > 0
            ? {
                action: "See reminder",
                description:
                  dueFollowups.length === 1
                    ? `${dueFollowups[0].next_step} — ${dueFollowups[0].display_name}`
                    : `${dueFollowups.length} private reminders are ready for your attention.`,
                href: "/network",
                label: "Keep in touch",
              }
          : unreadNotifications > 0
            ? {
                action: "See your updates",
                description: `${unreadNotifications} new update${unreadNotifications === 1 ? "" : "s"} across your network and events.`,
                href: "/notifications",
                label: "See what changed",
              }
            : tableJourneyNext ?? activationNext ??
              (nextEvent && !nextRegistrationStatus
                ? {
                    action: registrationState.action,
                    description: registrationState.description,
                    href:
                      nextEvent.registration_mode === "closed"
                        ? `/events/${nextEvent.slug}`
                        : `/events/${nextEvent.slug}/register`,
                    label: "Your next table",
                  }
                : {
                    action: "Explore members",
                    description:
                      "Find someone relevant by her work, location, interests or current goals.",
                    href: "/network",
                    label: "Your network is ready",
                  });

  const activeHomeCommunity = [...homeCommunities]
    .filter((community) => community.membership_status === "active")
    .sort(
      (left, right) =>
        Number(right.new_activity_count ?? 0) -
        Number(left.new_activity_count ?? 0),
    )[0];
  const personToday: TableTodaySuggestion = memberSuggestion
    ? {
        action: "View her profile",
        description:
          memberSuggestion.match_reasons?.slice(0, 2).join(" · ") ||
          [memberSuggestion.industry, memberSuggestion.city]
            .filter(Boolean)
            .join(" · ") ||
          "A fresh perspective for your network.",
        href: `/members/${memberSuggestion.user_id}`,
        kicker: "Who to meet",
        title: memberSuggestion.display_name || "Meet a member",
      }
    : {
        action: "Meet members",
        description:
          "Browse only the profiles members have chosen to make visible.",
        href: "/network",
        kicker: "Who to meet",
        title: "Find one relevant person",
      };
  const communityToday: TableTodaySuggestion = activeHomeCommunity
    ? {
        action: Number(activeHomeCommunity.new_activity_count ?? 0)
          ? "See what is new"
          : "Open Community",
        description: Number(activeHomeCommunity.new_activity_count ?? 0)
          ? `${activeHomeCommunity.new_activity_count} new update${Number(activeHomeCommunity.new_activity_count) === 1 ? "" : "s"} since your last visit.`
          : activeHomeCommunity.tagline ||
            "Return when you want to ask, offer or continue a conversation.",
        href: `/communities/${activeHomeCommunity.slug}`,
        kicker: "Where to participate",
        title: activeHomeCommunity.name,
      }
    : {
        action: "Find a Community",
        description:
          "Choose one group built around a purpose, interest or place you share.",
        href: "/communities",
        kicker: "Where to participate",
        title: "Find your room",
      };
  const actionToday: TableTodaySuggestion = {
    action: nextBestAction?.action ?? "See your next step",
    description:
      nextBestAction?.description ??
      "Choose one small action that keeps a useful relationship moving.",
    href: nextBestAction?.href ?? "/network",
    kicker: "What to follow up on",
    title: nextBestAction?.label ?? "Continue where you left off",
  };

  return (
    <main className="member-home-page">
      <MemberHeader active="home" label="Member home" />
      <section className="member-welcome">
        <div className="member-welcome-copy">
          <p className="member-state">
            <span aria-hidden="true" />
            {memberState.label}
          </p>
          <h1>{memberState.title}</h1>
          <p>{memberState.description}</p>
          {accessStatus !== "active" ? <div className="portal-actions">
            {memberState.href.startsWith("mailto:") ? (
              <a className="button button-primary" href={memberState.href}>
                {memberState.action}
              </a>
            ) : (
              <Link className="button button-primary" href={memberState.href}>
                {memberState.action}
              </Link>
            )}
          </div> : null}
        </div>
      </section>
      {accessStatus === "active" ? (
        <YourTableToday
          action={actionToday}
          community={communityToday}
          person={personToday}
        />
      ) : null}
      {accessStatus === "active" || isApproved || feedbackPrompt || orders.length ? (
        <details className="member-home-secondary">
          <summary>
            <div>
              <p className="eyebrow">More from your membership</p>
              <h2>Your progress, invitations and account details.</h2>
              <p>
                Open these only when you need them. Your main Home page stays
                focused on what matters today.
              </p>
            </div>
            <span>
              <span className="when-closed">Show more</span>
              <span className="when-open">Show less</span>
            </span>
          </summary>
          <div className="member-home-secondary-content">
      {accessStatus === "active" && tableJourney && !tableJourneyResult.error ? (
        <TableJourney
          communityAvailable={communityEnabled}
          journey={tableJourney}
        />
      ) : accessStatus === "active" &&
      activation &&
      activationComplete < 5 &&
      !activationResult.error ? (
        <section
          className="member-activation member-activation-compact"
          aria-labelledby="member-activation-title"
        >
          <header>
            <div>
              <p className="eyebrow">Getting started</p>
              <h2 id="member-activation-title">
                One step at a time.
              </h2>
              <p>
                Your profile, rooms and connections always remain under your
                control.
              </p>
            </div>
            <span>
              {activationComplete}/5 complete
            </span>
          </header>
          <div
            aria-label={`${activationComplete} of 5 setup steps complete`}
            className="member-activation-progress"
            role="progressbar"
            aria-valuemax={5}
            aria-valuemin={0}
            aria-valuenow={activationComplete}
          >
            <i style={{ width: `${(activationComplete / 5) * 100}%` }} />
          </div>
          <div className="member-activation-focus">
            <div>
              <span>Recommended now</span>
              <strong>{activationNext?.label ?? "Continue your setup"}</strong>
              <p>{activationNext?.description}</p>
            </div>
            <Link
              className="button button-primary"
              href={activationNext?.href ?? "/network"}
            >
              {activationNext?.action ?? "Continue"}
            </Link>
          </div>
          <details className="member-activation-steps">
            <summary>
              <span>View every setup step</span>
              <small>{5 - activationComplete} remaining</small>
            </summary>
            <ol>
            <li
              className={
                activation.profile_complete && activation.guidelines_accepted
                  ? "is-complete"
                  : ""
              }
            >
              <span>01</span>
              <div>
                <strong>Complete your profile and agreements</strong>
                <p>
                  Help trusted members understand your professional context.
                </p>
              </div>
              <Link
                href={
                  activation.profile_complete &&
                  activation.guidelines_accepted
                    ? "/profile"
                    : "/onboarding"
                }
              >
                {activation.profile_complete && activation.guidelines_accepted
                  ? "Edit profile"
                  : "Finish profile"}
              </Link>
            </li>
            <li
              className={
                Number(activation.confirmed_events) > 0 ? "is-complete" : ""
              }
            >
              <span>02</span>
              <div>
                <strong>Confirm your place at an event</strong>
                <p>Event approval remains separate from network membership.</p>
              </div>
              <Link href="/events">
                {Number(activation.confirmed_events) > 0
                  ? "Confirmed"
                  : "View events"}
              </Link>
            </li>
            <li
              className={
                activation.cohort_membership_status === "active"
                  ? "is-complete"
                  : ""
              }
            >
              <span>03</span>
              <div>
                <strong>Accept your founding-room invitation</strong>
                <p>
                  Invitations grant no access until you deliberately accept.
                </p>
              </div>
              <Link
                href={
                  activation.cohort_membership_status === "active" &&
                  activation.cohort_slug
                    ? `/communities/${activation.cohort_slug}`
                    : "/communities"
                }
              >
                {activation.cohort_membership_status === "active"
                  ? "Room joined"
                  : activation.cohort_membership_status === "invited"
                    ? "Review invitation"
                    : "Awaiting invitation"}
              </Link>
            </li>
            <li
              className={activation.introduction_complete ? "is-complete" : ""}
            >
              <span>04</span>
              <div>
                <strong>Share a guided introduction</strong>
                <p>Say what you are building, offering and seeking.</p>
              </div>
              <Link
                href={
                  activation.cohort_slug
                    ? `/communities/${activation.cohort_slug}`
                    : "/communities"
                }
              >
                {activation.introduction_complete
                  ? "Introduction shared"
                  : "Introduce yourself"}
              </Link>
            </li>
            <li
              className={
                Number(activation.accepted_connections) >= 2
                  ? "is-complete"
                  : ""
              }
            >
              <span>05</span>
              <div>
                <strong>Build two mutual connections</strong>
                <p>Private messaging opens only after both members consent.</p>
              </div>
              <Link href="/network">
                {Number(activation.accepted_connections) >= 2
                  ? "Complete"
                  : "Discover members"}
              </Link>
            </li>
            </ol>
          </details>
        </section>
      ) : null}
      {isApproved ? (
        <details className="member-more-tools">
          <summary>
            <div>
              <p className="eyebrow">More things you can do</p>
              <h2>Open your member tools</h2>
              <p>
                Membership, communities, learning, benefits, invitations and
                private support are kept here so your home page stays simple.
              </p>
            </div>
            <span>
              <span className="when-closed">Show member tools</span>
              <span className="when-open">Hide member tools</span>
            </span>
          </summary>
          <section
            className="member-launchpad"
            aria-label="Additional member tools"
          >
            <header>
              <strong>Choose one area</strong>
              <span>Only you can see these account tools</span>
            </header>
            <div>
              {membershipFlagResult.data?.enabled ? (
                <Link href="/membership">
                  <small>Your account</small>
                  <strong>Membership</strong>
                  <span>View your status and renewal →</span>
                </Link>
              ) : null}
              {accessStatus === "active" ? (
                <Link href="/opportunities">
                  <small>Ask or offer</small>
                  <strong>Ask or offer</strong>
                  <span>Share what you need or can offer →</span>
                </Link>
              ) : null}
              {circleFlagResult.data?.enabled ? (
                <Link href="/circles">
                  <small>Small groups</small>
                  <strong>Circles</strong>
                  <span>Join your guided peer group →</span>
                </Link>
              ) : null}
              {communityFlagResult.data?.enabled ? (
                <Link href="/communities">
                  <small>Shared interests</small>
                  <strong>Communities</strong>
                  <span>Visit focused member spaces →</span>
                </Link>
              ) : null}
              {learningFlagResult.data?.enabled ? (
                <Link href="/learning">
                  <small>Build skills</small>
                  <strong>Learning</strong>
                  <span>Continue a course →</span>
                </Link>
              ) : null}
              {perkFlagResult.data?.enabled ? (
                <Link href="/perks">
                  <small>Member offers</small>
                  <strong>Benefits</strong>
                  <span>View available partner benefits →</span>
                </Link>
              ) : null}
              {referralFlagResult.data?.enabled ? (
                <Link href="/referrals">
                  <small>Invite someone</small>
                  <strong>Invite a member</strong>
                  <span>Recommend a woman you trust →</span>
                </Link>
              ) : null}
              <Link href="/support">
                <small>Need help?</small>
                <strong>Get help</strong>
                <span>Send a private request →</span>
              </Link>
            </div>
          </section>
        </details>
      ) : null}
      {feedbackPrompt ? (
        <section className="home-feedback-prompt">
          <div>
            <p className="eyebrow">A private reflection</p>
            <h2>How was {feedbackPrompt.title}?</h2>
            <p>
              Your feedback helps shape the next table. Nothing is published
              without separate testimonial permission.
            </p>
          </div>
          <Link
            className="button button-primary"
            href={`/events/${feedbackPrompt.slug}/feedback`}
          >
            Share feedback
          </Link>
        </section>
      ) : null}
      {accessStatus === "active" && !opportunityResult.error ? (
        <section className="home-opportunities">
          <header>
            <div>
              <p className="eyebrow">Member exchange</p>
              <h2>What the table needs now</h2>
            </div>
            <Link href="/opportunities">View all Asks &amp; Offers</Link>
          </header>
          {opportunities.length ? (
            <div>
              {opportunities.map((item) => (
                <Link href="/opportunities" key={item.post_id}>
                  <span>
                    {item.post_type} · {item.category}
                  </span>
                  <strong>{item.title}</strong>
                  <small>{item.author_name}</small>
                </Link>
              ))}
            </div>
          ) : (
            <div className="admin-empty">
              <strong>Start the first exchange</strong>
              <p>
                Share a focused ask or offer that another member can act on.
              </p>
              <Link href="/opportunities">Create a post</Link>
            </div>
          )}
        </section>
      ) : null}
      {orders.length ? (
        <OrderHistory
          orders={orders}
          refundOrderIds={(refunds ?? []).map((refund) => refund.order_id)}
        />
      ) : null}
          </div>
        </details>
      ) : null}
    </main>
  );
}
