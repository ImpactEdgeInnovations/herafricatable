import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSettings, type PrivacyRequest } from "@/components/member/account-settings";
import { createClient } from "@/lib/supabase/server";
import { MemberHeader } from "@/components/member/member-header";

export const dynamic="force-dynamic";
export default async function SettingsPage(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/sign-in");const [{data:profile},requestResult]=await Promise.all([supabase.from("profiles").select("visibility_paused").eq("id",user.id).maybeSingle(),supabase.from("privacy_requests").select("id,reference,request_type,reason,status,scheduled_for,reviewer_note,created_at").order("created_at",{ascending:false})]);return <main className="settings-page"><MemberHeader accountHref="/settings" accountLabel="Account" active="account" label="Account settings"/>{requestResult.error?<section className="admin-empty network-error"><strong>Account settings are temporarily unavailable</strong><p>Please try again or contact support if the problem continues.</p><div className="journey-state-actions"><Link className="button button-primary" href="/settings">Try again</Link><Link className="button button-outline" href="/support">Contact support</Link></div></section>:<AccountSettings email={user.email??""} visibilityPaused={Boolean(profile?.visibility_paused)} requests={(requestResult.data as PrivacyRequest[]|null)??[]}/>}</main>}
