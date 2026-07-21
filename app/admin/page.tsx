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

  return (
    <main className="admin-command-center">
      <header className="admin-header">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Admin command center</small></span></Link>
        <nav aria-label="Admin navigation"><a href="#overview">Overview</a><a href="#members">Members</a><a href="#events">Events</a><a href="#event-content">Content</a><a href="#menu">Menu</a><a href="#roadmap">Roadmap</a></nav>
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
      <RoadmapOverview />
      <section className="admin-section" id="event">
        <EventCountdownManager canManage={canManageCountdown} initialSettings={(countdown as CountdownSettings | null) ?? null} userId={user.id} />
      </section>
      <footer className="admin-footer"><span>Her Africa Table · Production workspace</span><Link href="/">View public site</Link></footer>
    </main>
  );
}
