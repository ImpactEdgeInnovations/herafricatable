import {ticketInvitationLinks} from "@/lib/events/ticket-invitations.mjs";
import type {EventTicket} from "@/lib/events/ticket-pdf";

export function EventTicketInvitation({ticket}:{ticket:EventTicket}) {
  const links=ticketInvitationLinks(ticket);if(!links.length)return null;
  return <section className="event-ticket-invitation" aria-labelledby="ticket-invitation-title"><div><p className="eyebrow">Optional next steps</p><h2 id="ticket-invitation-title">Keep in touch after the event</h2><p>Your ticket is ready. {ticket.guest_only?"Joining Her Africa Table is a separate choice, not a condition of attending. ":""}Community joining follows its Host’s rules.</p></div><div>{links.map(link=><a className="button button-outline" key={link.href} href={link.href}>{link.label}</a>)}</div></section>;
}
