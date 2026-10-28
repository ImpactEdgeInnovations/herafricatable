import {createClient} from "@/lib/supabase/server";
import {renderEventTicketPdf,ticketFilename,type EventTicket} from "@/lib/events/ticket-pdf";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const privateHeaders={"Cache-Control":"private, no-store, max-age=0","X-Robots-Tag":"noindex, nofollow, noarchive","X-Content-Type-Options":"nosniff","Vary":"Cookie"};
export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
  const {slug}=await params;
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
  if(!user)return new Response("Please sign in to download your ticket.",{status:401,headers:privateHeaders});
  const {data,error}=await supabase.rpc("get_my_event_ticket",{p_slug:slug});
  if(error)return new Response("Your ticket could not load. Please try again.",{status:503,headers:privateHeaders});
  if(!data)return new Response("A confirmed booking is required for this ticket.",{status:404,headers:privateHeaders});
  try{
    const pdf=await renderEventTicketPdf(data as EventTicket);
    return new Response(Buffer.from(pdf),{headers:{...privateHeaders,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${ticketFilename(slug)}"`}});
  }catch{return new Response("Your PDF could not be prepared. Please try again.",{status:503,headers:privateHeaders});}
}
