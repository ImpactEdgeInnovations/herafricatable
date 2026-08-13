import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
import { EventQuestions, type EventQuestion } from "@/components/events/event-questions";
import {
  DestinationInvitationPanel,
  type DestinationInvitation,
} from "@/components/member/destination-invitation-panel";

export const dynamic = "force-dynamic";

type EventDetail = {
  audience: "community" | "public";
  ends_at: string;
  format: string;
  id: string;
  registration_mode: string;
  starts_at: string;
  summary: string | null;
  timezone: string;
  title: string;
  venues: { address_line: string | null; city: string; country: string; map_url: string | null; name: string } | null;
};

export default async function EventDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, summary, format, audience, starts_at, ends_at, timezone, registration_mode, venues(name, city, country, address_line, map_url)")
    .eq("slug", slug)
    .in("status", ["published", "completed"])
    .maybeSingle();
  if (!data) notFound();
  const event = data as unknown as EventDetail;
  const { data: posterRows } = await supabase.rpc("list_public_event_proposal_posters", { p_event_ids: [event.id] });
  const poster = ((posterRows as { alt_text: string; storage_path: string }[] | null) ?? [])[0] ?? null;
  const posterSigned = poster
    ? await supabase.storage.from("proposal-media").createSignedUrl(poster.storage_path, 3600)
    : { data: null };
  const { data: communityLink } = await supabase
    .from("community_event_links")
    .select("community_id, communities(name,slug,tagline,community_type)")
    .eq("event_id", event.id)
    .order("is_featured", { ascending: false })
    .limit(1)
    .maybeSingle();
  const eventCommunity = communityLink?.communities as unknown as
    | { community_type: string; name: string; slug: string; tagline: string | null }
    | null;

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
  const { data: memberProfile } = user ? await supabase.from("profiles").select("access_status").eq("id", user.id).maybeSingle() : { data: null };
  const activeMember = Boolean(user && memberProfile?.access_status === "active");
  const { data: communityMembership } = activeMember && communityLink?.community_id
    ? await supabase.from("community_memberships").select("status").eq("community_id", communityLink.community_id).eq("user_id", user!.id).maybeSingle()
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
  const { data: ownMembership } = user && memberProfile?.access_status === "active"
    ? await supabase.from("event_memberships").select("status").eq("event_id", event.id).eq("user_id", user.id).maybeSingle()
    : { data: null };
  const [{ data: tickets }, { data: registration }] = !hasEnded
    ? await Promise.all([
        supabase.from("ticket_types").select("id,name,description,price_minor,currency,inventory_quantity").eq("event_id", event.id).eq("status", "on_sale").order("sort_order"),
        user
          ? supabase.from("registration_requests").select("status").eq("event_id", event.id).eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
    : [{ data: [] }, { data: null }];
  const isConfirmedGuest = ["confirmed", "attended"].includes(ownMembership?.status ?? "");
  const [{ data: attendeePreference }, attendeeDirectoryResult, followUpResult] = isConfirmedGuest
    ? await Promise.all([
        supabase.from("event_attendee_preferences").select("discoverable, show_company, introduction").eq("event_id", event.id).eq("user_id", user!.id).maybeSingle(),
        supabase.rpc("list_event_attendee_directory", { p_event_id: event.id, p_limit: 30, p_offset: 0 }),
        supabase.rpc("get_my_event_follow_up_interest", { p_event_id: event.id }),
      ])
    : [{ data: null }, { data: [] }, { data: [] }];
  const followUp = ((followUpResult.data as { available: boolean; interested: boolean }[] | null) ?? [])[0] ?? null;
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
  const cta = gatheringRoomHref
    ? hasEnded ? "View gathering recap" : "Open gathering room"
    : hasEnded ? "Event completed" : event.registration_mode === "waitlist" ? "Join the waitlist" : event.registration_mode === "closed" ? "Registration closed" : event.registration_mode === "manual_review" ? "Request a seat" : "Register";

  return (
    <main className="event-detail-page">
      <header className="legal-header">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Meet. Connect. Rise.</small></span></Link>
        <Link href={eventCommunity ? `/communities/${eventCommunity.slug}?view=people` : "/events"}>{eventCommunity ? `Back to ${eventCommunity.name}` : "All events"}</Link>
      </header>
      <section className="event-detail-hero">
        <div><p className="eyebrow">{event.audience === "community" ? "Private Community gathering" : event.format.replace("_", " ")} · {event.venues?.city ?? "Online"}</p><h1>{event.title}</h1><p>{event.summary || "A carefully curated Her Africa Table gathering."}</p>{eventCommunity ? <span className="event-community-badge">{event.audience === "community" ? `For active members of ${eventCommunity.name}` : `Hosted with ${eventCommunity.name}`}</span> : null}</div>
        {posterSigned.data?.signedUrl ? <figure className="event-detail-poster"><img alt={poster.alt_text} src={posterSigned.data.signedUrl} /></figure> : null}
        <aside>
          <dl><div><dt>Date</dt><dd>{new Intl.DateTimeFormat("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(event.starts_at))}</dd></div><div><dt>Time</dt><dd>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.starts_at))} – {new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(event.ends_at))}</dd></div><div><dt>Venue</dt><dd>{event.venues ? `${event.venues.name}, ${event.venues.city}` : "Online access for confirmed attendees"}</dd></div></dl>
          {gatheringRoomHref ? <Link className="button button-primary" href={gatheringRoomHref}>{cta}</Link> : hasEnded || event.registration_mode === "closed" ? <span className="button button-outline" aria-disabled="true">{cta}</span> : <a className="button button-primary" href="#registration">{cta}</a>}
        </aside>
      </section>

      {eventCommunity ? (
        <section className="event-community-companion">
          <div>
            <p className="eyebrow">The people around this event</p>
            <h2>{eventCommunity.name}</h2>
            <p>{eventCommunity.tagline || "Meet members, see event updates and continue the conversation together."}</p>
          </div>
          <aside>
            <span>{eventCommunity.community_type === "private" ? "Host approval required" : "Open Community"}</span>
            <p>{event.audience === "community" ? "This gathering is for active members of the Community." : "This is an open event connected to the Community. Joining either one is always your choice."}</p>
            <Link className="button button-outline" href={`/communities/${eventCommunity.slug}/about`}>
              Meet the Community
            </Link>
          </aside>
        </section>
      ) : null}

      {!hasEnded && canInviteToEvent ? (
        <DestinationInvitationPanel
          destinationId={event.id}
          destinationName={event.title}
          destinationType="event"
          invitations={
            (eventInvitationResult.data as DestinationInvitation[] | null) ?? []
          }
          ready={!eventInvitationResult.error}
        />
      ) : null}

      {!hasEnded && !gatheringRoomHref && event.registration_mode !== "closed" ? (
        <section className="event-inline-registration" id="registration">
          {user && memberProfile?.access_status === "active" ? (
            <EventRegistrationForm
              embedded
              eventId={event.id}
              eventSlug={slug}
              eventTitle={event.title}
              existingStatus={registration?.status ?? ownMembership?.status ?? null}
              mode={event.registration_mode}
              passReady={["confirmed", "attended"].includes(ownMembership?.status ?? "")}
              tickets={tickets ?? []}
            />
          ) : (
            <div className="event-registration-entry">
              <p className="eyebrow">Your place at the table</p>
              <h2>{user ? "Finish your membership first." : "Sign in to join this event."}</h2>
              <p>{user ? "Event registration opens after your Her Africa Table membership is active." : "Use your approved email and one-time code. You will return directly to this page."}</p>
              <Link
                className="button button-primary"
                href={user ? "/home" : `/sign-in?next=${encodeURIComponent(`/events/${slug}#registration`)}`}
              >
                {user ? "View membership status" : "Sign in and continue"}
              </Link>
            </div>
          )}
          {event.registration_mode === "automatic" ? (
            <p className="event-payment-boundary">Ticket choice stays here. Secure card payment opens in Paystack and returns you to Her Africa Table after verification.</p>
          ) : null}
        </section>
      ) : null}

      {announcements?.length ? <section className="event-content-section"><div><p className="eyebrow">Latest information</p><h2>Announcements</h2></div><div className="announcement-list">{announcements.map((item) => <article key={item.id}><span>{item.published_at ? new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" }).format(new Date(item.published_at)) : "Update"}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></article>)}</div></section> : null}

      <EventQuestions
        canAsk={activeMember && !hasEnded}
        currentUserId={user?.id ?? null}
        eventId={event.id}
        eventSlug={slug}
        gatheringHref={useCommunityGathering && eventCommunity ? `/communities/${eventCommunity.slug}/gatherings/${slug}#questions` : null}
        initialQuestions={(eventQuestionResult.data as EventQuestion[] | null) ?? []}
        migrationReady={useCommunityGathering || !eventQuestionResult.error}
      />

      <section className="event-content-section"><div><p className="eyebrow">The gathering</p><h2>Programme</h2></div>{sessions?.length ? <div className="programme-list">{sessions.map((session) => { const speakers = speakersFor(session.id); return <article key={session.id}><time>{new Intl.DateTimeFormat("en-KE", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).format(new Date(session.starts_at))}</time><div><h3>{session.title}</h3>{speakers.map((speaker) => <p className="programme-speaker" key={`${session.id}-${speaker.name}`}><strong>{speaker.name}</strong>{[speaker.job_title, speaker.company].filter(Boolean).join(" · ") ? ` · ${[speaker.job_title, speaker.company].filter(Boolean).join(" · ")}` : ""}</p>)}<p>{session.description}</p>{session.room ? <span>{session.room}</span> : null}</div></article>; })}</div> : <div className="events-empty"><strong>Programme arriving soon.</strong><p>Confirmed attendees will receive programme updates as they are published.</p></div>}</section>

      {hasEnded && recap ? <section className="event-public-recap"><div><p className="eyebrow">From the Host</p><h2>{recap.title}</h2><p>{recap.summary}</p>{recap.highlights?.length ? <ul>{recap.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul> : null}</div>{continuation ? <aside><span>The conversation continues</span><strong>{continuation.name}</strong><p>Join the approved Community for future gatherings and ongoing conversation.</p><Link className="button button-primary" href={`/communities/${continuation.slug}`}>View Community</Link></aside> : null}</section> : null}

      {hasEnded && testimonials.length ? <section className="event-public-reflections"><header><p className="eyebrow">Shared with permission</p><h2>What guests carried forward.</h2></header><div>{testimonials.map((item) => <blockquote key={`${item.attribution}-${item.quote}`}><p>“{item.quote}”</p><cite>— {item.attribution}</cite></blockquote>)}</div></section> : null}

      {menu ? <section className="event-menu-section"><header><p className="eyebrow">A culinary journey</p><h2>{menu.title}</h2><p>{menu.introduction}</p></header><div className="public-menu-courses">{menuCourses?.map((course) => { const dishes = menuItems?.filter((item) => item.course_id === course.id) ?? []; return dishes.length ? <article className="public-menu-course" key={course.id}><div><span>{String(course.sort_order + 1).padStart(2, "0")}</span><h3>{course.name}</h3><p>{course.description}</p></div><div>{dishes.map((dish) => { const feedback = ownFeedback?.find((entry) => entry.item_id === dish.id); return <section key={dish.id}><div className="dish-heading"><h4>{dish.name}</h4>{dish.cultural_origin ? <span>{dish.cultural_origin}</span> : null}</div><p>{dish.description}</p>{dish.cultural_story ? <blockquote>{dish.cultural_story}</blockquote> : null}{dish.ingredients?.length ? <p className="dish-meta"><strong>Ingredients</strong>{dish.ingredients.join(" · ")}</p> : null}{dish.dietary_tags?.length ? <div className="dish-tags">{dish.dietary_tags.map((tag: string) => <span key={tag}>{tag}</span>)}</div> : null}{dish.allergen_notes ? <p className="allergen-note"><strong>Allergen note:</strong> {dish.allergen_notes}</p> : null}{memberProfile?.access_status === "active" ? <MenuFeedbackControls itemId={dish.id} initialRating={feedback?.rating ?? null} initialFavorite={feedback?.is_favorite ?? false} initialComment={feedback?.comment ?? null} /> : null}</section>; })}</div></article> : null; })}</div>{menu.embassy_note ? <aside className="embassy-note"><span>From the table</span><p>{menu.embassy_note}</p></aside> : null}</section> : null}

      {galleryAlbums?.length && galleryAssets.some((asset) => asset.signed_url) ? <section className="event-gallery-section"><header><p className="eyebrow">In the room</p><h2>Moments from the table.</h2></header>{galleryAlbums.map((album) => { const albumAssets = galleryAssets.filter((asset) => asset.album_id === album.id && asset.signed_url); return albumAssets.length ? <article className="public-gallery-album" key={album.id}><div><h3>{album.title}</h3><p>{album.introduction}</p></div><div className="public-gallery-grid">{albumAssets.map((asset) => <figure className={asset.is_featured ? "featured" : ""} key={asset.id}><img src={asset.signed_url!} alt={asset.alt_text} width={asset.width ?? undefined} height={asset.height ?? undefined} loading="lazy" /><figcaption><span>{asset.caption}</span>{asset.credit ? <small>Photo: {asset.credit}</small> : null}</figcaption></figure>)}</div></article> : null; })}</section> : null}

      {sponsors?.length ? <section className="event-content-section sponsor-section"><div><p className="eyebrow">With thanks</p><h2>Event partners</h2></div><div>{sponsors.map((sponsor) => <article key={sponsor.id}><span>{sponsor.tier || "Partner"}</span><strong>{sponsor.name}</strong></article>)}</div></section> : null}
      {isConfirmedGuest ? (
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
    </main>
  );
}
