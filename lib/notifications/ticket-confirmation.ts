import type {EventTicket} from "@/lib/events/ticket-pdf";
export function ticketConfirmationContent(ticket:EventTicket){
  const when=new Intl.DateTimeFormat("en-KE",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:ticket.timezone}).format(new Date(ticket.starts_at));
  const time=(value:string)=>new Intl.DateTimeFormat("en-KE",{hour:"numeric",minute:"2-digit",timeZone:ticket.timezone}).format(new Date(value));
  const host=[ticket.host_name,ticket.organisation_name].filter(Boolean).join(" · ");
  return {body:`Hello ${ticket.guest_name},\n\nThank you for registering for ${ticket.event_title}. Your place is confirmed, and your PDF ticket is attached.`,
    details:[{label:"Hosted by",value:host},{label:"Date",value:when},{label:"Time",value:`${time(ticket.starts_at)} - ${time(ticket.ends_at)} (${ticket.timezone})`},{label:"Venue",value:ticket.venue},{label:"Ticket",value:ticket.ticket_type},{label:"Booking reference",value:ticket.booking_reference}],
    afterDetails:[
    ticket.arrival_info?.trim()?`Before you arrive: ${ticket.arrival_info.trim().slice(0,1200)}`:null,
    ticket.networking?`Networking: ${time(ticket.networking.starts_at)} - ${time(ticket.networking.ends_at)} (${ticket.timezone}). Optional ${ticket.networking.minutes}-minute introductions. Check in at the venue, then choose Join networking when the Host begins.`:null,
    "Show your QR ticket at the welcome desk, or use its backup code. Keep both private.",
    "You can view or download your ticket again from Profile → My tickets. Open the event page before travelling for the latest details; entry follows your current booking status.",
    "We look forward to welcoming you.\nThe Her Africa Table team",
  ].filter(Boolean).join("\n\n")};
}
export function ticketConfirmationBody(ticket:EventTicket){const content=ticketConfirmationContent(ticket);return [content.body,...content.details.map(row=>`${row.label}: ${row.value}`),content.afterDetails].join("\n\n");}
