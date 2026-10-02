import type { AdminEvent } from "@/components/admin/event-manager";

export function exactArrivalReady(event: AdminEvent | undefined): boolean {
  if (!event) return false;
  if (event.format === "virtual") return true;
  return Boolean(event.venues?.name?.trim() && event.venues?.city?.trim() &&
    event.venues?.country?.trim() &&
    (event.venues?.address_line?.trim() || event.venues?.map_url?.trim()));
}
