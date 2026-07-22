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
import { ReferralManager, type AdminReferral, type AdminReferralCampaign } from "@/components/admin/referral-manager";
import { MembershipManager, type AdminMembership, type AdminMembershipPlan, type MembershipOrder } from "@/components/admin/membership-manager";
import { CircleManager, type CircleParticipant } from "@/components/admin/circle-manager";
import type { CircleCycle } from "@/components/member/circles-hub";
import { PerksManager, type AdminPartner, type PerkRedemption } from "@/components/admin/perks-manager";
import type { PartnerPerk } from "@/components/member/perks-gallery";
import { AnalyticsReadiness, type ProductAnalytic, type ReadinessMetric } from "@/components/admin/analytics-readiness";
import { AdminActionCentre } from "@/components/admin/admin-action-centre";

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
  const referralCampaignResult=role.role==="super_admin"?await supabase.from("referral_campaigns").select("id,name,slug,description,status,starts_at,ends_at,max_referrals_per_member,max_total_referrals").order("created_at",{ascending:false}):{data:[],error:null};
  const referralResult=role.role==="super_admin"?await supabase.rpc("list_referrals_admin"):{data:[],error:null};
  const referralFlagResult=role.role==="super_admin"?await supabase.from("feature_flags").select("enabled").eq("key","referrals").maybeSingle():{data:null,error:null};
  const membershipPlanResult=role.role==="super_admin"?await supabase.from("membership_plans").select("id,slug,name,description,price_minor,currency,duration_months,grace_days,payment_mode,status").order("created_at"):{data:[],error:null};
  const membershipPeriodResult=role.role==="super_admin"?await supabase.rpc("list_memberships_admin"):{data:[],error:null};
  const membershipOrderResult=role.role==="super_admin"?await supabase.rpc("list_membership_orders"):{data:[],error:null};
  const membershipFlagResult=role.role==="super_admin"?await supabase.from("feature_flags").select("enabled").eq("key","memberships").maybeSingle():{data:null,error:null};
  const circleCycleResult=role.role==="super_admin"?await supabase.rpc("list_circle_cycles"):{data:[],error:null};
  const circleCycles=(circleCycleResult.data as CircleCycle[]|null)??[];
  const circleParticipantResults=role.role==="super_admin"?await Promise.all(circleCycles.map(item=>supabase.rpc("list_circle_participants_admin",{p_cycle_id:item.cycle_id}))):[];
  const circleParticipants=circleParticipantResults.flatMap((result,index)=>((result.data as Omit<CircleParticipant,"cycle_id">[]|null)??[]).map(item=>({...item,cycle_id:circleCycles[index].cycle_id})));
  const circleFlagResult=role.role==="super_admin"?await supabase.from("feature_flags").select("enabled").eq("key","circles").maybeSingle():{data:null,error:null};
  const partnerResult=role.role==="super_admin"?await supabase.from("partners").select("id,slug,name,description,website_url,logo_url,category,city,country,status").order("created_at"):{data:[],error:null};
  const perkResult=role.role==="super_admin"?await supabase.rpc("list_partner_perks"):{data:[],error:null};
  const perkRedemptionResult=role.role==="super_admin"?await supabase.rpc("list_perk_redemptions_admin"):{data:[],error:null};
  const perkFlagResult=role.role==="super_admin"?await supabase.from("feature_flags").select("enabled").eq("key","partner_perks").maybeSingle():{data:null,error:null};
  const readinessResult=role.role==="super_admin"?await supabase.rpc("get_launch_readiness_metrics"):{data:[],error:null};
  const analyticsResult=role.role==="super_admin"?await supabase.rpc("get_product_analytics",{p_days:30}):{data:[],error:null};
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
  const memberReports=(reportResult.data as MemberReport[]|null)??[];
  const marketplaceReports=(marketplaceReportResult.data as MarketplaceReport[]|null)??[];
  const communityReports=(communityReportResult.data as CommunityReport[]|null)??[];
  const openReportCount=[...memberReports,...marketplaceReports,...communityReports].filter((report)=>["open","reviewing"].includes(report.status)).length;

  return (
    <main className="admin-command-center">
      <header className="admin-header">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Admin command center</small></span></Link>
        <nav className="admin-primary-nav" aria-label="Admin navigation">
          <a href="#actions">Tasks</a>
          {role.role==="super_admin"?<a href="#members">Members</a>:null}
          {canManageEvents?<a href="#events">Events</a>:null}
          {canManageEvents?<a href="#registrations">Registrations</a>:null}
          {canModerate?<a href="#moderation">Safety</a>:null}
          <details className="admin-tools-menu">
            <summary>More tools</summary>
            <div>
              {role.role==="super_admin"?<a href="#analytics">Launch readiness</a>:null}
              {canManageEvents?<><a href="#event-content">Programme &amp; publishing</a><a href="#menu">Event menu</a><a href="#gallery">Event gallery</a><a href="#check-in">Event check-in</a><a href="#event-feedback">Event feedback</a></>:null}
              {canModerate?<><a href="#marketplace-moderation">Marketplace safety</a><a href="#community-moderation">Community safety</a></>:null}
              {role.role==="super_admin"?<><a href="#memberships-admin">Membership plans</a><a href="#circles-admin">Circles</a><a href="#perks-admin">Partner perks</a><a href="#communities-admin">Communities</a><a href="#learning-admin">Learning</a><a href="#referrals-admin">Referrals</a><Link href="/admin/support">Member support</Link><Link href="/admin/privacy">Privacy requests</Link><Link href="/admin/notifications">Message delivery</Link></>:null}
              <a href="#event">Homepage countdown</a>
              <a href="#roadmap">Delivery roadmap</a>
            </div>
          </details>
        </nav>
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
      <AdminActionCentre
        draftEvents={events.filter((event)=>event.status==="draft").length}
        hasEvents={events.length>0}
        openReports={openReportCount}
        pendingMembers={members.filter((member)=>member.access_status==="pending").length}
        pendingRefunds={refunds.filter((refund)=>refund.status==="requested").length}
        pendingRegistrations={registrations.filter((registration)=>registration.status==="pending_review").length}
        role={role.role}
      />
      {role.role==="super_admin"?<AnalyticsReadiness metrics={(readinessResult.data as ReadinessMetric[]|null)??[]}analytics={(analyticsResult.data as ProductAnalytic[]|null)??[]}migrationReady={!readinessResult.error&&!analyticsResult.error}/>:null}
      {role.role === "super_admin" ? <MemberReview initialMembers={members} currentUserId={user.id} migrationReady={!memberResult.error} /> : null}
      {canManageEvents ? <EventManager initialEvents={events} privateEvents={privateEvents} canCreate={role.role === "super_admin"} migrationReady={!eventResult.error} /> : null}
      {canManageEvents && !eventResult.error ? <EventContentManager events={events} initialSessions={sessions} initialAnnouncements={((announcementData as AdminAnnouncement[] | null) ?? [])} initialSponsors={((sponsorData as AdminSponsor[] | null) ?? [])} speakerLinks={(speakerLinks as unknown as { session_id: string; event_speakers: { company: string | null; job_title: string | null; name: string } | null }[] | null) ?? []} isSuperAdmin={role.role === "super_admin"} /> : null}
      {canManageEvents && !eventResult.error ? <EventMenuManager events={events} initialMenus={menus} initialCourses={courses} initialItems={menuItems} initialFeedback={((feedbackResult.data as AdminMenuFeedback[] | null) ?? [])} migrationReady={!menuResult.error && !courseResult.error && !itemResult.error && !feedbackResult.error} /> : null}
      {canManageEvents && !eventResult.error ? <EventGalleryManager events={events} initialAlbums={albums} initialAssets={assets} migrationReady={!albumResult.error && !assetResult.error} /> : null}
      {canManageEvents && !eventResult.error ? <RegistrationManager events={events} initialTickets={((ticketResult.data as AdminTicket[] | null) ?? [])} initialRegistrations={registrations} initialPayments={((paymentResult.data as AdminPaymentAttempt[] | null) ?? [])} initialRefunds={refunds} paystackConfigured={Boolean(process.env.PAYSTACK_SECRET_KEY&&process.env.SUPABASE_SECRET_KEY&&process.env.NEXT_PUBLIC_SITE_URL)} migrationReady={!ticketResult.error && !paymentResult.error && registrationResults.every((result) => !result.error)} /> : null}
      {canManageEvents && !eventResult.error ? <EventCheckinConsole events={events.map((event)=>({id:event.id,title:event.title,starts_at:event.starts_at,ends_at:event.ends_at}))} initialAttendees={checkinAttendees} migrationReady={checkinResults.every((result)=>!result.error)} /> : null}
      {canManageEvents && !eventResult.error ? <EventFeedbackManager events={events} feedback={eventFeedback} summaries={feedbackSummaries} recaps={(recapResult.data as EventRecap[]|null)??[]} migrationReady={feedbackResults.every(result=>!result.error)&&feedbackSummaryResults.every(result=>!result.error)&&!recapResult.error} /> : null}
      {canModerate?<ModerationQueue reports={memberReports} migrationReady={!reportResult.error}/>:null}
      {canModerate?<MarketplaceModeration reports={marketplaceReports} migrationReady={!marketplaceReportResult.error}/>:null}
      {role.role==="super_admin"?<MembershipManager plans={(membershipPlanResult.data as AdminMembershipPlan[]|null)??[]}periods={(membershipPeriodResult.data as AdminMembership[]|null)??[]}orders={(membershipOrderResult.data as MembershipOrder[]|null)??[]}enabled={Boolean(membershipFlagResult.data?.enabled)}migrationReady={!membershipPlanResult.error&&!membershipPeriodResult.error&&!membershipOrderResult.error&&!membershipFlagResult.error}/>:null}
      {role.role==="super_admin"?<CircleManager cycles={circleCycles}participants={circleParticipants}enabled={Boolean(circleFlagResult.data?.enabled)}migrationReady={!circleCycleResult.error&&!circleFlagResult.error&&circleParticipantResults.every(result=>!result.error)}/>:null}
      {role.role==="super_admin"?<PerksManager partners={(partnerResult.data as AdminPartner[]|null)??[]}perks={(perkResult.data as PartnerPerk[]|null)??[]}redemptions={(perkRedemptionResult.data as PerkRedemption[]|null)??[]}enabled={Boolean(perkFlagResult.data?.enabled)}migrationReady={!partnerResult.error&&!perkResult.error&&!perkRedemptionResult.error&&!perkFlagResult.error}/>:null}
      {role.role==="super_admin"?<CommunityManager communities={communities}members={communityMembers}enabled={Boolean(featureFlagResult.data?.enabled)}migrationReady={!communityResult.error&&!featureFlagResult.error&&communityMemberResults.every(result=>!result.error)}/>:null}
      {canModerate?<CommunityModeration reports={communityReports}migrationReady={!communityReportResult.error}/>:null}
      {role.role==="super_admin"?<LearningManager courses={adminCourses}lessons={(lessonResult.data as AdminLesson[]|null)??[]}orders={(courseOrderResult.data as CourseOrder[]|null)??[]}events={events.map(item=>({id:item.id,title:item.title}))}enabled={Boolean(learningFlagResult.data?.enabled)}migrationReady={!learningCourseResult.error&&!lessonResult.error&&!courseOrderResult.error&&!learningFlagResult.error}/>:null}
      {role.role==="super_admin"?<ReferralManager campaigns={(referralCampaignResult.data as AdminReferralCampaign[]|null)??[]}referrals={(referralResult.data as AdminReferral[]|null)??[]}enabled={Boolean(referralFlagResult.data?.enabled)}migrationReady={!referralCampaignResult.error&&!referralResult.error&&!referralFlagResult.error}/>:null}
      <RoadmapOverview />
      <section className="admin-section" id="event">
        <EventCountdownManager canManage={canManageCountdown} initialSettings={(countdown as CountdownSettings | null) ?? null} userId={user.id} />
      </section>
      <footer className="admin-footer"><span>Her Africa Table · Production workspace</span><Link href="/">View public site</Link></footer>
    </main>
  );
}
