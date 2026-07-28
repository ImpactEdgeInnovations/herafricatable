import { redirect } from "next/navigation";

export default function AdminEventsPage() {
  redirect("/admin/operations?area=event-work#event-work");
}
