import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EventCountdownManager, type CountdownSettings } from "@/components/admin/event-countdown-manager";

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
      <main className="portal-page">
        <section className="portal-card">
          <p className="eyebrow">Access restricted</p>
          <h1>Admin role required.</h1>
          <p>Your identity was verified, but this account does not have an approved Her Africa Table team role. Choosing the Admin sign-in page never grants administrative access.</p>
          <div className="portal-actions"><Link className="button button-primary" href="/home">Continue as a member</Link><Link className="button button-outline" href="/">Return home</Link></div>
        </section>
      </main>
    );
  }

  const { data: countdown } = await supabase
    .from("site_event_countdown")
    .select("event_name, city, starts_at, is_published")
    .eq("id", true)
    .maybeSingle();

  const canManageCountdown = role.role === "super_admin" || role.role === "event_staff";

  return (
    <main className="portal-page admin-portal">
      <section className="portal-card">
        <p className="eyebrow">Authorized team access</p>
        <h1>Admin foundation ready.</h1>
        <p>You are signed in with the <strong>{role.role.replace("_", " ")}</strong> role. The operational dashboard is the next protected module.</p>
        <div className="portal-actions"><Link className="button button-primary" href="/">Return home</Link></div>
        <EventCountdownManager
          canManage={canManageCountdown}
          initialSettings={(countdown as CountdownSettings | null) ?? null}
          userId={user.id}
        />
      </section>
    </main>
  );
}
