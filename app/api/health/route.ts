import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic="force-dynamic";
export async function GET(){const started=Date.now();try{const admin=createAdminClient();const {error}=await admin.from("site_event_countdown").select("id",{head:true,count:"exact"}).limit(1);if(error)throw error;return NextResponse.json({status:"ok",database:"reachable",release:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)??"local",latency_ms:Date.now()-started},{headers:{"cache-control":"no-store"}})}catch{return NextResponse.json({status:"degraded",database:"unavailable",release:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,7)??"local",latency_ms:Date.now()-started},{status:503,headers:{"cache-control":"no-store"}})}}
