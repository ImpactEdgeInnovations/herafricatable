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
  const firstName=profile?.display_name?.trim().split(/\s+/)[0];
  const memberState=accessStatus==="active"
    ?{label:"Membership active",title:`Welcome${firstName?`, ${firstName}`:""}.`,description:"Your membership is ready. Meet members, join an event, or continue a conversation from here.",action:"Find members",href:"/network"}
    :accessStatus==="dormant"
      ?{label:"Renewal needed",title:`Welcome back${firstName?`, ${firstName}`:""}.`,description:"Your profile is safe, but member access needs to be renewed. Review your membership or ask the team for help.",action:membershipFlagResult.data?.enabled?"Review membership":"Contact support",href:membershipFlagResult.data?.enabled?"/membership":"/support"}
      :isSuspended
        ?{label:"Access paused",title:"Your access is paused.",description:"Your account remains secure, but member features are temporarily unavailable. Contact the team if you need help.",action:"Contact support",href:"mailto:support@herafricatable.com"}
        :{label:"Approval pending",title:"Your request is with our team.",description:"You have signed in successfully. We will open your member access after your invitation, registration or payment has been confirmed.",action:"Explore events",href:"/events"};

  return (
    <main className="member-home-page">
      <header className="member-home-header"><Link className="brand" href="/home"><span className="brand-mark">H</span><span>Her Africa Table<small>Member home</small></span></Link><nav aria-label="Member navigation"><Link aria-current="page" href="/home">Home</Link>{accessStatus==="active"?<Link href="/network">Members</Link>:null}<Link href="/events">Events</Link>{accessStatus==="active"?<Link href="/messages">Messages</Link>:null}<Link href="/notifications">Notifications</Link><Link href="/settings">Account</Link></nav></header>
      <section className="member-welcome">
        <p className="member-state"><span aria-hidden="true" />{memberState.label}</p>
        <h1>{memberState.title}</h1>
        <p>{memberState.description}</p>
        <div className="portal-actions">
          {memberState.href.startsWith("mailto:")?<a className="button button-primary" href={memberState.href}>{memberState.action}</a>:<Link className="button button-primary" href={memberState.href}>{memberState.action}</Link>}
          {accessStatus==="active"?<Link className="button button-outline" href="/events">View events</Link>:null}
        </div>
      </section>
      {accessStatus==="active"?<section className="member-quickstart" aria-labelledby="quickstart-title"><header><p className="eyebrow">Start here</p><h2 id="quickstart-title">What would you like to do?</h2></header><div><Link href="/network"><span>01</span><strong>Meet members</strong><p>Find women by location, industry or what they can help with.</p><small>Open member directory →</small></Link><Link href="/events"><span>02</span><strong>Join an event</strong><p>See what is coming up and manage your registration.</p><small>Browse events →</small></Link><Link href="/messages"><span>03</span><strong>Continue a conversation</strong><p>Message people who have accepted your connection.</p><small>Open messages →</small></Link></div></section>:null}
      {isApproved?<section className="member-launchpad"><header><div><p className="eyebrow">More for members</p><h2>Explore your membership.</h2></div><span>Only you can see this area</span></header><div>{membershipFlagResult.data?.enabled?<Link href="/membership"><small>Your account</small><strong>Membership</strong><span>View your status and renewal →</span></Link>:null}{accessStatus==="active"?<Link href="/opportunities"><small>Ask or offer</small><strong>Opportunities</strong><span>Share what you need or can offer →</span></Link>:null}{circleFlagResult.data?.enabled?<Link href="/circles"><small>Small groups</small><strong>Circles</strong><span>Join your guided peer group →</span></Link>:null}{communityFlagResult.data?.enabled?<Link href="/communities"><small>Shared interests</small><strong>Communities</strong><span>Visit focused member spaces →</span></Link>:null}{learningFlagResult.data?.enabled?<Link href="/learning"><small>Build skills</small><strong>Learning</strong><span>Continue a course →</span></Link>:null}{perkFlagResult.data?.enabled?<Link href="/perks"><small>Member offers</small><strong>Benefits</strong><span>View available partner benefits →</span></Link>:null}{referralFlagResult.data?.enabled?<Link href="/referrals"><small>Invite someone</small><strong>Referrals</strong><span>Recommend a woman you trust →</span></Link>:null}<Link href="/support"><small>Need help?</small><strong>Support</strong><span>Send a private request →</span></Link></div></section>:null}
      {feedbackPrompt?<section className="home-feedback-prompt"><div><p className="eyebrow">A private reflection</p><h2>How was {feedbackPrompt.title}?</h2><p>Your feedback helps shape the next table. Nothing is published without separate testimonial permission.</p></div><Link className="button button-primary"href={`/events/${feedbackPrompt.slug}/feedback`}>Share feedback</Link></section>:null}
      {accessStatus==="active"&&!opportunityResult.error?<section className="home-opportunities"><header><div><p className="eyebrow">Member exchange</p><h2>What the table needs now</h2></div><Link href="/opportunities">View all Asks &amp; Offers</Link></header>{opportunities.length?<div>{opportunities.map(item=><Link href="/opportunities" key={item.post_id}><span>{item.post_type} · {item.category}</span><strong>{item.title}</strong><small>{item.author_name}</small></Link>)}</div>:<div className="admin-empty"><strong>Start the first exchange</strong><p>Share a focused ask or offer that another member can act on.</p><Link href="/opportunities">Create a post</Link></div>}</section>:null}
      <OrderHistory orders={orders} refundOrderIds={(refunds??[]).map((refund)=>refund.order_id)} />
    </main>
  );
}
