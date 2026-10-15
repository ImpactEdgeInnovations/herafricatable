import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processNotificationQueue } from "@/lib/notifications/worker";

export async function POST(request: Request) {
  const supabase = await createClient();
  const origin=request.headers.get("origin");
  if(origin && origin!==new URL(request.url).origin) return NextResponse.json({error:"Please send invitations from your Her Africa Table page."},{status:403});
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const ids=Array.isArray(body?.invitationIds)?body.invitationIds:typeof body?.invitationId==="string"?[body.invitationId]:[];
  if (!ids.length||ids.length>20||new Set(ids).size!==ids.length||ids.some((id:unknown)=>typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id as string))) {
    return NextResponse.json({ error: "Choose an invitation." }, { status: 400 });
  }
  const { data, error } = await supabase.from("table_invitations")
    .select("id,status").in("id", ids).eq("inviter_id", user.id);
  if (error || !data || data.length!==ids.length || data.some(row=>row.status!=="sent")) {
    return NextResponse.json({ error: "This invitation is not ready to send." }, { status: 403 });
  }
  let sent=0,failed=0,claimed=0;
  for(const id of ids){const response=await processNotificationQueue({dedupeKey:`table-invitation:${id}`,strictTarget: true});const result=await response.json();sent+=Number(result.sent)||0;failed+=Number(result.failed)||0;claimed+=Number(result.claimed)||0;}
  return NextResponse.json({sent,failed,claimed,targeted:true});
}
