import "server-only";
import {createAdminClient} from "@/lib/supabase/admin";
import {renderEventTicketPdf,ticketFilename,type EventTicket} from "@/lib/events/ticket-pdf";
import {ticketConfirmationBody,ticketConfirmationContent} from "./ticket-confirmation";

export async function prepareTicketEmail(job:{job_id:string;dedupe_key:string;template_key:string}){
  if(job.template_key!=="registration"||!/^order-status:[0-9a-f-]{36}:fulfilled$/.test(job.dedupe_key))return null;
  const {data,error}=await createAdminClient().rpc("get_event_ticket_email",{p_job_id:job.job_id});
  if(error)throw Error("ticket_attachment_unavailable");
  if(data?.not_event===true)return null;
  if(!data){const invalid=Object.assign(new Error("ticket_no_longer_valid"),{code:"TICKET_NO_LONGER_VALID"});throw invalid;}
  const ticket=data as EventTicket;
  const bytes=await renderEventTicketPdf(ticket);
  return {title:`Your ticket for ${ticket.event_title}`.slice(0,160),href:`/events/${ticket.event_slug}/pass`,body:ticketConfirmationBody(ticket),content:ticketConfirmationContent(ticket),attachment:{filename:ticketFilename(ticket.event_slug),content:Buffer.from(bytes).toString("base64"),content_type:"application/pdf"}};
}
