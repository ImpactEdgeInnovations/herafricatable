"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { memberErrorMessage } from "@/lib/member-error";
import { createClient } from "@/lib/supabase/client";
import { memberStatusLabel } from "@/lib/member-language";
import { canClaimEventWaitlistPlace, type AvailableTicket, type BookingState } from "@/lib/events/booking-availability";

const bookingLabels: Record<BookingState, string> = {
  available: "Available",
  ended: "Bookings closed",
  event_full: "Event fully booked",
  not_open: "Bookings open soon",
  ticket_full: "This option is fully booked",
  unavailable: "Availability could not be checked",
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
  availabilityReady = true,
  eventFull = false,
  automaticCheckoutOpen,
  allowNewRequest = true,
}: {
  eventId: string;
  eventTitle: string;
  mode: string;
  tickets: AvailableTicket[];
  existingStatus: string | null;
  embedded?: boolean;
  eventSlug?: string;
  passReady?: boolean;
  availabilityReady?: boolean;
  eventFull?: boolean;
  automaticCheckoutOpen: boolean;
  allowNewRequest?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [ticketId, setTicketId] = useState(tickets.find((item) => item.bookingState === "available")?.id ?? "");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ticket = tickets.find((item) => item.id === ticketId && item.bookingState === "available")
    ?? tickets.find((item) => item.bookingState === "available");
  const isFree = ticket?.price_minor === 0;
  const canClaimWaitlist = allowNewRequest && canClaimEventWaitlistPlace(existingStatus, mode, tickets, availabilityReady);
  const canRequestAgain = allowNewRequest && (existingStatus === "cancelled" || canClaimWaitlist);
  async function leaveWaitlist() {
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("leave_event_waitlist", {
      p_event_id: eventId,
    });
    setBusy(false);
    setMessage(error
      ? memberErrorMessage(error, "leave the waiting list")
      : "You have left the waiting list.");
    if (!error) router.refresh();
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!allowNewRequest) {
      setMessage("New requests are paused for this account. Your earlier event record is still available.");
      return;
    }
    if (mode === "automatic" && !automaticCheckoutOpen) {
      setMessage("Online payment is paused. No charge has been made.");
      return;
    }
    if (mode !== "waitlist" && (!availabilityReady || !ticket)) {
      setMessage("We could not confirm an available place. Please refresh this page and try again.");
      return;
    }
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
            quantity: 1,
            ticketTypeId: ticket?.id,
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
    const { error } = canClaimWaitlist
      ? await supabase.rpc("request_event_place_from_waitlist", {
          p_attendee_note: note,
          p_event_id: eventId,
          p_manual_note: paymentNote,
          p_manual_reference: reference,
          p_ticket_type_id: ticket?.id ?? null,
        })
      : await supabase.rpc("create_event_registration", {
          p_attendee_note: note,
          p_event_id: eventId,
          p_manual_note: paymentNote,
          p_manual_reference: reference,
          p_quantity: 1,
          p_ticket_type_id: ticket?.id ?? null,
        });
    setBusy(false);
    setMessage(
      error
        ? memberErrorMessage(error, "submit your event registration")
        : mode === "waitlist"
          ? "You are on the waiting list. No seat is held; the event team may email you if bookings reopen."
          : isFree
            ? "Your free place request is with the event team. No payment is required."
          : "Your registration is with the event team. No automatic charge has been made.",
    );
    if (!error) router.refresh();
  }
  if (!allowNewRequest && !existingStatus)
    return (
      <div className={`registration-status-card${embedded ? " is-embedded" : ""}`}>
        <p className="eyebrow">Your place at the table</p>
        <h2>New requests are paused</h2>
        <p>This event is not accepting a new request from this account right now. No place has been reserved.</p>
      </div>
    );
  if (existingStatus && !canRequestAgain)
    return (
      <div className={`registration-status-card${embedded ? " is-embedded" : ""}`}>
        <p className="eyebrow">{existingStatus === "cancelled" ? "Request history" : "Registration received"}</p>
        <h2>{passReady ? "Your place is confirmed" : memberStatusLabel(existingStatus)}</h2>
        <p>
          {passReady
            ? "Your event pass is ready. Keep its private code with you for check-in."
            : existingStatus === "cancelled"
              ? "Your earlier request was cancelled. This account cannot make a new request while entry is paused."
            : existingStatus === "rejected"
              ? "This request was not approved. If you need help understanding the decision, contact the event team."
              : existingStatus === "waitlisted"
                ? !availabilityReady
                  ? "You are on the waiting list. We could not check whether bookings have reopened. No seat is held."
                  : mode === "manual_review" && !ticket
                    ? "You are on the waiting list. No place is available to request right now, and no seat is held."
                    : "You are on the waiting list. No seat is held. The event team may email you if bookings reopen."
                : "Your request is recorded. We’ll notify you here and by email after the event team reviews it."}
        </p>
        {passReady && eventSlug ? (
          <a className="button button-primary" href={`/events/${eventSlug}/pass`}>
            Open my event pass
          </a>
        ) : null}
        {existingStatus === "waitlisted" ? (
          <div className="registration-status-actions">
            {!availabilityReady && mode === "manual_review" ? (
              <button className="button button-outline" type="button" disabled={busy} onClick={() => router.refresh()}>
                Check again
              </button>
            ) : null}
            <button className="button button-outline" type="button" disabled={busy} onClick={() => void leaveWaitlist()}>
              {busy ? "Leaving…" : "Leave waiting list"}
            </button>
          </div>
        ) : null}
        {message ? <p className="manager-message" role="status">{message}</p> : null}
      </div>
    );
  return (
    <form className={`event-registration-form${embedded ? " is-embedded" : ""}`} onSubmit={submit}>
      <header>
        <p className="eyebrow">Request your seat</p>
        {embedded ? <h2>Choose your place</h2> : <h1>{eventTitle}</h1>}
        {canClaimWaitlist
          ? <p>Bookings have reopened. You can request a place now, but your waiting-list entry did not hold a seat.</p>
          : existingStatus === "cancelled"
            ? <p>Your earlier request was cancelled. You can request a new place while registration is open.</p>
            : null}
        {canClaimWaitlist ? (
          <button className="button button-outline" type="button" disabled={busy} onClick={() => void leaveWaitlist()}>
            {busy ? "Leaving…" : "Leave waiting list"}
          </button>
        ) : null}
        <p>
          {mode === "manual_review"
            ? !ticket
              ? "Booking options are not available right now."
              : isFree
              ? "Request a complimentary place. The event team will confirm attendance before the guest list closes."
              : "Send your ticket request and any payment reference. The event team will check it before confirming your place."
            : mode === "waitlist"
              ? "Join the waiting list. No seat is reserved; the event team may email you if bookings reopen."
              : !automaticCheckoutOpen
                ? "Online payment is paused. No card charge can begin until the event team reopens checkout."
              : "Choose your ticket and continue to Paystack's secure checkout. We confirm your place after payment succeeds."}
        </p>
        <p>One place per person. Each attendee uses her own email so she receives her own event pass.</p>
      </header>
      {mode !== "waitlist" && !ticket ? (
        <div className="manager-message" role="status">
          <p>{!availabilityReady
            ? "We could not check places right now."
            : eventFull
              ? "This event is fully booked. No new places can be requested right now."
              : tickets.length === 0
                ? "Booking options have not opened yet."
                : "No places can be requested right now. Please check back later."}</p>
          {!availabilityReady ? (
            <button className="button button-outline" type="button" onClick={() => router.refresh()}>
              Check again
            </button>
          ) : null}
        </div>
      ) : null}
      {mode !== "waitlist" ? (
        <div className="ticket-choice-list">
          {tickets.map((item) => (
            <label
              className={ticket?.id === item.id ? "selected" : item.bookingState !== "available" ? "is-unavailable" : ""}
              key={item.id}
            >
              <input
                type="radio"
                name="ticket"
                value={item.id}
                checked={ticket?.id === item.id}
                disabled={item.bookingState !== "available"}
                onChange={() => setTicketId(item.id)}
              />
              <span>
                <strong>{item.name}</strong>
                <small>{item.description}</small>
                {item.bookingState !== "available" ? <small>{bookingLabels[item.bookingState]}</small> : null}
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
            {(ticket.price_minor / 100).toLocaleString("en-KE", {
              minimumFractionDigits: 2,
            })}
          </strong>
        </div>
      ) : null}
      <button
        className="button button-primary"
        disabled={
          busy || mode === "closed" || (mode === "automatic" && !automaticCheckoutOpen) ||
          (mode !== "waitlist" && (!ticket || !availabilityReady))
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
