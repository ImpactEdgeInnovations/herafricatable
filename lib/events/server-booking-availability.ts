import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assessEventBookingAvailability,
  type AvailableTicket,
  type BookingTicket,
  type ReservationOrder,
} from "@/lib/events/booking-availability";

export type EventBookingAvailability = {
  checkFailed: boolean;
  eventFull: boolean;
  tickets: AvailableTicket[];
};

export async function loadEventBookingAvailability(
  eventId: string,
  capacity: number | null,
  tickets: BookingTicket[],
): Promise<EventBookingAvailability> {
  try {
    const service = createAdminClient();
    const orders: ReservationOrder[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await service.from("orders")
        .select("id,status,order_items(ticket_type_id,quantity)")
        .eq("event_id", eventId).eq("order_type", "event")
        .order("id").range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Reservation lookup failed: ${error.code ?? "unknown"}`);
      orders.push(...((data ?? []) as ReservationOrder[]));
      if ((data ?? []).length < pageSize) break;
    }
    return { ...assessEventBookingAvailability(tickets, orders, capacity), checkFailed: false };
  } catch (error) {
    console.error("Event availability check failed", error);
    return {
      checkFailed: true,
      eventFull: false,
      tickets: tickets.map((ticket) => ({ ...ticket, bookingState: "unavailable" })),
    };
  }
}

export async function loadEventBookingAvailabilityBatch(
  events: { id: string; capacity: number | null }[],
  ticketsByEvent: Map<string, BookingTicket[]>,
): Promise<Map<string, EventBookingAvailability>> {
  const results = new Map<string, EventBookingAvailability>();
  if (!events.length) return results;
  try {
    const service = createAdminClient();
    const ordersByEvent = new Map<string, ReservationOrder[]>();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await service.from("orders")
        .select("event_id,status,order_items(ticket_type_id,quantity)")
        .in("event_id", events.map((event) => event.id))
        .eq("order_type", "event")
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Reservation lookup failed: ${error.code ?? "unknown"}`);
      for (const row of data ?? []) {
        const existing = ordersByEvent.get(row.event_id) ?? [];
        existing.push(row as ReservationOrder);
        ordersByEvent.set(row.event_id, existing);
      }
      if ((data ?? []).length < pageSize) break;
    }
    for (const event of events) {
      results.set(event.id, {
        ...assessEventBookingAvailability(
          ticketsByEvent.get(event.id) ?? [],
          ordersByEvent.get(event.id) ?? [],
          event.capacity,
        ),
        checkFailed: false,
      });
    }
  } catch (error) {
    console.error("Event directory availability check failed", error);
    for (const event of events) {
      results.set(event.id, {
        checkFailed: true,
        eventFull: false,
        tickets: (ticketsByEvent.get(event.id) ?? []).map((ticket) => ({
          ...ticket,
          bookingState: "unavailable",
        })),
      });
    }
  }
  return results;
}
