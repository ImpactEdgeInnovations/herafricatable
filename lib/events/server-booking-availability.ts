import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  assessEventBookingAvailability,
  type AvailableTicket,
  type BookingTicket,
  type ReservationOrder,
} from "@/lib/events/booking-availability";

export async function loadEventBookingAvailability(
  eventId: string,
  capacity: number | null,
  tickets: BookingTicket[],
): Promise<{ checkFailed: boolean; eventFull: boolean; tickets: AvailableTicket[] }> {
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
