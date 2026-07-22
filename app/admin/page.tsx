import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventCountdownManager, type CountdownSettings } from "@/components/admin/event-countdown-manager";
import { MemberReview, type AdminMember } from "@/components/admin/member-review";
import { RoadmapOverview } from "@/components/admin/roadmap-overview";
import { EventManager, type AdminEvent } from "@/components/admin/event-manager";
import {
  EventContentManager,
  type AdminAnnouncement,
  type AdminSession,
  type AdminSponsor,
} from "@/components/admin/event-content-manager";
import {
  EventMenuManager,
  type AdminMenu,
  type AdminMenuCourse,
  type AdminMenuFeedback,
  type AdminMenuItem,
} from "@/components/admin/event-menu-manager";
import { EventGalleryManager, type AdminGalleryAlbum, type AdminMediaAsset } from "@/components/admin/event-gallery-manager";
import { RegistrationManager, type AdminPaymentAttempt, type AdminRefund, type AdminRegistration, type AdminTicket } from "@/components/admin/registration-manager";
import { ModerationQueue, type MemberReport } from "@/components/admin/moderation-queue";
import { EventCheckinConsole, type CheckinAttendee } from "@/components/admin/event-checkin-console";
import { MarketplaceModeration, type MarketplaceReport } from "@/components/admin/marketplace-moderation";
import { EventFeedbackManager, type AdminEventFeedback, type EventFeedbackSummary, type EventRecap } from "@/components/admin/event-feedback-manager";
import { CommunityManager, type CommunityMember } from "@/components/admin/community-manager";
import { CommunityModeration, type CommunityReport } from "@/components/admin/community-moderation";
import type { CommunitySummary } from "@/components/member/community-directory";
import { LearningManager, type AdminLesson, type CourseOrder } from "@/components/admin/learning-manager";
import type { CourseSummary } from "@/components/member/learning-catalog";

