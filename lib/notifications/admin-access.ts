import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type NotificationAdmin = { id: string; email?: string };
type Access = { user: NotificationAdmin; response: null } | { user: null; response: Response };

export async function requireNotificationAdmin(request: Request): Promise<Access> {
 const origin=request.headers.get("origin");
 if(origin && origin!==new URL(request.url).origin){
  return {user:null,response:NextResponse.json({error:"Use this control from Her Africa Table."},{status:403})};
 }
 try {
  const supabase=await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return {user:null,response:NextResponse.json({error:"Sign in is required."},{status:401})};
  // DB role expiry is authoritative; do not rely on JWT metadata or mere role-row existence.
  const {data:allowed,error}=await supabase.rpc("is_admin",{check_roles:["super_admin"]});
  if(error)return {user:null,response:NextResponse.json({error:"Access could not be checked. Please try again."},{status:503})};
  if(allowed!==true)return {user:null,response:NextResponse.json({error:"Active Super Admin access is required."},{status:403})};
  return {user,response:null};
 }catch {
  return {user:null,response:NextResponse.json({error:"Access could not be checked. Please try again."},{status:503})};
 }
}
