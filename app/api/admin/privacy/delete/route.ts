import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/admin-access";
import { adminErrorMessage } from "@/lib/admin-error";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request: Request) {
  const access=await requireSuperAdmin(request);
  if(access.response)return access.response;
  let body:{requestId?:string};
  try{body=await request.json();}catch{return NextResponse.json({error:"Invalid request."},{status:400});}
  if(!body?.requestId||!uuid.test(body.requestId))return NextResponse.json({error:"Choose a valid privacy request."},{status:400});
  const client=await createClient();
  try {
    const {data:target,error}=await client.rpc("execute_account_deletion",{p_request_id:body.requestId});
    if(error||typeof target!=="string")return NextResponse.json({error:adminErrorMessage(error,"start account cleanup")},{status:400});
    const state=await client.from("privacy_requests").select("status,auth_disabled_at,avatar_removed_at").eq("id",body.requestId).single();
    if(state.error)throw state.error;
    if(state.data.status==='completed')return NextResponse.json({completed:true});
    const admin=createAdminClient();
    for(const step of ['auth','avatar'] as const){
      if(step==='auth'?state.data.auth_disabled_at:state.data.avatar_removed_at)continue;
      let success=false;
      try {
        const result=step==='auth'
          ? await admin.auth.admin.updateUserById(target,{email:`deleted-${body.requestId}@privacy.invalid`,email_confirm:true,ban_duration:"876000h",user_metadata:{account_deleted:true,privacy_request_id:body.requestId}})
          : await admin.storage.from("avatars").remove([`${target}/profile`]);
        success=!result.error;
      } catch {success=false;}
      const recorded=await client.rpc("record_account_cleanup_step",{p_request_id:body.requestId,p_step:step,p_success:success});
      if(recorded.error||!success)return NextResponse.json({error:"Account cleanup is incomplete. Refresh this page and choose Retry cleanup.",cleanupPending:true},{status:503});
    }
    return NextResponse.json({completed:true});
  } catch {return NextResponse.json({error:"Cleanup could not finish. Refresh and retry; completed steps are retained.",cleanupPending:true},{status:503});}
}
