import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventCountdownManager, type CountdownSettings } from "@/components/admin/event-countdown-manager";
import { MemberReview, type AdminMember } from "@/components/admin/member-review";
import { RoadmapOverview } from "@/components/admin/roadmap-overview";

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

  const [{ data: countdown }, memberResult] = await Promise.all([
    supabase.from("site_event_countdown").select("event_name, city, starts_at, is_published").eq("id", true).maybeSingle(),
    role.role === "super_admin" ? supabase.rpc("list_admin_members") : Promise.resolve({ data: [], error: null }),
  ]);

  const members = (memberResult.data as AdminMember[] | null) ?? [];
  const canManageCountdown = role.role === "super_admin" || role.role === "event_staff";

  return (
    <main className="admin-command-center">
      <header className="admin-header">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">H</span><span>Her Africa Table<small>Admin command center</small></span></Link>
        <nav aria-label="Admin navigation"><a href="#overview">Overview</a><a href="#members">Members</a><a href="#roadmap">Roadmap</a><a href="#event">Next event</a></nav>
        <span className="admin-role">{role.role.replace("_", " ")}</span>
      </header>
      <section className="admin-hero" id="overview">
        <div><p className="eyebrow">Authorized team access</p><h1>Build the table.<br />Protect its trust.</h1><p>Review membership, track launch readiness, and manage the public event experience from one place.</p></div>
        <div className="admin-metrics">
          <article><strong>{members.length}</strong><span>Accounts</span></article>
          <article><strong>{members.filter((member) => member.access_status === "pending").length}</strong><span>Pending</span></article>
          <article><strong>{members.filter((member) => member.access_status === "active").length}</strong><span>Active</span></article>
        </div>
      </section>
      {role.role === "super_admin" ? <MemberReview initialMembers={members} currentUserId={user.id} migrationReady={!memberResult.error} /> : null}
      <RoadmapOverview />
      <section className="admin-section" id="event">
        <EventCountdownManager canManage={canManageCountdown} initialSettings={(countdown as CountdownSettings | null) ?? null} userId={user.id} />
      </section>
      <footer className="admin-footer"><span>Her Africa Table · Production workspace</span><Link href="/">View public site</Link></footer>
    </main>
  );
}
