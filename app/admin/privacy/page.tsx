import Link from "next/link";
import { redirect } from "next/navigation";
import { PrivacyOperations, type AdminPrivacyRequest } from "@/components/admin/privacy-operations";
import { createClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export default async function AdminPrivacyPage(){const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/admin/sign-in");const {data:role}=await supabase.from("user_roles").select("role").eq("user_id",user.id).eq("role","super_admin").maybeSingle();if(!role)redirect("/admin");const result=await supabase.rpc("list_admin_privacy_requests");return <main className="admin-command-center"><header className="admin-header"><Link className="brand" href="/"><span className="brand-mark">H</span><span>Her Africa Table<small>Privacy operations</small></span></Link><nav><Link href="/admin">Command centre</Link><Link href="/admin/support">Support</Link></nav><span className="admin-role">super admin</span></header>{result.error?<section className="admin-empty network-error"><strong>Privacy database update required</strong><p>Apply <code>20260723210000_privacy_account_lifecycle.sql</code>.</p></section>:<PrivacyOperations requests={(result.data as AdminPrivacyRequest[]|null)??[]}/>}</main>}
