import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationCenter, type MemberNotification, type NotificationPreference } from "@/components/member/notification-center";
import { createClient } from "@/lib/supabase/server";
import { MemberHeader } from "@/components/member/member-header";

export const dynamic="force-dynamic";
const defaults:NotificationPreference={in_app_enabled:true,email_network:true,email_events:true,email_support:true};
export default async function NotificationsPage(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/sign-in");const [notificationResult,{data:preferences}]=await Promise.all([supabase.from("notifications").select("id,kind,title,body,href,read_at,created_at").order("created_at",{ascending:false}).limit(100),supabase.from("notification_preferences").select("in_app_enabled,email_network,email_events,email_support").eq("user_id",user.id).maybeSingle()]);return <main className="notifications-page"><MemberHeader active="alerts" label="Notifications"/>{notificationResult.error?<section className="admin-empty network-error"><strong>Notifications are temporarily unavailable</strong><p>Please try again or contact support if the problem continues.</p><div className="journey-state-actions"><Link className="button button-primary" href="/notifications">Try again</Link><Link className="button button-outline" href="/support">Contact support</Link></div></section>:<NotificationCenter userId={user.id} notifications={(notificationResult.data as MemberNotification[]|null)??[]} initialPreferences={(preferences as NotificationPreference|null)??defaults}/>}</main>}
