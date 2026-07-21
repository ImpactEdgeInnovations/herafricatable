import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotificationEmail } from "@/lib/notifications/email";

type ClaimedJob={job_id:string;to_email:string;template_key:string;payload:{title?:string;body?:string;href?:string|null};attempt_number:number;dedupe_key:string};
function authorized(request:Request){const expected=process.env.CRON_SECRET;const supplied=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"")??"";if(!expected||supplied.length!==expected.length)return false;return timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))}
async function processQueue(request:Request){if(!authorized(request))return NextResponse.json({error:"Unauthorized"},{status:401});if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM)return NextResponse.json({error:"Email provider not configured"},{status:503});const admin=createAdminClient();const {data,error}=await admin.rpc("claim_notification_jobs",{p_limit:25});if(error)return NextResponse.json({error:"Queue unavailable"},{status:503});const jobs=(data as ClaimedJob[]|null)??[];let sent=0;let failed=0;await Promise.all(jobs.map(async job=>{try{const providerId=await sendNotificationEmail(job);await admin.rpc("finish_notification_job",{p_error_code:null,p_job_id:job.job_id,p_provider_message_id:providerId,p_success:true});sent++}catch(error){await admin.rpc("finish_notification_job",{p_error_code:error instanceof Error?error.message:"provider_error",p_job_id:job.job_id,p_provider_message_id:null,p_success:false});failed++}}));return NextResponse.json({claimed:jobs.length,failed,sent})}
export const dynamic="force-dynamic";
export async function GET(request:Request){return processQueue(request)}
export async function POST(request:Request){return processQueue(request)}
