import type { AvailableTicket } from "@/lib/events/booking-availability";

export function EventBookingPreview({tickets,closed,closedLabel,mode}:{tickets:AvailableTicket[];closed:boolean;closedLabel:string;mode:string}) {
  return <section className="event-inline-registration" id="registration" aria-label="Member booking preview">
    <div className="event-registration-entry">
      <p className="eyebrow">Member preview</p>
      <h2>{closed ? closedLabel : mode === "waitlist" ? "Join the waiting list" : "Choose your place"}</h2>
      <p>This is a preview for a member who has not booked. No place can be reserved or payment started here.</p>
      {tickets.length ? <ul className="event-preview-tickets">{tickets.map(ticket => <li key={ticket.id}><div><strong>{ticket.name}</strong>{ticket.description ? <p>{ticket.description}</p> : null}</div><span>{ticket.price_minor === 0 ? "Free" : new Intl.NumberFormat("en-KE",{style:"currency",currency:ticket.currency}).format(ticket.price_minor / 100)}</span></li>)}</ul> : null}
      <button className="button button-primary" disabled type="button">{closed ? closedLabel : mode === "waitlist" ? "Join the waiting list" : "Book a place"}</button>
    </div>
  </section>;
}
