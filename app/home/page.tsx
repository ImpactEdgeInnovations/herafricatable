import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrderHistory, type MemberOrder } from "@/components/member/order-history";

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
  if (accessStatus === "active") {
    const { data: completion } = await supabase
      .from("profiles")
      .select("profile_completion")
      .eq("id", user.id)
      .maybeSingle();
    if (completion && completion.profile_completion < 100) redirect("/onboarding");
  }
  const isApproved = ["onboarding", "active", "dormant"].includes(accessStatus);
  const isSuspended = accessStatus === "suspended";
  const { data: orderRows } = await supabase.from("orders").select("id,reference,status,processing_mode,currency,total_minor,created_at,events(title,slug),order_items(ticket_types(name))").eq("user_id",user.id).order("created_at",{ascending:false});
  const orderIds=(orderRows??[]).map((order)=>order.id);
  const { data: refunds }=orderIds.length?await supabase.from("refund_requests").select("order_id").in("order_id",orderIds):{data:[]};
  const orders:MemberOrder[]=(orderRows??[]).map((order)=>({created_at:order.created_at,currency:order.currency,event:order.events as unknown as {slug:string;title:string}|null,id:order.id,processing_mode:order.processing_mode,reference:order.reference,status:order.status,ticket_name:((order.order_items as unknown as {ticket_types:{name:string}|null}[])[0]?.ticket_types?.name??"Event ticket"),total_minor:order.total_minor}));

  return (
    <main className="member-home-page">
      <header className="member-home-header"><Link className="brand" href="/"><span className="brand-mark">H</span><span>Her Africa Table<small>Member house</small></span></Link><nav>{accessStatus==="active"?<><Link href="/network">Member network</Link><Link href="/messages">Messages</Link></>:null}<Link href="/events">Upcoming tables</Link><Link href="/support">Support</Link></nav></header>
      <section className="member-welcome">
        <p className="eyebrow">Her Africa Table beta</p>
        <h1>{isApproved ? `Welcome${profile?.display_name ? `, ${profile.display_name}` : ""}.` : isSuspended ? "Your access is paused." : "Your request is at the table."}</h1>
        <p>{isApproved ? "Your member profile is active. The event and connection experience is the next build milestone." : isSuspended ? "Your account remains secure, but member access is temporarily unavailable. Contact the Her Africa Table team for support." : "Your sign-in worked. Because this is a trust-gated beta, membership access remains pending until your invitation, registration, payment, or admin approval is confirmed."}</p>
        <div className="portal-actions">
          <Link className="button button-primary" href="/events">Explore events</Link>
          <a className="button button-outline" href="mailto:support@herafricatable.com">Contact support</a>
        </div>
      </section>
      <OrderHistory orders={orders} refundOrderIds={(refunds??[]).map((refund)=>refund.order_id)} />
    </main>
  );
}
