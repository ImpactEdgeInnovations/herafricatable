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
  const opportunityResult=accessStatus==="active"?await supabase.rpc("list_marketplace_posts",{p_category:null,p_limit:3,p_offset:0,p_post_type:null,p_search:null}):{data:[],error:null};
  const communityFlagResult=accessStatus==="active"?await supabase.from("feature_flags").select("enabled").eq("key","communities").maybeSingle():{data:null,error:null};
  const opportunities=(opportunityResult.data as {author_name:string;category:string;post_id:string;post_type:string;title:string}[]|null)??[];
  const pastEventResult=accessStatus==="active"?await supabase.rpc("list_my_past_events"):{data:[],error:null};
  const feedbackPrompt=((pastEventResult.data as {feedback_id:string|null;slug:string;title:string}[]|null)??[]).find(event=>!event.feedback_id);

  return (
    <main className="member-home-page">
      <header className="member-home-header"><Link className="brand" href="/"><span className="brand-mark">H</span><span>Her Africa Table<small>Member house</small></span></Link><nav>{accessStatus==="active"?<><Link href="/network">Member network</Link><Link href="/opportunities">Asks &amp; Offers</Link>{communityFlagResult.data?.enabled?<Link href="/communities">Communities</Link>:null}<Link href="/messages">Messages</Link></>:null}<Link href="/events">Upcoming tables</Link><Link href="/notifications">Notifications</Link><Link href="/support">Support</Link><Link href="/settings">Settings</Link></nav></header>
      <section className="member-welcome">
        <p className="eyebrow">Her Africa Table beta</p>
        <h1>{isApproved ? `Welcome${profile?.display_name ? `, ${profile.display_name}` : ""}.` : isSuspended ? "Your access is paused." : "Your request is at the table."}</h1>
        <p>{isApproved ? "Your member profile is active. The event and connection experience is the next build milestone." : isSuspended ? "Your account remains secure, but member access is temporarily unavailable. Contact the Her Africa Table team for support." : "Your sign-in worked. Because this is a trust-gated beta, membership access remains pending until your invitation, registration, payment, or admin approval is confirmed."}</p>
        <div className="portal-actions">
          <Link className="button button-primary" href="/events">Explore events</Link>
          <a className="button button-outline" href="mailto:support@herafricatable.com">Contact support</a>
        </div>
      </section>
      {feedbackPrompt?<section className="home-feedback-prompt"><div><p className="eyebrow">A private reflection</p><h2>How was {feedbackPrompt.title}?</h2><p>Your feedback helps shape the next table. Nothing is published without separate testimonial permission.</p></div><Link className="button button-primary"href={`/events/${feedbackPrompt.slug}/feedback`}>Share feedback</Link></section>:null}
      {accessStatus==="active"&&!opportunityResult.error?<section className="home-opportunities"><header><div><p className="eyebrow">Member exchange</p><h2>What the table needs now</h2></div><Link href="/opportunities">View all Asks &amp; Offers</Link></header>{opportunities.length?<div>{opportunities.map(item=><Link href="/opportunities" key={item.post_id}><span>{item.post_type} · {item.category}</span><strong>{item.title}</strong><small>{item.author_name}</small></Link>)}</div>:<div className="admin-empty"><strong>Start the first exchange</strong><p>Share a focused ask or offer that another member can act on.</p><Link href="/opportunities">Create a post</Link></div>}</section>:null}
      <OrderHistory orders={orders} refundOrderIds={(refunds??[]).map((refund)=>refund.order_id)} />
    </main>
  );
}
