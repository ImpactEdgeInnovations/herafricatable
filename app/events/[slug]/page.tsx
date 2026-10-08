import Link from "next/link";
import type { Metadata } from "next";
import { absoluteUrl, publicPageMetadata, serializeJsonLd } from "@/lib/seo";
import { getPublicEventSeo } from "@/lib/public-event-seo";
import { brandAccent } from "@/lib/brand-themes";
import { EventCommunityJoin } from "@/components/events/event-community-join";
import type { PublicEventHost } from "@/components/events/event-host-public-details";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MenuFeedbackControls } from "@/components/events/menu-feedback-controls";
import {
  EventAttendeeDirectory,
  type EventAttendee,
  type EventAttendeePreference,
} from "@/components/events/event-attendee-directory";
import { EventCommunityFollowUp } from "@/components/events/event-community-follow-up";
import {
  MemberEventArchive,
  type EventMediaSubmission,
  type LedCommunity,
  type MemberEventArchiveAccess,
} from "@/components/events/member-event-archive";
import { EventRegistrationForm } from "@/components/events/event-registration-form";
import { EventMobileAction } from "@/components/events/event-mobile-action";
import { loadEventBookingAvailability } from "@/lib/events/server-booking-availability";
import { EventQuestions, type EventQuestion } from "@/components/events/event-questions";
import {
  DestinationInvitationPanel,
  type DestinationInvitation,
} from "@/components/member/destination-invitation-panel";
import { FloatingTableGuide } from "@/components/member/floating-table-guide";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const event = (await getPublicEventSeo(slug))[0];
  if (!event) return { title: "Gathering", robots: { index: false, follow: false } };
  const description = (event.summary || `Explore ${event.title}, a Her Africa Table gathering for meaningful conversations and connections.`).slice(0, 160);
  return publicPageMetadata(event.title, description, `/events/${encodeURIComponent(event.slug)}`);
}

