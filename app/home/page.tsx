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
  const { data: orderRows } = await supabase.from("orders").select("id,reference,status,processing_mode,currency,total_minor,created_at,order_type,events(title,slug),order_items(ticket_types(name),courses(title,slug),membership_plans(name,slug))").eq("user_id",user.id).order("created_at",{ascending:false});
  const orderIds=(orderRows??[]).map((order)=>order.id);
  const { data: refunds }=orderIds.length?await supabase.from("refund_requests").select("order_id").in("order_id",orderIds):{data:[]};
  const orders:MemberOrder[]=(orderRows??[]).map((order)=>{const item=(order.order_items as unknown as {ticket_types:{name:string}|null;courses:{slug:string;title:string}|null;membership_plans:{slug:string;name:string}|null}[])[0];return{course:item?.courses??null,membership:item?.membership_plans??null,created_at:order.created_at,currency:order.currency,event:order.events as unknown as {slug:string;title:string}|null,id:order.id,order_type:order.order_type,processing_mode:order.processing_mode,reference:order.reference,status:order.status,ticket_name:item?.ticket_types?.name??(item?.courses?"Course access":item?.membership_plans?"Membership term":"Event ticket"),total_minor:order.total_minor}});
  const opportunityResult=accessStatus==="active"?await supabase.rpc("list_marketplace_posts",{p_category:null,p_limit:3,p_offset:0,p_post_type:null,p_search:null}):{data:[],error:null};
  const communityFlagResult=accessStatus==="active"?await supabase.from("feature_flags").select("enabled").eq("key","communities").maybeSingle():{data:null,error:null};
  const learningFlagResult=accessStatus==="active"?await supabase.from("feature_flags").select("enabled").eq("key","learning").maybeSingle():{data:null,error:null};
  const referralFlagResult=accessStatus==="active"?await supabase.from("feature_flags").select("enabled").eq("key","referrals").maybeSingle():{data:null,error:null};
  const membershipFlagResult=["active","dormant"].includes(accessStatus)?await supabase.from("feature_flags").select("enabled").eq("key","memberships").maybeSingle():{data:null,error:null};
  const circleFlagResult=accessStatus==="active"?await supabase.from("feature_flags").select("enabled").eq("key","circles").maybeSingle():{data:null,error:null};
  const perkFlagResult=accessStatus==="active"?await supabase.from("feature_flags").select("enabled").eq("key","partner_perks").maybeSingle():{data:null,error:null};
  const opportunities=(opportunityResult.data as {author_name:string;category:string;post_id:string;post_type:string;title:string}[]|null)??[];
  const pastEventResult=accessStatus==="active"?await supabase.rpc("list_my_past_events"):{data:[],error:null};
  const feedbackPrompt=((pastEventResult.data as {feedback_id:string|null;slug:string;title:string}[]|null)??[]).find(event=>!event.feedback_id);

  return (
    <main className="member-home-page">
      <header className="member-home-header"><Link className="brand" href="/"><span className="brand-mark">H</span><span>Her Africa Table<small>Member house</small></span></Link><nav>{accessStatus==="active"?<Link href="/network">Network</Link>:null}<Link href="/events">Events</Link>{accessStatus==="active"?<Link href="/messages">Messages</Link>:null}<Link href="/notifications">Inbox</Link><Link href="/settings">Settings</Link></nav></header>
      <section className="member-welcome">
        <p className="eyebrow">Her Africa Table beta</p>
        <h1>{isApproved ? `Welcome${profile?.display_name ? `, ${profile.display_name}` : ""}.` : isSuspended ? "Your access is paused." : "Your request is at the table."}</h1>
        <p>{isApproved ? "Your member profile is active. The event and connection experience is the next build milestone." : isSuspended ? "Your account remains secure, but member access is temporarily unavailable. Contact the Her Africa Table team for support." : "Your sign-in worked. Because this is a trust-gated beta, membership access remains pending until your invitation, registration, payment, or admin approval is confirmed."}</p>
        <div className="portal-actions">
          <Link className="button button-primary" href="/events">Explore events</Link>
          <a className="button button-outline" href="mailto:support@herafricatable.com">Contact support</a>
        </div>
      </section>
      {isApproved?<section className="member-launchpad"><header><div><p className="eyebrow">Your member house</p><h2>Everything useful, one step away.</h2></div><span>Private by design</span></header><div>{membershipFlagResult.data?.enabled?<Link href="/membership"><small>Account</small><strong>Membership</strong><span>Terms, standing and renewal →</span></Link>:null}{accessStatus==="active"?<Link href="/opportunities"><small>Exchange</small><strong>Asks &amp; Offers</strong><span>Open a door or ask clearly →</span></Link>:null}{circleFlagResult.data?.enabled?<Link href="/circles"><small>Small cohorts</small><strong>Circles</strong><span>Your guided peer room →</span></Link>:null}{communityFlagResult.data?.enabled?<Link href="/communities"><small>Shared purpose</small><strong>Communities</strong><span>Focused member spaces →</span></Link>:null}{learningFlagResult.data?.enabled?<Link href="/learning"><small>Practical growth</small><strong>Learning</strong><span>Courses and progress →</span></Link>:null}{perkFlagResult.data?.enabled?<Link href="/perks"><small>Partner value</small><strong>Benefits</strong><span>Curated member advantages →</span></Link>:null}{referralFlagResult.data?.enabled?<Link href="/referrals"><small>Trust-led growth</small><strong>Invite</strong><span>Vouch for the right woman →</span></Link>:null}<Link href="/support"><small>Private help</small><strong>Support</strong><span>Speak with the team →</span></Link></div></section>:null}
      {feedbackPrompt?<section className="home-feedback-prompt"><div><p className="eyebrow">A private reflection</p><h2>How was {feedbackPrompt.title}?</h2><p>Your feedback helps shape the next table. Nothing is published without separate testimonial permission.</p></div><Link className="button button-primary"href={`/events/${feedbackPrompt.slug}/feedback`}>Share feedback</Link></section>:null}
      {accessStatus==="active"&&!opportunityResult.error?<section className="home-opportunities"><header><div><p className="eyebrow">Member exchange</p><h2>What the table needs now</h2></div><Link href="/opportunities">View all Asks &amp; Offers</Link></header>{opportunities.length?<div>{opportunities.map(item=><Link href="/opportunities" key={item.post_id}><span>{item.post_type} · {item.category}</span><strong>{item.title}</strong><small>{item.author_name}</small></Link>)}</div>:<div className="admin-empty"><strong>Start the first exchange</strong><p>Share a focused ask or offer that another member can act on.</p><Link href="/opportunities">Create a post</Link></div>}</section>:null}
      <OrderHistory orders={orders} refundOrderIds={(refunds??[]).map((refund)=>refund.order_id)} />
    </main>
  );
}
