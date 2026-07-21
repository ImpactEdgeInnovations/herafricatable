import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSettings, type PrivacyRequest } from "@/components/member/account-settings";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export default async function SettingsPage(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/sign-in");const [{data:profile},requestResult]=await Promise.all([supabase.from("profiles").select("visibility_paused").eq("id",user.id).maybeSingle(),supabase.from("privacy_requests").select("id,reference,request_type,reason,status,scheduled_for,reviewer_note,created_at").order("created_at",{ascending:false})]);return <main className="settings-page"><header className="member-home-header"><Link className="brand" href="/"><span className="brand-mark">H</span><span>Her Africa Table<small>Account settings</small></span></Link><nav><Link href="/home">Member home</Link><Link href="/support">Support</Link></nav></header>{requestResult.error?<section className="admin-empty network-error"><strong>Privacy database update required</strong><p>Apply <code>20260723210000_privacy_account_lifecycle.sql</code>.</p></section>:<AccountSettings email={user.email??""} visibilityPaused={Boolean(profile?.visibility_paused)} requests={(requestResult.data as PrivacyRequest[]|null)??[]}/>}</main>}
