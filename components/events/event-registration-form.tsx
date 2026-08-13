"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";
import { memberStatusLabel } from "@/lib/member-language";

type Ticket = {
  currency: string;
  description: string | null;
  id: string;
  inventory_quantity: number | null;
  name: string;
  price_minor: number;
};
export function EventRegistrationForm({
  eventId,
  eventTitle,
  mode,
  tickets,
  existingStatus,
  embedded = false,
  eventSlug,
  passReady = false,
}: {
  eventId: string;
  eventTitle: string;
  mode: string;
  tickets: Ticket[];
  existingStatus: string | null;
  embedded?: boolean;
  eventSlug?: string;
  passReady?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [ticketId, setTicketId] = useState(tickets[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ticket = tickets.find((x) => x.id === ticketId);
  const isFree = ticket?.price_minor === 0;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    if (mode === "automatic") {
      try {
        const response = await fetch("/api/payments/paystack/initialize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attendeeNote: note,
            eventId,
            quantity,
            ticketTypeId: ticketId,
          }),
        });
        const payload = (await response.json()) as {
          authorizationUrl?: string;
          error?: string;
        };
        if (!response.ok || !payload.authorizationUrl) {
          setBusy(false);
          setMessage(
            memberErrorMessage(payload.error, "start secure event checkout"),
          );
          return;
        }
        window.location.assign(payload.authorizationUrl);
        return;
      } catch (error) {
        setBusy(false);
        setMessage(memberErrorMessage(error, "start secure event checkout"));
        return;
      }
    }
    const { error } = await supabase.rpc("create_event_registration", {
      p_attendee_note: note,
      p_event_id: eventId,
      p_manual_note: paymentNote,
      p_manual_reference: reference,
      p_quantity: quantity,
      p_ticket_type_id: ticketId || null,
    });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "submit your event registration")
        : mode === "waitlist"
          ? "You are on the waitlist. We will contact you when a seat opens."
          : isFree
            ? "Your free place request is with the event team. No payment is required."
          : "Your registration is with the event team. No automatic charge has been made.",
    );
    if (!error) router.refresh();
  }
  if (existingStatus)
    return (
      <div className={`registration-status-card${embedded ? " is-embedded" : ""}`}>
        <p className="eyebrow">Registration received</p>
        <h2>{passReady ? "Your place is confirmed" : memberStatusLabel(existingStatus)}</h2>
        <p>
          {passReady
            ? "Your event pass is ready. Keep its private code with you for check-in."
            : "Your request is recorded. We’ll notify you here and by email after the event team reviews it."}
        </p>
        {passReady && eventSlug ? (
          <a className="button button-primary" href={`/events/${eventSlug}/pass`}>
            Open my event pass
          </a>
        ) : null}
      </div>
    );
  return (
    <form className={`event-registration-form${embedded ? " is-embedded" : ""}`} onSubmit={submit}>
      <header>
        <p className="eyebrow">Request your seat</p>
        {embedded ? <h2>Choose your place</h2> : <h1>{eventTitle}</h1>}
        <p>
          {mode === "manual_review"
            ? isFree
              ? "Request a complimentary place. The event team will confirm attendance before the guest list closes."
              : "Send your ticket request and any payment reference. The event team will check it before confirming your place."
            : mode === "waitlist"
              ? "Join the waitlist and we will contact you when a seat becomes available."
              : "Choose your ticket and continue to Paystack's secure checkout. We confirm your place after payment succeeds."}
        </p>
      </header>
      {mode !== "waitlist" ? (
        <div className="ticket-choice-list">
          {tickets.map((item) => (
            <label
              className={ticketId === item.id ? "selected" : ""}
              key={item.id}
            >
              <input
                type="radio"
                name="ticket"
                value={item.id}
                checked={ticketId === item.id}
                onChange={() => setTicketId(item.id)}
              />
              <span>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>
              <b>
                {item.currency}{" "}
                {(item.price_minor / 100).toLocaleString("en-KE", {
                  minimumFractionDigits: 2,
                })}
              </b>
            </label>
          ))}
        </div>
      ) : null}
      <div className="form-grid registration-fields">
        {mode !== "waitlist" ? (
          <label>
            Quantity
            <input
              type="number"
              min="1"
              max="10"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>
        ) : null}
        <label className="form-wide">
          Note for the event team
          <textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {mode === "manual_review" && !isFree ? (
          <>
            <label>
              Payment/reference number
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional until payment is made"
              />
            </label>
            <label>
              Payment note
              <input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Method, date, or context"
              />
            </label>
          </>
        ) : null}
      </div>
      {ticket && mode !== "waitlist" ? (
        <div className="registration-total">
          <span>Total</span>
          <strong>
            {ticket.currency}{" "}
            {((ticket.price_minor * quantity) / 100).toLocaleString("en-KE", {
              minimumFractionDigits: 2,
            })}
          </strong>
        </div>
      ) : null}
      <button
        className="button button-primary"
        disabled={
          busy || mode === "closed" || (mode !== "waitlist" && !ticketId)
        }
      >
        {busy
          ? "Submitting…"
          : mode === "waitlist"
            ? "Join waitlist"
            : mode === "automatic"
              ? "Continue to secure payment"
              : isFree
                ? "Request my free place"
                : "Send to the event team"}
      </button>
      {message ? (
        <p className="manager-message" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
