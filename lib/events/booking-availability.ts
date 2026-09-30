export type BookingTicket = {
  currency: string;
  description: string | null;
  id: string;
  inventory_quantity: number | null;
  name: string;
  price_minor: number;
  sales_end_at: string | null;
  sales_start_at: string | null;
};

export type BookingState =
  | "available"
  | "event_full"
  | "ticket_full"
  | "not_open"
  | "ended"
  | "unavailable";

export type AvailableTicket = BookingTicket & { bookingState: BookingState };

export type ReservationOrder = {
  order_items: { quantity: number; ticket_type_id: string }[] | null;
  status: string;
};

export function assessEventBookingAvailability(
  tickets: BookingTicket[],
  orders: ReservationOrder[],
  capacity: number | null,
  now = new Date(),
) {
  const reservedByTicket = new Map<string, number>();
  let reservedSeats = 0;
  for (const order of orders) {
    if (["cancelled", "expired", "refunded"].includes(order.status)) continue;
    for (const item of order.order_items ?? []) {
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        throw new Error("Event reservation quantity is invalid");
      }
      reservedSeats += quantity;
      reservedByTicket.set(item.ticket_type_id,
        (reservedByTicket.get(item.ticket_type_id) ?? 0) + quantity);
    }
  }
  const eventFull = capacity !== null && reservedSeats >= capacity;
  const current = now.getTime();
  return {
    eventFull,
    tickets: tickets.map((ticket): AvailableTicket => {
      let bookingState: BookingState = "available";
      const opens = ticket.sales_start_at
        ? new Date(ticket.sales_start_at).getTime() : null;
      const closes = ticket.sales_end_at
        ? new Date(ticket.sales_end_at).getTime() : null;
      if (eventFull) bookingState = "event_full";
      else if (ticket.inventory_quantity !== null &&
        (reservedByTicket.get(ticket.id) ?? 0) >= ticket.inventory_quantity) {
        bookingState = "ticket_full";
      } else if (opens !== null && (!Number.isFinite(opens) || opens > current)) {
        bookingState = "not_open";
      } else if (closes !== null && (!Number.isFinite(closes) || closes <= current)) {
        bookingState = "ended";
      }
      return { ...ticket, bookingState };
    }),
  };
}