type ManagedEventRow = Omit<AdminEvent, "id" | "venues"> & {
  address_line: string | null;
  city: string | null;
  country: string | null;
  event_id: string;
  map_url: string | null;
  online_url: string | null;
  venue_name: string | null;
};

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/sign-in");

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["super_admin", "event_staff", "moderator"])
    .limit(1)
    .maybeSingle();

  if (!role) {
    return (
      <main className="portal-page"><section className="portal-card">
        <p className="eyebrow">Access restricted</p><h1>Admin role required.</h1>
        <p>Your identity was verified, but this account does not have an approved Her Africa Table team role. Choosing the Admin sign-in page never grants administrative access.</p>
        <div className="portal-actions"><Link className="button button-primary" href="/home">Continue as a member</Link><Link className="button button-outline" href="/">Return home</Link></div>
      </section></main>
    );
  }

  const canManageEvents = role.role === "super_admin" || role.role === "event_staff";
  const canModerate = role.role === "super_admin" || role.role === "moderator";
  const [{ data: countdown }, memberResult, eventResult] = await Promise.all([
    supabase.from("site_event_countdown").select("event_name, city, starts_at, is_published").eq("id", true).maybeSingle(),
    role.role === "super_admin" ? supabase.rpc("list_admin_members_v2") : Promise.resolve({ data: [], error: null }),
    canManageEvents ? supabase.rpc("list_managed_events") : Promise.resolve({ data: [], error: null }),
  ]);

  const members = (memberResult.data as AdminMember[] | null) ?? [];
  const managedRows = (eventResult.data as ManagedEventRow[] | null) ?? [];
  const events: AdminEvent[] = managedRows.map((event) => ({
    capacity: event.capacity,
    ends_at: event.ends_at,
    format: event.format,
    id: event.event_id,
    is_featured: event.is_featured,
    registration_mode: event.registration_mode,
    slug: event.slug,
    starts_at: event.starts_at,
    status: event.status,
    summary: event.summary,
    timezone: event.timezone,
    title: event.title,
    venues: event.venue_name && event.city && event.country ? {
      address_line: event.address_line,
      city: event.city,
      country: event.country,
      map_url: event.map_url,
      name: event.venue_name,
    } : null,
  }));
  const privateEvents = managedRows.map((event) => ({ event_id: event.event_id, online_url: event.online_url }));
  const canManageCountdown = role.role === "super_admin" || role.role === "event_staff";
  const reportResult=canModerate?await supabase.rpc("list_member_reports"):{data:[],error:null};
  const marketplaceReportResult=canModerate?await supabase.rpc("list_marketplace_reports"):{data:[],error:null};
  const communityResult=role.role==="super_admin"?await supabase.rpc("list_communities"):{data:[],error:null};
  const communities=(communityResult.data as CommunitySummary[]|null)??[];
  const communityMemberResults=role.role==="super_admin"?await Promise.all(communities.map(item=>supabase.rpc("list_community_members",{p_community_id:item.community_id}))):[];
  const communityMembers=communityMemberResults.flatMap((result,index)=>((result.data as Omit<CommunityMember,"community_id">[]|null)??[]).map(item=>({...item,community_id:communities[index].community_id})));
  const communityReportResult=canModerate?await supabase.rpc("list_community_reports"):{data:[],error:null};
  const featureFlagResult=role.role==="super_admin"?await supabase.from("feature_flags").select("enabled").eq("key","communities").maybeSingle():{data:null,error:null};
  const learningCourseResult=role.role==="super_admin"?await supabase.rpc("list_courses"):{data:[],error:null};
  const adminCourses=(learningCourseResult.data as CourseSummary[]|null)??[];
  const learningCourseIds=adminCourses.map(item=>item.course_id);
  const lessonResult=role.role==="super_admin"&&learningCourseIds.length?await supabase.from("course_lessons").select("id,course_id,title,summary,lesson_type,content,asset_path,external_url,duration_minutes,status,sort_order").in("course_id",learningCourseIds).order("sort_order"):{data:[],error:null};
  const courseOrderResult=role.role==="super_admin"?await supabase.rpc("list_course_orders"):{data:[],error:null};
  const learningFlagResult=role.role==="super_admin"?await supabase.from("feature_flags").select("enabled").eq("key","learning").maybeSingle():{data:null,error:null};
  const eventIds = events.map((event) => event.id);
  const [{ data: sessionData }, { data: announcementData }, { data: sponsorData }] = eventIds.length ? await Promise.all([
    supabase.from("programme_sessions").select("id, event_id, title, description, starts_at, ends_at, room, status").in("event_id", eventIds).order("starts_at", { ascending: true }),
    supabase.from("event_announcements").select("id, event_id, title, body, status, published_at").in("event_id", eventIds).order("updated_at", { ascending: false }),
    supabase.from("event_sponsors").select("id, event_id, name, tier, website_url, logo_url, is_published, sort_order").in("event_id", eventIds).order("sort_order", { ascending: true }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const sessions = (sessionData as AdminSession[] | null) ?? [];
  const sessionIds = sessions.map((session) => session.id);
  const { data: speakerLinks } = sessionIds.length
    ? await supabase.from("session_speakers").select("session_id, event_speakers(name, job_title, company)").in("session_id", sessionIds).order("sort_order", { ascending: true })
    : { data: [] };
  const menuResult = eventIds.length
    ? await supabase.from("event_menus").select("id, event_id, title, introduction, embassy_note, status").in("event_id", eventIds)
    : { data: [], error: null };
  const menus = (menuResult.data as AdminMenu[] | null) ?? [];
  const menuIds = menus.map((menu) => menu.id);
  const courseResult = menuIds.length
    ? await supabase.from("menu_courses").select("id, menu_id, name, description, sort_order").in("menu_id", menuIds).order("sort_order", { ascending: true })
    : { data: [], error: null };
  const courses = (courseResult.data as AdminMenuCourse[] | null) ?? [];
  const courseIds = courses.map((course) => course.id);
  const itemResult = courseIds.length
    ? await supabase.from("menu_items").select("id, course_id, name, description, cultural_origin, cultural_story, ingredients, dietary_tags, allergen_notes, status, sort_order").in("course_id", courseIds).order("sort_order", { ascending: true })
    : { data: [], error: null };
  const menuItems = (itemResult.data as AdminMenuItem[] | null) ?? [];
  const itemIds = menuItems.map((item) => item.id);
  const feedbackResult = itemIds.length
    ? await supabase.from("menu_item_feedback").select("item_id, user_id, rating, is_favorite, comment, moderation_status").in("item_id", itemIds).order("updated_at", { ascending: false })
    : { data: [], error: null };
  const albumResult = eventIds.length
    ? await supabase.from("gallery_albums").select("id, event_id, title, introduction, status, sort_order").in("event_id", eventIds).order("sort_order", { ascending: true })
    : { data: [], error: null };
  const albums = (albumResult.data as AdminGalleryAlbum[] | null) ?? [];
  const albumIds = albums.map((album) => album.id);
  const assetResult = albumIds.length
    ? await supabase.from("media_assets").select("id, album_id, storage_path, mime_type, width, height, alt_text, caption, credit, captured_at, status, is_featured, sort_order").in("album_id", albumIds).order("sort_order", { ascending: true })
    : { data: [], error: null };
  const rawAssets = (assetResult.data as AdminMediaAsset[] | null) ?? [];
  const assets = await Promise.all(rawAssets.map(async (asset) => {
    let signed = await supabase.storage.from("event-media").createSignedUrl(asset.storage_path, 3600, { transform: { height: 320, quality: 75, resize: "cover", width: 480 } });
    if (signed.error) signed = await supabase.storage.from("event-media").createSignedUrl(asset.storage_path, 3600);
    return { ...asset, signed_url: signed.data?.signedUrl ?? null };
  }));
  const ticketResult = eventIds.length ? await supabase.from("ticket_types").select("id, event_id, name, description, price_minor, currency, inventory_quantity, sales_start_at, sales_end_at, status, sort_order").in("event_id", eventIds).order("sort_order", { ascending: true }) : { data: [], error: null };
  const registrationResults = await Promise.all(eventIds.map((eventId) => supabase.rpc("list_event_registrations", { p_event_id: eventId })));
  const registrations = registrationResults.flatMap((result) => (result.data as AdminRegistration[] | null) ?? []);
  const registrationOrderIds = registrations.map((registration) => registration.order_id);
  const paymentResult = registrationOrderIds.length ? await supabase.from("payment_attempts").select("order_id, provider, provider_reference, amount_minor, currency, status, created_at").in("order_id", registrationOrderIds).order("created_at", { ascending: false }) : { data: [], error: null };
  const refundResults=await Promise.all(eventIds.map((eventId)=>supabase.rpc("list_event_refund_requests",{p_event_id:eventId})));
  const refunds=refundResults.flatMap((result)=>(result.data as AdminRefund[]|null)??[]);
  const checkinResults=await Promise.all(eventIds.map((eventId)=>supabase.rpc("list_event_checkins",{p_event_id:eventId})));
  const checkinAttendees=checkinResults.flatMap((result,index)=>((result.data as Omit<CheckinAttendee,"event_id">[]|null)??[]).map((attendee)=>({...attendee,event_id:eventIds[index]})));
  const feedbackResults=await Promise.all(eventIds.map((eventId)=>supabase.rpc("list_event_feedback_admin",{p_event_id:eventId})));
  const eventFeedback=feedbackResults.flatMap((result,index)=>((result.data as AdminEventFeedback[]|null)??[]).map((entry)=>({...entry,event_id:eventIds[index]})));
  const feedbackSummaryResults=await Promise.all(eventIds.map((eventId)=>supabase.rpc("get_event_feedback_summary",{p_event_id:eventId})));
  const feedbackSummaries=feedbackSummaryResults.flatMap((result,index)=>((result.data as Omit<EventFeedbackSummary,"event_id">[]|null)??[]).map((entry)=>({...entry,event_id:eventIds[index]})));
  const recapResult=eventIds.length?await supabase.from("event_recaps").select("event_id,title,summary,highlights,status").in("event_id",eventIds):{data:[],error:null};

  return (
    <main className="admin-command-center">
      <header className="admin-header">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Admin command center</small></span></Link>
        <nav aria-label="Admin navigation"><a href="#overview">Overview</a><a href="#members">Members</a><a href="#events">Events</a><a href="#event-content">Content</a><a href="#menu">Menu</a><a href="#gallery">Gallery</a><a href="#registrations">Registration</a><a href="#check-in">Check-in</a><a href="#event-feedback">Feedback</a><a href="#moderation">Safety</a><a href="#marketplace-moderation">Marketplace</a>{role.role==="super_admin"?<><a href="#communities-admin">Communities</a><a href="#learning-admin">Learning</a></>:null}{role.role==="super_admin"?<><Link href="/admin/support">Support</Link><Link href="/admin/privacy">Privacy</Link><Link href="/admin/notifications">Delivery</Link></>:null}<a href="#roadmap">Roadmap</a></nav>
        <span className="admin-role">{role.role.replace("_", " ")}</span>
      </header>
      <section className="admin-hero" id="overview">
        <div><p className="eyebrow">Authorized team access</p><h1>Build the table.<br />Protect its trust.</h1><p>Review membership, track launch readiness, and manage the public event experience from one place.</p></div>
        <div className="admin-metrics">
          <article><strong>{members.length}</strong><span>Accounts</span></article>
          <article><strong>{members.filter((member) => member.access_status === "pending").length}</strong><span>Pending</span></article>
          <article><strong>{members.filter((member) => member.access_status === "active").length}</strong><span>Active</span></article>
          <article><strong>{events.length}</strong><span>Events</span></article>
        </div>
      </section>
      {role.role === "super_admin" ? <MemberReview initialMembers={members} currentUserId={user.id} migrationReady={!memberResult.error} /> : null}
      {canManageEvents ? <EventManager initialEvents={events} privateEvents={privateEvents} canCreate={role.role === "super_admin"} migrationReady={!eventResult.error} /> : null}
      {canManageEvents && !eventResult.error ? <EventContentManager events={events} initialSessions={sessions} initialAnnouncements={((announcementData as AdminAnnouncement[] | null) ?? [])} initialSponsors={((sponsorData as AdminSponsor[] | null) ?? [])} speakerLinks={(speakerLinks as unknown as { session_id: string; event_speakers: { company: string | null; job_title: string | null; name: string } | null }[] | null) ?? []} isSuperAdmin={role.role === "super_admin"} /> : null}
      {canManageEvents && !eventResult.error ? <EventMenuManager events={events} initialMenus={menus} initialCourses={courses} initialItems={menuItems} initialFeedback={((feedbackResult.data as AdminMenuFeedback[] | null) ?? [])} migrationReady={!menuResult.error && !courseResult.error && !itemResult.error && !feedbackResult.error} /> : null}
      {canManageEvents && !eventResult.error ? <EventGalleryManager events={events} initialAlbums={albums} initialAssets={assets} migrationReady={!albumResult.error && !assetResult.error} /> : null}
      {canManageEvents && !eventResult.error ? <RegistrationManager events={events} initialTickets={((ticketResult.data as AdminTicket[] | null) ?? [])} initialRegistrations={registrations} initialPayments={((paymentResult.data as AdminPaymentAttempt[] | null) ?? [])} initialRefunds={refunds} paystackConfigured={Boolean(process.env.PAYSTACK_SECRET_KEY&&process.env.SUPABASE_SECRET_KEY&&process.env.NEXT_PUBLIC_SITE_URL)} migrationReady={!ticketResult.error && !paymentResult.error && registrationResults.every((result) => !result.error)} /> : null}
      {canManageEvents && !eventResult.error ? <EventCheckinConsole events={events.map((event)=>({id:event.id,title:event.title,starts_at:event.starts_at,ends_at:event.ends_at}))} initialAttendees={checkinAttendees} migrationReady={checkinResults.every((result)=>!result.error)} /> : null}
      {canManageEvents && !eventResult.error ? <EventFeedbackManager events={events} feedback={eventFeedback} summaries={feedbackSummaries} recaps={(recapResult.data as EventRecap[]|null)??[]} migrationReady={feedbackResults.every(result=>!result.error)&&feedbackSummaryResults.every(result=>!result.error)&&!recapResult.error} /> : null}
      {canModerate?<ModerationQueue reports={(reportResult.data as MemberReport[]|null)??[]} migrationReady={!reportResult.error}/>:null}
      {canModerate?<MarketplaceModeration reports={(marketplaceReportResult.data as MarketplaceReport[]|null)??[]} migrationReady={!marketplaceReportResult.error}/>:null}
      {role.role==="super_admin"?<CommunityManager communities={communities}members={communityMembers}enabled={Boolean(featureFlagResult.data?.enabled)}migrationReady={!communityResult.error&&!featureFlagResult.error&&communityMemberResults.every(result=>!result.error)}/>:null}
      {canModerate?<CommunityModeration reports={(communityReportResult.data as CommunityReport[]|null)??[]}migrationReady={!communityReportResult.error}/>:null}
      {role.role==="super_admin"?<LearningManager courses={adminCourses}lessons={(lessonResult.data as AdminLesson[]|null)??[]}orders={(courseOrderResult.data as CourseOrder[]|null)??[]}events={events.map(item=>({id:item.id,title:item.title}))}enabled={Boolean(learningFlagResult.data?.enabled)}migrationReady={!learningCourseResult.error&&!lessonResult.error&&!courseOrderResult.error&&!learningFlagResult.error}/>:null}
      <RoadmapOverview />
      <section className="admin-section" id="event">
        <EventCountdownManager canManage={canManageCountdown} initialSettings={(countdown as CountdownSettings | null) ?? null} userId={user.id} />
      </section>
      <footer className="admin-footer"><span>Her Africa Table · Production workspace</span><Link href="/">View public site</Link></footer>
    </main>
  );
}
