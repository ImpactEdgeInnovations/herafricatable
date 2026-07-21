import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MemberHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, access_status, onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  const accessStatus = profile?.access_status ?? "pending";
  if (accessStatus === "onboarding") redirect("/onboarding");
  const isApproved = ["onboarding", "active", "dormant"].includes(accessStatus);
  const isSuspended = accessStatus === "suspended";

  return (
    <main className="portal-page">
      <section className="portal-card">
        <p className="eyebrow">Her Africa Table beta</p>
        <h1>{isApproved ? `Welcome${profile?.display_name ? `, ${profile.display_name}` : ""}.` : isSuspended ? "Your access is paused." : "Your request is at the table."}</h1>
        <p>{isApproved ? "Your member profile is active. The event and connection experience is the next build milestone." : isSuspended ? "Your account remains secure, but member access is temporarily unavailable. Contact the Her Africa Table team for support." : "Your sign-in worked. Because this is a trust-gated beta, membership access remains pending until your invitation, registration, payment, or admin approval is confirmed."}</p>
        <div className="portal-actions">
          <Link className="button button-primary" href="/">Return home</Link>
          <a className="button button-outline" href="mailto:support@herafricatable.com">Contact support</a>
        </div>
      </section>
    </main>
  );
}
