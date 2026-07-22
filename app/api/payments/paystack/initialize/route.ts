import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerPaymentEnv } from "@/lib/env";
import { initializePaystackTransaction } from "@/lib/paystack";

export async function POST(request:Request){
 try{
  const {siteUrl}=getServerPaymentEnv();
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user?.email)return NextResponse.json({error:"Authentication required"},{status:401});
  const body=await request.json() as {attendeeNote?:string;courseId?:string;eventId?:string;membershipPlanId?:string;quantity?:number;ticketTypeId?:string};
  if(!body.courseId&&!body.membershipPlanId&&(!body.eventId||!body.ticketTypeId))return NextResponse.json({error:"A membership, course or event ticket is required"},{status:400});
  const {data:orderId,error:createError}=body.membershipPlanId?await supabase.rpc("create_membership_order",{p_plan_id:body.membershipPlanId,p_manual_note:"",p_manual_reference:""}):body.courseId?await supabase.rpc("create_course_order",{p_course_id:body.courseId,p_manual_note:"",p_manual_reference:""}):await supabase.rpc("create_event_registration",{p_attendee_note:body.attendeeNote??"",p_event_id:body.eventId,p_manual_note:"",p_manual_reference:"",p_quantity:Number(body.quantity)||1,p_ticket_type_id:body.ticketTypeId});
  if(createError||!orderId)return NextResponse.json({error:createError?.message??"Order creation failed"},{status:400});
  const {data:order,error:orderError}=await supabase.from("orders").select("id,reference,total_minor,currency,event_id,order_type,order_items(course_id,membership_plan_id)").eq("id",orderId).single();
  if(orderError||!order)return NextResponse.json({error:"Order could not be loaded"},{status:500});
  try{
   const item=(order.order_items as unknown as {course_id:string|null;membership_plan_id:string|null}[]|null)?.[0];
   const initialized=await initializePaystackTransaction({email:user.email,amount:order.total_minor,currency:order.currency,reference:order.reference,callbackUrl:`${siteUrl}/api/payments/paystack/callback`,metadata:{order_id:order.id,order_type:order.order_type,event_id:order.event_id??"",course_id:item?.course_id??"",membership_plan_id:item?.membership_plan_id??""}});
   const {error:recordError}=await supabase.rpc("record_payment_initialization",{p_authorization_url:initialized.authorization_url,p_order_id:order.id,p_provider_reference:initialized.reference,p_provider_response:initialized});
   if(recordError)throw recordError;
   return NextResponse.json({authorizationUrl:initialized.authorization_url,reference:initialized.reference});
  }catch(error){
   const admin=createAdminClient();await admin.rpc("process_paystack_payment",{p_amount_minor:order.total_minor,p_currency:order.currency,p_event_type:"initialization.failed",p_payload:{message:error instanceof Error?error.message:"Initialization failed"},p_provider_event_id:`init-failed:${order.reference}`,p_reference:order.reference,p_signature_verified:true,p_status:"failed"});
   return NextResponse.json({error:"Secure checkout could not be initialized. Please retry or use manual processing if enabled."},{status:502});
  }
 }catch(error){return NextResponse.json({error:error instanceof Error&&error.message.includes("PAYSTACK_SECRET_KEY")?"Online payment is not configured yet.":"Payment initialization failed"},{status:503})}
}