type EventDetail = {
  appearance_accent_key?: string;
  audience: "community" | "public";
  capacity: number | null;
  ends_at: string;
  format: string;
  id: string;
  registration_mode: string;
  free_instant_booking: boolean;
  starts_at: string;
  summary: string | null;
  timezone: string;
  title: string;
  venues: { address_line: string | null; city: string; country: string; map_url: string | null; name: string } | null;
};

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error: eventLoadError } = await supabase
    .from("events")
    .select("id, title, summary, format, audience, capacity, starts_at, ends_at, timezone, registration_mode, free_instant_booking, appearance_accent_key, venues(name, city, country, address_line, map_url)")
    .eq("slug", slug)
    .in("status", ["published", "completed"])
    .maybeSingle();
  if (eventLoadError) {
    return <main className="portal-page"><section className="portal-card"><p className="eyebrow">Please try again</p><h1>We could not open this event.</h1><p>The event may still be available. Please reload in a moment; your bookings have not changed.</p><div className="portal-actions"><Link className="button button-primary" href={`/events/${slug}`}>Try again</Link><Link className="button button-outline" href="/events">All events</Link></div></section></main>;
  }
  if (!data) notFound();
  const event = data as unknown as EventDetail;
  const publiclyIndexable = event.audience === "public" && Boolean((await getPublicEventSeo(slug))[0]);
  const { data: posterRows } = await supabase.rpc("list_public_event_proposal_posters", { p_event_ids: [event.id] });
  const poster = ((posterRows as { alt_text: string; storage_path: string }[] | null) ?? [])[0] ?? null;
  const posterSigned = poster
    ? await supabase.storage.from("proposal-media").createSignedUrl(poster.storage_path, 3600)
    : { data: null };
  const { data: coverRows } = await supabase.rpc("list_public_event_host_covers", { p_event_ids: [event.id] });
  const cover = ((coverRows as { alt_text: string; storage_path: string }[] | null) ?? [])[0] ?? null;
  const coverSigned = cover
    ? await supabase.storage.from("event-host-covers").createSignedUrl(cover.storage_path, 3600)
    : { data: null };
  const eventImage = coverSigned.data?.signedUrl
    ? { url: coverSigned.data.signedUrl, alt: cover!.alt_text }
    : posterSigned.data?.signedUrl && poster
      ? { url: posterSigned.data.signedUrl, alt: poster.alt_text }
      : null;
  const { data: communityRows, error: communityLookupError } = await supabase.rpc("get_event_community_for_visitor", {
    p_event_id: event.id,
  });
  const { data: previousCommunityLink } = communityLookupError
    ? await supabase.from("community_event_links")
        .select("community_id, communities(name,slug,tagline,community_type)")
        .eq("event_id", event.id).order("is_featured", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const eventCommunity = ((communityRows as { community_id: string; community_type: string; name: string; slug: string; tagline: string | null }[] | null) ?? [])[0]
    ?? (previousCommunityLink?.communities ? {
      community_id: previousCommunityLink.community_id,
      ...(previousCommunityLink.communities as unknown as { community_type: string; name: string; slug: string; tagline: string | null }),
    } : null);

  const [{ data: announcements }, { data: sessions }, { data: sponsors }] = await Promise.all([
    supabase.from("event_announcements").select("id, title, body, published_at").eq("event_id", event.id).eq("status", "published").order("published_at", { ascending: false }),
    supabase.from("programme_sessions").select("id, title, description, starts_at, ends_at, room").eq("event_id", event.id).eq("status", "published").order("starts_at", { ascending: true }),
    supabase.from("event_sponsors").select("id, name, tier, website_url, logo_url").eq("event_id", event.id).eq("is_published", true).order("sort_order", { ascending: true }),
  ]);
  const sessionIds = sessions?.map((session) => session.id) ?? [];
  const { data: speakerLinks } = sessionIds.length
    ? await supabase.from("session_speakers").select("session_id, event_speakers(name, job_title, company)").in("session_id", sessionIds).order("sort_order", { ascending: true })
    : { data: [] };

  function speakersFor(sessionId: string) {
    return ((speakerLinks as unknown as { session_id: string; event_speakers: { company: string | null; job_title: string | null; name: string } | null }[] | null) ?? [])
      .filter((link) => link.session_id === sessionId)
      .map((link) => link.event_speakers)
      .filter((speaker): speaker is { company: string | null; job_title: string | null; name: string } => Boolean(speaker));
  }
  const { data: menu } = await supabase.from("event_menus").select("id, title, introduction, embassy_note").eq("event_id", event.id).eq("status", "published").maybeSingle();
  const { data: menuCourses } = menu
    ? await supabase.from("menu_courses").select("id, name, description, sort_order").eq("menu_id", menu.id).order("sort_order", { ascending: true })
    : { data: [] };
  const menuCourseIds = menuCourses?.map((course) => course.id) ?? [];
  const { data: menuItems } = menuCourseIds.length
    ? await supabase.from("menu_items").select("id, course_id, name, description, cultural_origin, cultural_story, ingredients, dietary_tags, allergen_notes, sort_order").in("course_id", menuCourseIds).eq("status", "published").order("sort_order", { ascending: true })
    : { data: [] };
  const { data: { user } } = await supabase.auth.getUser();
  const { data: memberProfile } = user ? await supabase.from("profiles").select("access_status,display_name").eq("id", user.id).maybeSingle() : { data: null };
  const activeMember = Boolean(user && memberProfile?.access_status === "active");
  const { data: intakeMode } = activeMember ? await supabase.rpc("get_membership_intake_mode") : { data: null };
  const { data: linkedJoining } = eventCommunity ? await supabase.from("communities").select("join_policy").eq("id", eventCommunity.community_id).maybeSingle() : { data: null };
  const { data: guideAccessRows } = activeMember
    ? await supabase.rpc("get_my_table_guide_access")
    : { data: null };
  const guideAccess = (guideAccessRows as {
    assistant_enabled: boolean;
    feature_enabled: boolean;
    remaining_today: number;
  }[] | null)?.[0] ?? null;
  const { data: eventGuestFlag } = event.audience === "public" && !activeMember
    ? await (user ? supabase : createAdminClient()).from("feature_flags")
        .select("enabled").eq("key", "event_guest_access").maybeSingle()
    : { data: null };
  const eventGuestEligible = Boolean(
    user && event.audience === "public" && eventGuestFlag?.enabled &&
    memberProfile?.access_status === "pending",
  );
  const { data: communityMembership } = activeMember && eventCommunity?.community_id
    ? await supabase.from("community_memberships").select("status").eq("community_id", eventCommunity.community_id).eq("user_id", user!.id).maybeSingle()
    : { data: null };
  const [eventManagerResult, eventProposerResult] = user
    ? await Promise.all([
        supabase.rpc("can_manage_event", { check_event_id: event.id }),
        supabase
          .from("member_event_proposals")
          .select("id")
          .eq("event_id", event.id)
          .eq("proposed_by", user.id)
          .eq("status", "approved")
          .maybeSingle(),
      ])
    : [{ data: false, error: null }, { data: null, error: null }];
  const canInviteToEvent = Boolean(
    eventManagerResult.data || eventProposerResult.data,
  );
  const { data: canHostEvent } = user
    ? await supabase.rpc("can_host_event", { p_event_id: event.id })
    : { data: false };
  const { data: hostPublicRows } = await supabase.rpc("get_event_public_host", { p_event_id: event.id });
  const publicHost = ((hostPublicRows as PublicEventHost[] | null) ?? [])[0] ?? null;
  const eventInvitationResult = canInviteToEvent
    ? await supabase.rpc("list_my_table_invitations", {
        p_destination_id: event.id,
        p_destination_type: "event",
      })
    : { data: [], error: null };
  const hasEnded = new Date(event.ends_at).getTime() < Date.now();
  const useCommunityGathering = Boolean(eventCommunity && communityMembership?.status === "active");
  const eventQuestionResult = activeMember && !useCommunityGathering
    ? await supabase.rpc("list_event_questions", { p_event_id: event.id })
    : { data: [], error: null };
  const [recapResult, testimonialResult, continuationResult] = hasEnded
    ? await Promise.all([
        supabase.from("event_recaps").select("title,summary,highlights").eq("event_id", event.id).eq("status", "published").maybeSingle(),
        supabase.rpc("list_event_testimonials", { p_event_id: event.id }),
        supabase.from("event_community_continuations").select("communities(name,slug)").eq("event_id", event.id).maybeSingle(),
      ])
    : [{ data: null }, { data: [] }, { data: null }];
  const recap = recapResult.data as { highlights: string[]; summary: string; title: string } | null;
  const testimonials = (testimonialResult.data as { attribution: string; quote: string }[] | null) ?? [];
  const continuation = continuationResult.data?.communities as unknown as { name: string; slug: string } | null;
  const { data: ownMembership } = user
    ? await supabase.from("event_memberships").select("status").eq("event_id", event.id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const { data: ownOrder } = user
    ? await supabase.from("orders")
        .select("reference,status")
        .eq("event_id", event.id)
        .eq("user_id", user.id)
        .eq("order_type", "event")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const orderHref = ownOrder?.reference ? `/orders/${encodeURIComponent(ownOrder.reference)}` : null;
  const [{ data: tickets }, { data: registration }] = !hasEnded
    ? await Promise.all([
        supabase.from("ticket_types").select("id,name,description,price_minor,currency,inventory_quantity,sales_start_at,sales_end_at").eq("event_id", event.id).eq("status", "on_sale").order("sort_order"),
        user
          ? supabase.from("registration_requests").select("status").eq("event_id", event.id).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
    : [{ data: [] }, { data: null }];
  const { data: automaticCheckoutOpen } = event.registration_mode === "automatic"
    ? await supabase.rpc("event_automatic_checkout_open")
    : { data: false };
  const paymentPaused = event.registration_mode === "automatic" && automaticCheckoutOpen !== true;
  const availability = !hasEnded && !["waitlist", "closed"].includes(event.registration_mode)
    ? await loadEventBookingAvailability(event.id, event.capacity, tickets ?? [])
    : null;
  const isConfirmedGuest = ["confirmed", "attended"].includes(ownMembership?.status ?? "");
  const { data: guestFollowUpAccess } = hasEnded && isConfirmedGuest && !activeMember
    ? await supabase.rpc("can_leave_event_feedback", { p_event_id: event.id })
    : { data: false };
  const [{ data: attendeePreference }, attendeeDirectoryResult, followUpResult, introReadyResult, roundStatusResult] = isConfirmedGuest
    ? await Promise.all([
        activeMember
          ? supabase.from("event_attendee_preferences").select("discoverable, show_company, introduction").eq("event_id", event.id).eq("user_id", user!.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        activeMember
          ? supabase.rpc("list_event_attendee_directory", { p_event_id: event.id, p_limit: 30, p_offset: 0 })
          : Promise.resolve({ data: [], error: null }),
        supabase.rpc("get_my_event_follow_up_interest", { p_event_id: event.id }),
        supabase.rpc("get_my_event_intro_card", { p_event_id: event.id }),
        supabase.rpc("get_my_event_round_status", { p_event_id: event.id }),
      ])
    : [{ data: null }, { data: [] }, { data: [] }, { data: null, error: null }, { data: [] }];
  const followUp = ((followUpResult.data as { available: boolean; interested: boolean }[] | null) ?? [])[0] ?? null;
  const roundStatus = ((roundStatusResult.data as { enabled: boolean; opted_in: boolean }[] | null) ?? [])[0] ?? null;
  const archiveResult = user && memberProfile?.access_status === "active" && hasEnded
    ? await supabase.rpc("get_my_member_event_archive", { p_event_id: event.id })
    : { data: [], error: null };
  const archiveAccess = ((archiveResult.data as MemberEventArchiveAccess[] | null) ?? [])[0] ?? null;
  const [mediaSubmissionResult, ledCommunityResult] = archiveAccess?.available
    ? await Promise.all([
        supabase.rpc("list_my_event_media_submissions", { p_event_id: event.id }),
        archiveAccess.is_event_host ? supabase.rpc("list_communities") : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }];
  const mediaSubmissions = await Promise.all(
    (((mediaSubmissionResult.data as EventMediaSubmission[] | null) ?? [])).map(async (item) => {
      const signed = await supabase.storage.from("event-media").createSignedUrl(item.storage_path, 3600);
      return { ...item, image_url: signed.data?.signedUrl ?? null };
    }),
  );
  const ledCommunities = (((ledCommunityResult.data as ({ community_id: string; membership_role?: string; name: string; slug: string }[] | null)) ?? [])
    .filter((community) => ["owner", "host"].includes(community.membership_role ?? ""))
    .map(({ community_id, name, slug }) => ({ community_id, name, slug }))) as LedCommunity[];
  const menuItemIds = menuItems?.map((item) => item.id) ?? [];
  const { data: ownFeedback } = user && memberProfile?.access_status === "active" && menuItemIds.length
    ? await supabase.from("menu_item_feedback").select("item_id, rating, is_favorite, comment").eq("user_id", user.id).in("item_id", menuItemIds)
    : { data: [] };
  const { data: galleryAlbums } = await supabase.from("gallery_albums").select("id, title, introduction, sort_order").eq("event_id", event.id).eq("status", "published").order("sort_order", { ascending: true });
  const galleryAlbumIds = galleryAlbums?.map((album) => album.id) ?? [];
  const { data: galleryAssetRows } = galleryAlbumIds.length
    ? await supabase.from("media_assets").select("id, album_id, storage_path, alt_text, caption, credit, captured_at, is_featured, sort_order, width, height").in("album_id", galleryAlbumIds).eq("status", "published").order("sort_order", { ascending: true })
    : { data: [] };
  const galleryAssets = await Promise.all((galleryAssetRows ?? []).map(async (asset) => {
    let signed = await supabase.storage.from("event-media").createSignedUrl(asset.storage_path, 3600, { transform: { quality: 82, resize: "contain", width: 1600 } });
    if (signed.error) signed = await supabase.storage.from("event-media").createSignedUrl(asset.storage_path, 3600);
    return { ...asset, signed_url: signed.data?.signedUrl ?? null };
  }));

  const gatheringRoomHref = useCommunityGathering && eventCommunity
    ? `/communities/${eventCommunity.slug}/gatherings/${slug}`
    : null;
  const bookingClosed = paymentPaused || Boolean(availability &&
    !availability.tickets.some((ticket) => ticket.bookingState === "available"));
  const hasExistingGuestRequest = Boolean(
    user && memberProfile?.access_status === "pending" && registration,
  );
  const canRequestNewPlace = Boolean(
    (activeMember || eventGuestEligible) && event.registration_mode !== "closed",
  );
  const bookingClosedLabel = paymentPaused
    ? "Online payment paused"
    : availability?.checkFailed
    ? "Places unavailable"
    : availability?.eventFull
      ? "Fully booked"
      : availability?.tickets.some((ticket) => ticket.bookingState === "not_open")
        ? "Bookings open soon"
        : "Booking unavailable";
  const cta = gatheringRoomHref
    ? hasEnded ? "View gathering recap" : "Open gathering room"
    : hasEnded ? recap ? "Read event recap" : "Event completed" : isConfirmedGuest ? "Open my event pass"
      : registration?.status === "pending_payment" || registration?.status === "pending_review"
        ? "View my request"
      : registration?.status === "waitlisted" && event.registration_mode === "manual_review" && !bookingClosed
        ? "Request a place from the waiting list"
        : registration?.status === "waitlisted" ? "View my waiting-list status"
          : event.registration_mode === "waitlist" ? "Join the waiting list"
            : event.registration_mode === "closed" ? "Registration closed"
              : bookingClosed ? bookingClosedLabel
                : event.registration_mode === "manual_review" ? "Request a seat" : "Register";
  const lowestTicket = [...(tickets ?? [])].sort((first, second) => first.price_minor - second.price_minor)[0];
  const costLabel = hasEnded ? "Past event" : lowestTicket
    ? lowestTicket.price_minor === 0 ? "Free" : `From ${lowestTicket.currency} ${new Intl.NumberFormat("en-KE").format(lowestTicket.price_minor / 100)}`
    : "See booking details";
  const entryLabel = hasEnded ? "Completed" : event.audience === "community" ? "Community members"
    : activeMember ? "Member booking"
      : eventGuestFlag?.enabled ? "Guest booking available" : "Membership required";
  // Reuse the existing destination; this bar cannot book or bypass any eligibility check.
  const mobileActionHref = hasEnded ? null : gatheringRoomHref ?? (
    isConfirmedGuest ? `/events/${slug}/pass`
      : registration?.status === "waitlisted" ? "#registration"
        : event.registration_mode !== "closed" && !bookingClosed ? "#registration" : null
  );

  return (
    <main className="event-detail-page" data-brand-accent={brandAccent(event.appearance_accent_key)} data-mobile-action={Boolean(mobileActionHref)}>
      {publiclyIndexable ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Her Africa Table", item: absoluteUrl() },
          { "@type": "ListItem", position: 2, name: "Gatherings", item: absoluteUrl("/events") },
          { "@type": "ListItem", position: 3, name: event.title, item: absoluteUrl(`/events/${encodeURIComponent(slug)}`) },
        ],
      }) }} /> : null}
      <header className="legal-header">
        <Link className="brand" href={user ? "/home" : "/"} prefetch={false}><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>
        <Link href={eventCommunity ? `/communities/${eventCommunity.slug}?view=people` : "/events"}>{eventCommunity ? `Back to ${eventCommunity.name}` : "All events"}</Link>
      </header>
      <section className="event-detail-hero" aria-label="Event details">
        <div><p className="eyebrow">{event.audience === "community" ? "Community gathering" : event.format === "hybrid" ? "In person & online" : event.format === "online" ? "Online" : "In person"} · {event.venues?.city ?? "Online"}</p><h1>{event.title}</h1><p>{event.summary || "See when, where and how to join below."}</p>{eventCommunity && event.audience === "community" ? <span className="event-community-badge">For active members of {eventCommunity.name}</span> : null}</div>
        {eventImage ? <figure className="event-detail-poster"><img alt={eventImage.alt} src={eventImage.url} fetchPriority="high" /></figure> : null}
        <aside>
          <dl><div><dt>Date</dt><dd>{new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: event.timezone }).format(new Date(event.starts_at))}</dd></div><div><dt>Time</dt><dd>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))} – {new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.ends_at))}</dd></div><div><dt>Venue</dt><dd>{event.venues ? `${event.venues.name}, ${event.venues.city}` : "Online access for confirmed attendees"}</dd></div><div><dt>Cost</dt><dd>{costLabel}</dd></div><div><dt>Entry</dt><dd>{entryLabel}</dd></div></dl>
          <div id="event-primary-action">{gatheringRoomHref ? <Link className="button button-primary" href={gatheringRoomHref}>{cta}</Link> : hasEnded && recap ? <a className="button button-primary" href="#event-recap">{cta}</a> : !hasEnded && isConfirmedGuest ? <Link className="button button-primary" href={`/events/${slug}/pass`}>{cta}</Link> : !hasEnded && registration?.status === "waitlisted" ? <a className="button button-primary" href="#registration">{cta}</a> : hasEnded || event.registration_mode === "closed" || bookingClosed ? <span className="button button-outline" aria-disabled="true">{cta}</span> : <a className="button button-primary" href="#registration">{cta}</a>}</div>
          {gatheringRoomHref && isConfirmedGuest && !hasEnded ? <Link className="event-pass-inline-link" href={`/events/${slug}/pass`}>Open my entry pass</Link> : null}
        </aside>
      </section>

      {publicHost ? <section className="event-public-host" aria-label="Event Host"><div className="event-public-host-identity"><span className="event-public-host-monogram" aria-hidden="true">{publicHost.display_name.trim().slice(0,1)}</span><div><small>Hosted by</small><h2>{publicHost.display_name}</h2>{publicHost.introduction ? <p>{publicHost.introduction}</p> : null}</div></div><div className="event-public-host-links">{publicHost.website_url ? <a href={publicHost.website_url} target="_blank" rel="noopener noreferrer nofollow">Website ↗</a> : null}{publicHost.linkedin_url ? <a href={publicHost.linkedin_url} target="_blank" rel="noopener noreferrer nofollow">LinkedIn ↗</a> : null}{publicHost.instagram_url ? <a href={publicHost.instagram_url} target="_blank" rel="noopener noreferrer nofollow">Instagram ↗</a> : null}{publicHost.contact_email ? <a href={`mailto:${encodeURIComponent(publicHost.contact_email)}`}>Email Host</a> : null}{publicHost.contact_phone ? <a href={`tel:${publicHost.contact_phone.replace(/[^\d+]/g,"")}`}>Call Host</a> : null}</div></section> : null}

      <nav className="event-detail-jump-links" aria-label="On this event page">
        {!hasEnded && !gatheringRoomHref && (event.registration_mode !== "closed" || Boolean(registration) || isConfirmedGuest) ? <a href="#registration">Places</a> : null}
        {gatheringRoomHref ? <Link href={`${gatheringRoomHref}#questions`}>Conversation</Link> : <a href="#questions">Questions</a>}
        {eventCommunity ? <a href="#event-community">Community</a> : null}
        {sessions?.length ? <a href="#event-programme">Programme</a> : null}
        {hasEnded && recap ? <a href="#event-recap">Recap</a> : null}
      </nav>

      {!hasEnded && canHostEvent === true ? <div className="event-host-shortcut"><span>{eventImage ? "Your event tools" : poster || cover ? "Your poster could not load. Check it in your Host tools." : "No poster added yet."}</span><div><Link href={`/events/${slug}/host#host-image`}>{eventImage ? "Manage poster" : "Add or check poster"}</Link><Link href={`/events/${slug}/host#host-host`}>{publicHost ? "Edit Host details" : "Add Host details"}</Link></div></div> : null}

      {!hasEnded && canInviteToEvent ? (
        <details className="event-inline-invitations"><summary>Invite people</summary>
        <DestinationInvitationPanel
          currentUserId={user!.id}
          destinationId={event.id}
          destinationName={event.title}
          destinationType="event"
          invitations={
            (eventInvitationResult.data as DestinationInvitation[] | null) ?? []
          }
          ready={!eventInvitationResult.error}
        />
        </details>
      ) : null}

      {!hasEnded && !gatheringRoomHref && (event.registration_mode !== "closed" || Boolean(registration) || isConfirmedGuest) ? (
        <section className="event-inline-registration" id="registration">
          {bookingClosed && !registration && !isConfirmedGuest ? (
            <div className="event-registration-entry">
              <p className="eyebrow">Your place at the table</p>
              <h2>{bookingClosedLabel}</h2>
              <p>{paymentPaused
                ? "No card charge can begin right now. The event team will update this page when online payment opens."
                : availability?.checkFailed
                ? "We could not check places right now. Refresh this page to try again."
                : availability?.eventFull
                  ? "All places are currently requested. Please check back for cancellations."
                  : "No places can be requested right now. Please check back later."}</p>
              {availability?.checkFailed ? <a className="button button-outline" href={`/events/${slug}`}>Check again</a> : null}
            </div>
          ) : activeMember || eventGuestEligible || isConfirmedGuest || hasExistingGuestRequest ? (
            <>
              <EventRegistrationForm
                embedded
                eventId={event.id}
                eventSlug={slug}
                orderHref={orderHref}
                eventTitle={event.title}
                existingStatus={registration?.status ?? ownMembership?.status ?? null}
                mode={event.registration_mode}
                freeInstantBooking={event.free_instant_booking && activeMember && intakeMode === "trusted_auto"}
                passReady={["confirmed", "attended"].includes(ownMembership?.status ?? "")}
                tickets={availability?.tickets ?? []}
                availabilityReady={!availability?.checkFailed}
                automaticCheckoutOpen={!paymentPaused}
                allowNewRequest={canRequestNewPlace}
                eventFull={availability?.eventFull ?? false}
              />
              {eventGuestEligible ? (
                <p className="event-payment-boundary">Your place gives you access to this event. Joining the member network is a separate, reviewed request.</p>
              ) : null}
            </>
          ) : (
            <div className="event-registration-entry">
              <p className="eyebrow">Your place at the table</p>
              <h2>{user ? "Your account cannot request a place yet." : event.audience === "public" && !eventGuestFlag?.enabled ? "Membership is needed for this event." : "Confirm your email to join this event."}</h2>
              <p>{user ? "Finish joining Her Africa Table, then return here to book your place. Your membership page shows your next step." : event.audience === "public" && !eventGuestFlag?.enabled ? "Confirm your email and complete the short joining steps. We will return you here when your membership is ready." : "We’ll email you a one-time code and return you to this event."}</p>
              <Link
                className="button button-primary"
                href={user ? "/apply" : `/sign-in?${event.audience === "public" && !eventGuestFlag?.enabled ? "mode=apply&" : ""}next=${encodeURIComponent(`/events/${slug}#registration`)}`}
              >
                {user ? "View membership request" : event.audience === "public" && !eventGuestFlag?.enabled ? "Request membership" : "Email me a code"}
              </Link>
            </div>
          )}
          {event.registration_mode === "automatic" ? (
            <p className="event-payment-boundary">Ticket choice stays here. Secure card payment opens in Paystack and returns you to Her Africa Table after verification.</p>
          ) : null}
        </section>
      ) : null}

      {eventCommunity ? (
        <section className="event-community-companion" id="event-community">
          <div>
            <p className="eyebrow">Related Community</p>
            <h2>{eventCommunity.name}</h2>
            {eventCommunity.tagline && eventCommunity.tagline.trim().toLowerCase() !== eventCommunity.name.trim().toLowerCase() ? <p>{eventCommunity.tagline}</p> : <p>Meet the members and keep in touch here.</p>}
          </div>
          <aside>
            <span>{linkedJoining?.join_policy === "open" ? "Members can join immediately" : linkedJoining?.join_policy === "invite_only" ? "Invitation only" : linkedJoining?.join_policy === "approval" ? "The Host approves joining requests" : "Community membership"}</span>
            <p>{event.audience === "community" ? "This gathering is for active members of the Community." : "This is an open event connected to the Community. Joining either one is always your choice."}</p>
            <EventCommunityJoin communityId={eventCommunity.community_id} slug={eventCommunity.slug} activeMember={activeMember} signedIn={Boolean(user)} initialStatus={communityMembership?.status ?? null} joinPolicy={linkedJoining?.join_policy ?? null} />
          </aside>
        </section>
      ) : null}

      {announcements?.length ? <section className="event-content-section"><div><p className="eyebrow">Latest information</p><h2>Announcements</h2></div><div className="announcement-list">{announcements.map((item) => <article key={item.id}><span>{item.published_at ? new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short", timeZone: event.timezone }).format(new Date(item.published_at)) : "Update"}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></article>)}</div></section> : null}

      {!useCommunityGathering ? <EventQuestions
        canAsk={activeMember && !hasEnded}
        currentUserId={user?.id ?? null}
        eventId={event.id}
        eventSlug={slug}
        gatheringHref={useCommunityGathering && eventCommunity ? `/communities/${eventCommunity.slug}/gatherings/${slug}#questions` : null}
        initialQuestions={(eventQuestionResult.data as EventQuestion[] | null) ?? []}
        migrationReady={useCommunityGathering || !eventQuestionResult.error}
      /> : null}

      {sessions?.length ? <section className="event-content-section" id="event-programme"><div><p className="eyebrow">The gathering</p><h2>Programme</h2></div><div className="programme-list">{sessions.map((session) => { const speakers = speakersFor(session.id); return <article key={session.id}><time>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(session.starts_at))}</time><div><h3>{session.title}</h3>{speakers.map((speaker) => <p className="programme-speaker" key={`${session.id}-${speaker.name}`}><strong>{speaker.name}</strong>{[speaker.job_title, speaker.company].filter(Boolean).join(" · ") ? ` · ${[speaker.job_title, speaker.company].filter(Boolean).join(" · ")}` : ""}</p>)}<p>{session.description}</p>{session.room ? <span>{session.room}</span> : null}</div></article>; })}</div></section> : null}

      {hasEnded && recap ? <section className="event-public-recap" id="event-recap"><div><p className="eyebrow">From the Host</p><h2>{recap.title}</h2><p>{recap.summary}</p>{recap.highlights?.length ? <ul>{recap.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}</div>{continuation ? <aside><span>The conversation continues</span><strong>{continuation.name}</strong><p>Join the approved Community for future gatherings and ongoing conversation.</p><Link className="button button-primary" href={`/communities/${continuation.slug}`}>View Community</Link></aside> : null}</section> : null}
      {hasEnded && isConfirmedGuest && (activeMember || guestFollowUpAccess) ? <section className="event-intro-entry"><div><p className="eyebrow">For guests who attended</p><h2>Continue after the table</h2><p>Read the approved recap, share private feedback and choose whether to hear about the next gathering. An event place does not approve network membership.</p></div><Link className="button button-outline" href={`/events/${slug}/follow-up`}>Open my follow-up</Link></section> : null}

      {hasEnded && testimonials.length ? <section className="event-public-reflections"><header><p className="eyebrow">Shared with permission</p><h2>What guests carried forward.</h2></header><div>{testimonials.map((item) => <blockquote key={`${item.attribution}-${item.quote}`}><p>“{item.quote}”</p><cite>— {item.attribution}</cite></blockquote>)}</div></section> : null}

      {menu ? <section className="event-menu-section"><header><p className="eyebrow">A culinary journey</p><h2>{menu.title}</h2><p>{menu.introduction}</p></header><div className="public-menu-courses">{menuCourses?.map((course) => { const dishes = menuItems?.filter((item) => item.course_id === course.id) ?? []; return dishes.length ? <article className="public-menu-course" key={course.id}><div><span>{String(course.sort_order + 1).padStart(2, "0")}</span><h3>{course.name}</h3><p>{course.description}</p></div><div>{dishes.map((dish) => { const feedback = ownFeedback?.find((entry) => entry.item_id === dish.id); return <section key={dish.id}><div className="dish-heading"><h4>{dish.name}</h4>{dish.cultural_origin ? <span>{dish.cultural_origin}</span> : null}</div><p>{dish.description}</p>{dish.cultural_story ? <blockquote>{dish.cultural_story}</blockquote> : null}{dish.ingredients?.length ? <p className="dish-meta"><strong>Ingredients</strong>{dish.ingredients.join(" · ")}</p> : null}{dish.dietary_tags?.length ? <div className="dish-tags">{dish.dietary_tags.map((tag: string) => <span key={tag}>{tag}</span>)}</div> : null}{dish.allergen_notes ? <p className="allergen-note"><strong>Allergen note:</strong> {dish.allergen_notes}</p> : null}{memberProfile?.access_status === "active" ? <MenuFeedbackControls itemId={dish.id} initialRating={feedback?.rating ?? null} initialFavorite={feedback?.is_favorite ?? false} initialComment={feedback?.comment ?? null} /> : null}</section>; })}</div></article> : null; })}</div>{menu.embassy_note ? <aside className="embassy-note"><span>From the table</span><p>{menu.embassy_note}</p></aside> : null}</section> : null}

      {galleryAlbums?.length && galleryAssets.some((asset) => asset.signed_url) ? <section className="event-gallery-section"><header><p className="eyebrow">In the room</p><h2>Moments from the table.</h2></header>{galleryAlbums.map((album) => { const albumAssets = galleryAssets.filter((asset) => asset.album_id === album.id && asset.signed_url); return albumAssets.length ? <article className="public-gallery-album" key={album.id}><div><h3>{album.title}</h3><p>{album.introduction}</p></div><div className="public-gallery-grid">{albumAssets.map((asset) => <figure className={asset.is_featured ? "featured" : ""} key={asset.id}><img src={asset.signed_url!} alt={asset.alt_text} width={asset.width ?? undefined} height={asset.height ?? undefined} loading="lazy" /><figcaption><span>{asset.caption}</span>{asset.credit ? <small>Photo: {asset.credit}</small> : null}</figcaption></figure>)}</div></article> : null; })}</section> : null}

      {sponsors?.length ? <section className="event-content-section sponsor-section"><div><p className="eyebrow">With thanks</p><h2>Event partners</h2></div><div>{sponsors.map((sponsor) => <article key={sponsor.id}><span>{sponsor.tier || "Partner"}</span><strong>{sponsor.name}</strong></article>)}</div></section> : null}
      {isConfirmedGuest && !introReadyResult.error ? <section className="event-intro-entry"><div><p className="eyebrow">For confirmed guests</p><h2>Meet someone at this event</h2><p>Share an optional introduction QR or enter another guest’s manual code. Your entry pass and private contact details stay separate.</p></div><Link className="button button-outline" href={`/events/${slug}/meet`}>Open introductions</Link></section> : null}
      {isConfirmedGuest && roundStatus?.enabled ? <section className="event-intro-entry"><div><p className="eyebrow">Optional table conversations</p><h2>A seat for better conversations</h2><p>Ask to join a small guided table round. Only opted-in guests appear in the Host’s plan, and the event team reviews each private schedule.</p></div><Link className="button button-outline" href={`/events/${slug}/rounds`}>{roundStatus.opted_in ? "View my table choice" : "Join a table round"}</Link></section> : null}
      {isConfirmedGuest && activeMember ? (
        <EventAttendeeDirectory
          attendees={(attendeeDirectoryResult.data as EventAttendee[] | null) ?? []}
          eventId={event.id}
          initialPreference={(attendeePreference as EventAttendeePreference | null) ?? null}
        />
      ) : null}
      {isConfirmedGuest && followUp?.available ? (
        <EventCommunityFollowUp
          eventId={event.id}
          initialInterested={followUp.interested}
        />
      ) : null}
      {archiveAccess?.available && user ? (
        <MemberEventArchive
          access={archiveAccess}
          communities={ledCommunities}
          eventId={event.id}
          eventTitle={event.title}
          media={mediaSubmissions}
          userId={user.id}
        />
      ) : null}
      {guideAccess?.feature_enabled ? (
        <FloatingTableGuide
          assistantEnabled={guideAccess.assistant_enabled}
          featureEnabled
          firstName={memberProfile?.display_name?.trim().split(/\s+/)[0] || "Member"}
          installed
          remainingToday={guideAccess.remaining_today}
        />
      ) : null}
      {mobileActionHref ? <EventMobileAction href={mobileActionHref} label={cta} detail={costLabel} /> : null}
    </main>
  );
}
