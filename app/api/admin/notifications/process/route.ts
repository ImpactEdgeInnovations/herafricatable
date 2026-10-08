import { NextResponse } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/worker";
import { requireNotificationAdmin } from "@/lib/notifications/admin-access";

export async function POST(request: Request) {
  const access=await requireNotificationAdmin(request);
  if(access.response)return access.response;
  let body: {dedupeKey?:unknown}|null=null;
  const raw=await request.text();
  if(raw.trim()){
    try {body=JSON.parse(raw);}catch{return NextResponse.json({error:"The delivery request was not understood."},{status:400});}
    if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({error:"The delivery request was not understood."},{status:400});
  }
  const requestedKey =
    typeof body?.dedupeKey === "string" ? body.dedupeKey.trim() : "";
  const dedupeKey = /^(?:referral-invite|table-invitation|pilot-member-invite|member-approved):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    requestedKey,
  )
    ? requestedKey
    : undefined;
  if(body && Object.hasOwn(body,"dedupeKey") && !dedupeKey)return NextResponse.json({error:"Choose a valid invitation or welcome email."},{status:400});

  return processNotificationQueue({ dedupeKey, strictTarget: Boolean(dedupeKey) });
}
