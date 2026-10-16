import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "@/lib/admin-access";
export async function POST(request: Request) {
  const access = await requireSuperAdmin(request);
  if (access.response) return access.response;
  try {
    const body = await request.json() as {displayName?:string;email?:string;password?:string};
    const email=body.email?.trim().toLowerCase()??"",displayName=body.displayName?.trim()??"";
    if(!email.endsWith(".invalid")) return NextResponse.json({error:"Test emails must use the reserved .invalid domain."},{status:400});
    if(displayName.length<3||(body.password?.length??0)<12) return NextResponse.json({error:"Add a name and a temporary password of at least 12 characters."},{status:400});
    const admin=createAdminClient();
    const {data:created,error}=await admin.auth.admin.createUser({email,password:body.password!,email_confirm:true,user_metadata:{full_name:displayName,test_account:true}});
    if(error||!created.user)return NextResponse.json({error:"Test user creation failed."},{status:400});
    const client=await createClient();
    const marked=await client.rpc("mark_test_account",{p_display_name:displayName,p_user_id:created.user.id});
    if(marked.error){const cleanup=await admin.auth.admin.deleteUser(created.user.id);return NextResponse.json({error:cleanup.error?"Test account setup failed and needs technical cleanup.":"Test account setup failed; the temporary account was removed."},{status:503});}
    return NextResponse.json({email,userId:created.user.id});
  } catch { return NextResponse.json({error:"Test user creation failed."},{status:500}); }
}
